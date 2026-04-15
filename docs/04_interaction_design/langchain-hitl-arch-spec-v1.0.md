# LangChain HITL 系统架构规范 v1.0

**阶段**：04_interaction_design（跨阶段汇总）  
**输出方**：Team Lead  
**日期**：2026-04-14  
**版本**：v1.0  
**子文档来源**：
- `docs/06_system_architecture/backend-service-arch-spec.md`（Teammate 1 — 后端架构视角）
- `docs/06_system_architecture/langchain-hitl-workflow-spec.md`（Teammate 2 — LangChain HITL 视角）

---

## 一、架构定位与范围

本文档是法律文档智能审核系统的**后端 + HITL 工作流一体化架构规范**，描述从文档上传到人工审核完成的完整链路。

### 1.1 核心架构原则

| 原则 | 说明 |
|------|------|
| 后端为唯一权威 | 所有业务规则、状态流转、HITL 触发判断只能由后端执行，前端不得绕过 |
| 状态机单向流转 | ReviewTask 11 态状态机路径不可逆，终态不可再流转 |
| LangGraph 驱动 HITL | 人机交互环节通过 LangGraph `interrupt()` / `Command(resume=...)` 机制实现，图状态自动持久化 |
| 审计日志不可变 | `audit_logs` 表只允许 INSERT，禁止 UPDATE / DELETE |
| 向量库版本绑定 | 每次审核任务与创建时的向量库版本强绑定，支持审计重现 |

### 1.2 系统分层总览

```
┌──────────────────────────────────────────────────────────────────┐
│                         前端（Frontend）                          │
│  文件上传 UI / 进度展示 / PDF 高亮 / 人工审核操作面板              │
│  ← WebSocket 实时推送 ← 后端                                      │
├──────────────────────────────────────────────────────────────────┤
│                     API 网关层（FastAPI）                         │
│  REST API（HTTP） + WebSocket（实时推送）                         │
├──────────────────────────────────────────────────────────────────┤
│                       业务逻辑层                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────┐  │
│  │  上传服务    │ │  解析服务    │ │  自动审核服务  │ │ 查询服务 │  │
│  └─────────────┘ └─────────────┘ └──────────────┘ └──────────┘  │
│         ↓               ↓               ↓                        │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │               LangGraph HITL 工作流引擎                    │    │
│  │  StateGraph → interrupt() → 等待 → Command(resume=...)    │    │
│  └──────────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────────┤
│                      基础能力层                                   │
│  状态机引擎 / Celery 任务队列 / WebSocket 推送 / 审计日志写入      │
├──────────────────────────────────────────────────────────────────┤
│                       存储层                                      │
│  PostgreSQL（业务数据 + Checkpointer）/ S3对象存储 / Qdrant向量库  │
│  Redis（队列 + 缓存）                                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 二、文档处理链路设计

### 2.1 完整处理流程

```
用户上传文档
     ↓
[上传服务]
  POST /api/upload/init    → 返回 chunk_upload_id + 预签名 URL
  PUT  /api/upload/chunk   → 分片上传（≥20MB 时，并发 ≤3，每片 ≤5MB）
  POST /api/upload/complete → 合并校验 + 创建 Document 记录 + 创建 ReviewTask
     ↓ status: uploaded
[Celery Worker: document_parse 队列]
  多引擎解析：PyMuPDF/pdfplumber → PaddleOCR → 降级人工
  OCR 质量门控：≥85% 通过 / 70-84% 警告继续 / <70% → parse_failed（终态）
     ↓ status: parsed
[LangGraph 工作流启动]
  auto_review_node：三层流水线（格式校验 / 条款识别 / LLM 深度分析）
     ↓ status: auto_reviewed
  hitl_trigger_check：判断是否需要 HITL
  ├─ 无需人工 → finalize → completed（终态）
  └─ 需要人工（风险≥High / 置信度<50% / 文档类型未知）
       ↓ status: human_reviewing
     assign_reviewer_node
       ↓
     human_decision_node [INTERRUPT 暂停，等待审核人操作]
       ↓ [Command(resume=...) 恢复]
     apply_decisions_node
     ├─ 所有 Critical/High 已处理 → finalize → completed（终态）
     └─ 仍有未处理条目 → 回到 human_decision_node（循环）
```

### 2.2 文件校验规范（后端强制）

| 校验项 | 规则 | 失败行为 |
|-------|------|---------|
| 文件格式 | 仅允许 `application/pdf`、`docx`、`doc` | 400，`UNSUPPORTED_FORMAT` |
| 文件大小 | 单文件 ≤ 50MB | 400，`FILE_TOO_LARGE` |
| 文件完整性 | 所有分片 ETag 收齐，MD5 校验一致 | 400，`FILE_CORRUPTED` |
| 禁止类型检测 | 融资股权文件关键词匹配（规则集在配置文件维护） | 403，`DOCUMENT_TYPE_FORBIDDEN`，不创建任何记录 |

**前端校验不可替代后端校验**，后端必须对所有上传进行独立二次校验。

---

## 三、LangGraph HITL 工作流规范

### 3.1 图状态定义（ReviewState）

```
ReviewState（TypedDict）
├── document_id: str                          # 文档唯一标识
├── review_task_id: str                       # ReviewTask 主键
├── current_status: str                       # 当前状态（覆盖型字段）
├── document_content: str                     # 解析后文档文本
├── document_metadata: dict                   # {filename, file_type, page_count, ocr_quality_score}
├── risk_items: Annotated[list, operator.add] # 风险项（Reducer 累积追加）
├── human_reviews: Annotated[list, merge_human_reviews] # 人工审核记录（自定义 Reducer）
├── assigned_reviewer_id: str | None          # 当前分配的审核人
├── vector_db_version: str                    # 绑定的向量库版本
├── decision_log: Annotated[list, operator.add] # 决策审计日志（Reducer 累积）
└── completed_at: str | None                  # 审核完成时间
```

**Reducer 策略**：
- `operator.add`：risk_items / decision_log 等列表型字段，新节点产出的列表自动追加
- 自定义 `merge_human_reviews`：人工操作记录按时间戳排序并去重
- 无 Reducer：current_status / assigned_reviewer_id 等，直接覆盖写入

### 3.2 七个核心节点

| 节点 | 职责 | 是否触发 interrupt |
|------|------|-----------------|
| `parse_node` | 多引擎解析，产出 document_content | 仅在 OCR 质量极低时可选触发 |
| `auto_review_node` | 三层自动审核，产出 risk_items | 否 |
| `hitl_trigger_check` | 判断是否需要人工介入 | 否（条件路由节点） |
| `assign_reviewer_node` | 选择审核人，写入 assigned_reviewer_id | 否 |
| `human_decision_node` | **核心中断点**，暂停等待人工输入 | **是（必触发）** |
| `apply_decisions_node` | 处理人工决策，更新 risk_items 状态 | 否（判断是否继续循环） |
| `finalize_node` | 重算风险分，生成审核报告，写入 completed_at | 否 |

### 3.3 HITL 触发条件

| 触发条件 | 触发类型 |
|---------|---------|
| 任一风险项 `risk_level >= High`（≥6分） | 系统强制 |
| 任一风险项 `confidence < 50%` | 系统强制 |
| `document_metadata.file_type == "unknown"` | 系统强制 |

以上任意一条满足，`hitl_trigger_check` 即将状态流转至 `human_reviewing` 并进入 HITL 循环。

### 3.4 中断负载（Interrupt Payload）

`human_decision_node` 调用 `interrupt()` 时传递以下标准 JSON 负载：

```json
{
  "action": "human_review_required",
  "task_id": "<review_task_id>",
  "operator_id": "<assigned_reviewer_id>",
  "risk_items": [
    {
      "id": "<risk_item_id>",
      "type": "<risk_type>",
      "level": "<critical|high|medium|low|info>",
      "confidence": 0.45,
      "confidence_category": "<fact|clause|legal>",
      "source_text": "<原文引用>",
      "location_page": 3,
      "location_paragraph": 12,
      "reasoning": "<AI 推理说明>"
    }
  ]
}
```

### 3.5 恢复协议（Resume Protocol）

审核人完成操作后，后端通过以下 JSON 格式调用 `Command(resume=...)` 恢复图执行：

```json
{
  "decisions": [
    {
      "risk_item_id": "<risk_item_id>",
      "action": "approve | edit | reject | annotate",
      "comment": "<审核意见，驳回时必填>",
      "edited_content": "<编辑后内容，action=edit 时必填>",
      "operated_at": "<ISO 8601 时间戳>"
    }
  ],
  "operator_id": "<审核人 ID>"
}
```

**四类操作规范**：

| 操作 | 说明 | 后端校验要求 |
|------|------|------------|
| `approve` | 同意 AI 的风险评定 | comment 可选 |
| `edit` | 修改风险等级或描述 | `edited_content` 必填；后端记录 `old_value` 和 `new_value` |
| `reject` | 驳回该风险项（认为误报） | `comment` 必填，≥ 10 字符 |
| `annotate` | 添加批注但不改变结论 | `comment` 必填 |

**恢复规则**：
1. 必须使用与中断相同的 `thread_id`，格式：`"review-task-{review_task.id}"`
2. `decisions` 需包含当前批次所有 Critical/High 条目的操作
3. 每次 resume 对应一次 interrupt，`apply_decisions_node` 检查是否仍有未处理项，决定是否再次循环

---

## 四、数据持久化设计

### 4.1 核心数据实体

**关系型数据库（PostgreSQL）— 8 张核心表**：

| 表名 | 实体 | 关键字段 |
|------|------|---------|
| `users` | 用户 | `id`, `email`（唯一），`role` |
| `documents` | 文档 | `id`, `file_format`, `storage_path`, `ocr_quality_score`, `parse_engine_used` |
| `review_tasks` | 审核任务（状态机主体） | `id`, `document_id`（唯一），`status`, `assigned_user_id`, `vector_db_version`, `sla_deadline` |
| `risk_items` | 风险识别结果 | `id`, `task_id`, `risk_level`, `confidence`, `confidence_category`, `reviewer_status` |
| `clause_extractions` | 条款提取 | `id`, `task_id`, `clause_type` |
| `source_references` | 法规来源引用 | `id`, `risk_item_id` |
| `human_reviews` | 人工操作记录 | `id`, `task_id`, `reviewer_id`, `action`, `old_value`, `new_value`, `operated_at` |
| `audit_logs` | 不可变审计日志 | `id`（BIGSERIAL），`task_id`, `event_type`, `actor_type`, `old_value`, `new_value` |

**审计日志写入保护**：`audit_logs` 表的数据库用户权限仅允许 `INSERT`，不授予 `UPDATE` / `DELETE`，禁止 ORM 的 `update()` / `delete()` 操作该表。

**其他存储**：

| 存储 | 用途 | 规范 |
|------|------|------|
| 对象存储（S3 兼容） | 原始文档文件 | `docs-staging`（分片临时）/ `docs-permanent`（正式），前端访问通过后端颁发预签名 URL（15 分钟有效） |
| 向量数据库（Qdrant） | 文档语义向量，用于 Layer 3 LLM 审核 | 按 `document_id` 分命名空间；每次 ReviewTask 绑定创建时的 `vector_db_version` |
| Redis | Celery 队列 + 分片上传临时索引 | `upload:{chunk_upload_id}:chunks` 键存分片 ETag 映射 |

### 4.2 LangGraph Checkpointer 配置

| 环境 | Checkpointer | 说明 |
|------|-------------|------|
| 本地开发 | `InMemorySaver` | 进程内存，重启丢失，仅供开发调试 |
| 生产环境 | `PostgresCheckpointer` | 持久化到 PostgreSQL，支持分布式，事务安全 |

**Thread ID 规范**：
- 格式：`"review-task-{review_task.id}"`（使用 ReviewTask UUID）
- 同一 review_task 的所有中断和 resume 必须使用相同 thread_id
- Checkpointer 和业务数据库可复用同一 PostgreSQL 实例，使用不同的 schema

---

## 五、ReviewTask 状态机

### 5.1 完整 11 态定义

| 状态值 | 类型 | 语义 |
|-------|------|------|
| `uploaded` | 中间态 | 文件已上传，等待解析 |
| `parsing` | 中间态 | 多引擎解析进行中 |
| `parsed` | 中间态 | 解析完成，等待自动审核 |
| `parse_failed` | **终态** | 解析失败（OCR 不足 / 文件损坏） |
| `auto_reviewing` | 中间态 | 三层自动审核流水线进行中 |
| `auto_review_failed` | 可恢复失败态 | 自动审核失败（超时 / 系统错误），可重试一次或升级人工 |
| `auto_reviewed` | 中间态 | 自动审核完成，等待 HITL 判断 |
| `human_reviewing` | 中间态 | 已触发 HITL，等待人工审核（LangGraph interrupt 暂停中） |
| `human_review_failed` | 可恢复失败态 | 人工审核阶段系统异常，可重新分配 |
| `completed` | **终态** | 审核流程完成 |
| `rejected` | **终态** | 任务被整体驳回 |

### 5.2 合法转移路径

```
uploaded          → parsing
parsing           → parsed | parse_failed（终态）| rejected（终态）
parsed            → auto_reviewing | rejected（终态）
auto_reviewing    → auto_reviewed | auto_review_failed | rejected（终态）
auto_review_failed→ auto_reviewing（最多重试1次）| human_reviewing | rejected（终态）
auto_reviewed     → completed（终态，无需HITL）| human_reviewing
human_reviewing   → completed（终态）| human_review_failed | rejected（终态）
human_review_failed→ human_reviewing（重新分配）| rejected（终态）
```

**`rejected` 可从任意非终态流入**（用户主动驳回或系统拒绝）。

### 5.3 状态与 LangGraph 节点的对应关系

| 状态 | 触发节点 | 备注 |
|------|---------|------|
| `parsing` | `parse_node` 启动时写入 | |
| `parsed` | `parse_node` 成功完成时写入 | |
| `auto_reviewing` | `auto_review_node` 启动时写入 | |
| `auto_reviewed` | `auto_review_node` 完成时写入 | |
| `human_reviewing` | `hitl_trigger_check` 判断为需要人工时写入 | |
| `completed` | `finalize_node` 完成时写入 | |

**注**：LangGraph 中的 `current_status` 字段与数据库 `review_tasks.status` 保持双向同步，每次节点完成时后端写库，确保数据库是业务状态的唯一权威来源。

---

## 六、后端 API 关键接口规范

### 6.1 上传相关接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload/init` | 初始化分片上传，返回 `chunk_upload_id` 和预签名 URL |
| PUT | `/api/upload/chunk` | 上传单个分片，返回 ETag |
| POST | `/api/upload/complete` | 合并分片，创建 Document + ReviewTask，触发解析队列 |

### 6.2 任务查询接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks/{task_id}` | 查询 ReviewTask 状态及完整信息 |
| GET | `/api/tasks/{task_id}/risk-items` | 查询风险项列表（含分页、按风险等级筛选） |
| GET | `/api/tasks/{task_id}/result` | 查询最终审核报告（仅 `completed` 状态可访问） |

### 6.3 HITL 操作接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tasks/{task_id}/review` | 提交人工审核决策（后端调用 LangGraph `Command(resume=...)`） |
| POST | `/api/tasks/{task_id}/reject` | 整体驳回任务 |

**`/api/tasks/{task_id}/review` 后端校验要求**：
1. `task_id` 存在且当前状态为 `human_reviewing`
2. 请求者必须是 `assigned_user_id` 对应的审核人
3. 每条 `reject` 操作的 `comment` 字段 ≥ 10 字符
4. 所有提交的 `risk_item_id` 必须属于该 `task_id`
5. 操作提交后写入 `human_reviews` 表并追加 `audit_logs`，然后调用 `Command(resume=...)`

### 6.4 WebSocket 事件规范

所有 WebSocket 事件统一格式：

```json
{
  "event": "<事件名>",
  "task_id": "<ReviewTask UUID>",
  "stage": "<当前阶段，可选>",
  "progress": 0,
  "message": "<用户可读文案>"
}
```

| 事件名 | 触发时机 | 阶段 progress |
|-------|---------|--------------|
| `upload_progress` | 分片累计到进度节点 | 0–40 |
| `parse_progress` | 解析引擎工作中 | 40–70 |
| `quality_check` | OCR 质量门控完成 | 70–85 |
| `parse_complete` | 解析成功 | 100 |
| `parse_failed` | 解析失败 | — |
| `auto_review_progress` | 自动审核各层完成 | — |
| `hitl_required` | HITL 判断触发 | — |
| `review_completed` | 整个审核流程完成 | — |

---

## 七、技术选型

| 层次 | 技术选型 | 选型理由 |
|------|---------|---------|
| Web 框架 | FastAPI | 原生 async、自动 OpenAPI 文档、WebSocket 支持 |
| 异步任务队列 | Celery + Redis | 成熟可靠，支持优先级队列和任务重试 |
| 数据库 | PostgreSQL 16 | 事务安全、JSONB 支持、作为 LangGraph Checkpointer 存储 |
| 对象存储 | S3 兼容存储 | 支持分片上传、预签名 URL、SSE 加密 |
| 向量数据库 | Qdrant | 支持命名空间隔离，适合多租户法律文档场景 |
| OCR 引擎 | PaddleOCR（中文合同优化版） | 中文识别率高，支持版面还原 |
| PDF 解析 | PyMuPDF（优先）/ pdfplumber（备用） | 速度快、文本提取质量高 |
| HITL 框架 | LangGraph（LangChain 生态） | 原生支持 interrupt/resume、Checkpointer、StateGraph |
| 依赖管理 | uv | 项目规范强制要求，禁止使用 pip / poetry |

---

## 八、关键约束与禁止事项

| 约束 | 强制级别 | 来源 |
|------|---------|------|
| HITL 触发判断只能由后端执行 | **强制** | problem_modeling |
| 状态机只能单向流转，终态不可逆 | **强制** | problem_modeling |
| 原始文档内容不直接嵌入 System Prompt | **强制** | problem_modeling |
| `confidence_category` 由后端计算，前端不自行计算 | **强制** | frontend-backend-boundary-spec |
| 审计日志只追加，`audit_logs` 表禁止 UPDATE/DELETE | **强制** | problem_modeling |
| ReviewTask 必须绑定向量库版本号 | **强制** | problem_modeling |
| 融资股权文件必须硬拦截，不进入任何审核流程 | **强制** | problem_modeling |
| 后端必须独立校验前端提交数据 | **强制** | frontend-backend-boundary-spec |
| LangGraph thread_id 格式必须为 `"review-task-{review_task.id}"` | **强制** | 本文档 |
| 生产环境 Checkpointer 必须使用 PostgresCheckpointer | **强制** | 本文档 |

---

*本文档由 Team Lead 汇总自 Teammate 1（后端架构）与 Teammate 2（LangChain HITL）的调研产出，作为后续后端实现计划（`docs/10_backend_plan/`）的设计基准。*
