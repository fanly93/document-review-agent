# 前后端功能边界规范

**阶段**：06_system_architecture  
**日期**：2026-04-14  
**版本**：v1.0  
**依据文档**：
- `docs/03_problem_modeling/problem_modeling.md`
- `docs/04_interaction_design/interactive-design-spec-v1.0.md`
- `docs/06_system_architecture/frontend-design-spec-v1.0.md`

---

## 一、总体职责划分

| 维度 | 前端（Frontend）| 后端（Backend）|
|-----|--------------|--------------|
| 核心定位 | 交互呈现层：展示状态、采集用户操作、驱动 UI 流转 | 业务逻辑层：执行规则判断、状态流转、数据持久化、AI 调用 |
| 数据来源 | 从后端 API / WebSocket 获取，不自行生成业务数据 | 所有业务数据的权威来源 |
| 状态管理 | 管理 UI 本地状态（表单、展开折叠、加载态）；不持久化业务状态 | 管理所有业务状态（ReviewTask 状态机等），持久化到数据库 |
| 规则执行 | 仅做前端快速校验（格式、大小），不执行业务规则 | 所有业务规则的唯一执行方，前端校验不可替代后端校验 |
| 安全 | 不存储任何密钥、不直接访问数据库 | 执行身份认证、权限校验、Prompt Injection 防护 |

---

## 二、前端负责的功能

### 2.1 用户输入采集与客户端校验

| 功能 | 说明 | 边界约束 |
|-----|------|---------|
| 文件格式校验 | 仅允许 `.pdf`、`.docx`、`.doc` | 快速拦截，不提交后端；但后端仍须二次校验 |
| 文件大小校验 | 单文件 > 50MB 直接拦截 | 同上 |
| 分片上传切割 | ≥ 20MB 文件按 5MB/片切割，控制并发数 ≤ 3 | 切割逻辑在前端执行；分片 ID 由后端签发 |
| 驳回理由字符数校验 | 单条驳回 ≥ 10 字符；整体驳回 ≥ 20 字符 | 提交前本地校验；后端仍须校验 |
| 批注内容输入 | 批注文本采集 | 提交后端持久化 |

### 2.2 UI 状态与交互逻辑

| 功能 | 说明 | 边界约束 |
|-----|------|---------|
| WebSocket 连接管理 | 建立/断线重连/销毁 WS 连接 | Channel 为 `task_id`，由后端指定 |
| 进度条渲染 | 将 WebSocket 事件的 `progress` 字段映射为 UI 进度条 | 进度值来自后端，前端只做视觉映射 |
| PDF.js 渲染与高亮 | 渲染 PDF 内容，叠加高亮标注层 | 高亮位置（页码+段落）由后端提供，前端只执行定位 |
| 双视图联动 | 点击风险条目触发 PDF 滚动+高亮 | 联动逻辑在前端；定位数据来自后端 |
| 完成审核按钮启用状态 | 本地统计已处理的 Critical/High 条目数 | 仅控制按钮可点击，最终完成判断由后端执行 |
| 错误提示展示 | Toast / 模态弹窗 / 页面级错误区块 | 错误来源为后端返回 code，前端根据 code 选择展示形式 |
| 置信度颜色渲染 | 根据 `confidence_category` 字段渲染颜色 | 字段值来自后端，**前端不自行计算类别** |
| 路由守卫 | 根据任务状态控制页面访问权限 | 状态来自后端，前端只做重定向；不可替代后端权限校验 |
| 操作按钮状态切换 | 同意/编辑/驳回后切换条目视觉状态（reviewer_status） | 本地乐观更新，以后端最终响应为准 |

### 2.3 前端明确不负责的功能

> 以下功能**不得在前端实现**，必须由后端执行：

- ❌ HITL 触发判断（是否需要人工审核）
- ❌ 置信度类别计算（`confidence_category` 字段）
- ❌ 审核状态流转（状态机路径执行）
- ❌ 完成审核的条件校验（Critical/High 全处理的最终判断）
- ❌ SLA 超时监控与催办通知发送
- ❌ 审计日志写入
- ❌ Prompt Injection 防护（原始文档内容隔离）
- ❌ 向量库版本绑定

---

## 三、后端负责的功能

### 3.1 文档处理

| 功能 | 说明 |
|-----|------|
| 分片上传协调 | 签发分片预签名 URL，接收并合并各片，返回 `chunk_upload_id` |
| 文档格式二次校验 | 接收文件后再次校验格式合法性，不依赖前端校验结果 |
| 融资股权文件硬拦截 | 识别到禁止类型后返回硬拦截错误码，不进入任何审核流程 |
| 多引擎文档解析 | 顺序执行直取 → PaddleOCR → 降级人工的解析策略 |
| OCR 质量门控 | 计算 `ocr_quality_score`，判断是否通过（≥85%）、警告（70-84%）或降级（<70%） |
| 解析进度推送 | 通过 WebSocket 推送 `upload_progress`、`parse_progress`、`quality_check`、`parse_complete`、`parse_failed` 事件 |

### 3.2 自动审核

| 功能 | 说明 |
|-----|------|
| 三层审核执行 | Layer1（格式+分类）→ Layer2（规则匹配）→ Layer3（LLM 深度分析）顺序执行 |
| 置信度分级计算 | 计算每条 `RiskItem` 的 `confidence`（数值）和 `confidence_category`（fact/clause/legal） |
| HITL 触发判断 | 检查是否满足 HITL 触发条件（Critical/High 风险、置信度<50%、未知类型）；满足则流转至 `human_reviewing` |
| 审核进度推送 | 通过 WebSocket 推送各层进度事件（Layer 1/2/3 各独立推送） |
| 审核结果持久化 | 将 `RiskItem`、`ClauseExtraction`、`SourceReference` 写入数据库 |
| 向量库版本绑定 | 创建 `ReviewTask` 时写入当前 `vector_db_version` |

### 3.3 HITL 人工审核

| 功能 | 说明 |
|-----|------|
| 审核任务分配 | 将 `human_reviewing` 任务分配给对应审核人 |
| 操作合法性校验 | 接收前端操作请求后，校验操作类型合法性（状态匹配、字段合法） |
| 编辑操作审计 | 记录 5 字段完整审计：`edited_field`、`original_value`、`new_value`、操作人 ID、时间戳 |
| 完成审核校验 | 校验所有 Critical 和 High 风险条目均已处理（approve/edit/reject_item），校验通过后流转至 `completed` |
| 整体任务驳回 | 接收驳回请求后立即执行状态流转至 `rejected`（终态），写入完整审计日志 |
| SLA 监控 | 每 5 分钟扫描超期 `human_reviewing` 任务；30 分钟触发催办；60 分钟触发重新分配 |
| 质量监控 | 检测异常审核行为（审核总时长<3分钟、全部同意连续≥5次），触发后台告警 |

### 3.4 数据提供

| 功能 | 说明 |
|-----|------|
| 审核状态查询 | 返回 `ReviewTask` 当前状态及完整状态流转历史 |
| 风险列表查询 | 返回 `RiskItem` 列表，含 `confidence_category`、`reviewer_status` 等字段 |
| 来源引用查询 | 返回 `SourceReference` 完整数据（法规路径、引用文本） |
| 事实字段查询 | 返回 `ClauseExtraction` 结构化数据（合同主体、金额、日期等） |
| 审计日志查询 | 返回不可变审计日志，支持分页 + 按任务ID/操作人/时间范围过滤 |
| PDF 段落定位数据 | 返回每条 `RiskItem` 的页码+段落坐标，供前端 PDF.js 定位高亮 |

### 3.5 系统基础能力

| 功能 | 说明 |
|-----|------|
| 审计日志追加写入 | 所有状态变更、人工操作写入不可变日志（只追加，不修改/删除） |
| Prompt Injection 防护 | 原始文档内容不直接嵌入 System Prompt，由后端执行内容隔离 |
| 身份认证与权限 | 验证用户身份，校验操作权限（如 HITL 页面仅分配的审核人可操作） |

---

## 四、数据归属边界

### 4.1 数据由后端提供（前端只读）

| 数据 | 后端实体 | 前端使用方式 |
|-----|---------|------------|
| 任务状态 | `ReviewTask.status` | 驱动页面路由和 UI 状态 |
| 整体风险评分 | `ReviewTask.overall_risk_score` | 展示仪表盘 |
| 风险条目列表 | `RiskItem[]` | 渲染 Level 3 风险列表 |
| 置信度类别 | `RiskItem.confidence_category` | 决定颜色渲染，**不可前端计算** |
| 置信度数值 | `RiskItem.confidence` | 展示百分比 |
| 原文定位坐标 | `RiskItem.location`（页码+段落） | PDF.js 高亮定位 |
| AI 推理说明 | `RiskItem.reasoning` | low confidence 时必展示 |
| 来源引用 | `SourceReference[]` | 展示折叠引用面板 |
| 结构化事实字段 | `ClauseExtraction[]` | 展示 FactExtractionPanel |
| 审核人操作状态 | `RiskItem.reviewer_status` | 控制条目视觉状态和操作按钮 |
| 审计日志 | `AuditLog[]` | 只读展示 |
| OCR 质量分 | `Document.ocr_quality_score` | 展示质量警告 |
| 解析引擎信息 | `Document.parse_engine_used` | 展示解析说明 |
| SLA 截止时间 | `ReviewTask.sla_deadline` | 展示 SLA 倒计时 |

### 4.2 数据由前端发起写入（后端持久化）

| 操作 | 前端发送内容 | 后端校验内容 |
|-----|------------|------------|
| 提交文件上传 | 文件二进制数据、文件名、大小 | 格式合法性、大小限制 |
| 提交单条同意 | `task_id`、`risk_item_id`、`action=approve` | 任务状态合法性、条目存在性 |
| 提交单条编辑 | `task_id`、`risk_item_id`、`action=edit`、编辑字段值 | 字段合法性、原值一致性 |
| 提交单条驳回 | `task_id`、`risk_item_id`、`action=reject_item`、`reason` | 原因长度 ≥ 10 字符 |
| 提交批注 | `task_id`、`risk_item_id`（可选）、`action=annotate`、`content` | 内容非空 |
| 提交完成审核 | `task_id` | 所有 Critical/High 条目均已处理 |
| 提交整体驳回 | `task_id`、`action=reject_task`、`reason` | 原因长度 ≥ 20 字符；状态合法性 |

### 4.3 前端本地状态（不持久化、不发送后端）

| 本地状态 | 说明 |
|---------|------|
| UI 展开/折叠状态 | 风险条目展开、来源引用折叠等 |
| 过滤/排序参数 | 风险列表的当前过滤/排序选项 |
| PDF 当前缩放/页码 | PDFViewer 的视图状态 |
| 表单输入中间状态 | 编辑表单、批注输入框的未提交内容 |
| WebSocket 连接句柄 | 内存中管理，不持久化 |
| 完成按钮启用计数 | 本地统计已处理条目数（以后端响应为权威） |

---

## 五、操作流程边界

### 5.1 文档上传流程

```
前端                                    后端
  │                                       │
  ├── 客户端格式/大小校验                    │
  │   （不通过则拦截，不发请求）             │
  │                                       │
  ├── POST /api/upload/init              ──►│ 返回分片预签名 URL + chunk_upload_id
  │                                       │
  ├── PUT 分片数据（≥20MB）              ──►│ 接收分片，暂存
  │                                       │
  ├── POST /api/upload/complete          ──►│ 合并分片，格式二次校验，创建 Document
  │                                       │    融资股权文件 → 硬拦截
  │                                       │    合法 → 创建 ReviewTask，推进状态机
  │                                       │
  │◄── WebSocket: upload_progress(0-40%) ──┤
  │◄── WebSocket: parse_progress(40-70%)──┤ 执行多引擎解析
  │◄── WebSocket: quality_check(70-85%) ──┤ OCR 质量门控
  │◄── WebSocket: parse_complete(100%)  ──┤ 解析完成，状态 → parsed
```

### 5.2 自动审核流程

```
前端                                    后端
  │                                       │
  │◄── WebSocket: auto_review_start     ──┤ 状态 → auto_reviewing，开始 Layer1
  │◄── WebSocket: layer1_complete        ──┤ Layer1 完成（<1s）
  │◄── WebSocket: layer2_progress        ──┤ Layer2 进行中（3-10s）
  │◄── WebSocket: layer3_progress        ──┤ Layer3 进行中（10-30s）
  │◄── WebSocket: auto_review_complete ──┤ 状态 → auto_reviewed
  │                                       │    HITL 判断（系统执行）
  │                                       │    需要 HITL → 状态 → human_reviewing
  │                                       │    不需要 HITL → 状态 → completed
  │                                       │
  ├── GET /api/tasks/:taskId             ──►│ 返回最终状态，前端据此路由跳转
```

### 5.3 HITL 人工审核操作流程

```
前端                                    后端
  │                                       │
  ├── GET /api/tasks/:taskId/risk-items  ──►│ 返回 RiskItem 列表（含 confidence_category、location）
  ├── GET /api/tasks/:taskId/document    ──►│ 返回 PDF 文件（供 PDF.js 渲染）
  │                                       │
  │ [用户点击同意/编辑/驳回/批注]            │
  ├── POST /api/tasks/:taskId/review-ops──►│ 校验操作合法性 → 持久化 HumanReview → 写审计日志
  │◄── 返回 updated RiskItem.reviewer_status│
  │                                       │
  │ [用户点击完成审核]                       │
  ├── POST /api/tasks/:taskId/complete   ──►│ 校验 Critical/High 全处理
  │                                       │    通过 → 状态 → completed
  │                                       │    不通过 → 返回 400 + 未处理条目清单
  │                                       │
  │ [用户点击整体任务驳回]                    │
  ├── POST /api/tasks/:taskId/reject     ──►│ 校验理由长度 → 状态 → rejected → 写审计日志
```

---

## 六、关键约束与禁止项

### 6.1 前端禁止项

| 禁止行为 | 原因 | 对应规范来源 |
|---------|------|------------|
| 前端自行计算 `confidence_category` | 类别决定法律展示语义，必须由后端权威输出 | problem_modeling § 四.4.3 |
| 前端自行触发 HITL 或绕过 HITL | HITL 是系统行为，前端无权决策 | problem_modeling § 四.4.3 |
| 前端自行执行状态流转 | 状态机是核心业务规则，必须由后端执行 | problem_modeling § 四.4.3 |
| 前端用轮询替代 WebSocket | 影响实时性，且增加服务器负载 | interactive-design-spec § 5.2 |
| 前端跳过后端校验直接完成审核 | 合规要求：Critical/High 条目必须全部人工处理 | problem_modeling § 三.2 |
| 前端存储或处理任何密钥/凭证 | 安全基本要求 | CLAUDE.md § 2.1 |
| 前端在 P03 展示部分审核结论 | 避免误导用户在审核未完成时做出判断 | interactive-design-spec § 3.1 |

### 6.2 后端禁止项

| 禁止行为 | 原因 | 对应规范来源 |
|---------|------|------------|
| 将原始文档内容直接嵌入 System Prompt | Prompt Injection 防护 | problem_modeling § 1.2 |
| 允许 `completed` 状态回退 | 状态机单向性约束 | problem_modeling § 四.4.2 |
| 混同展示高/低置信度输出 | 法律语义差异，用户可能误判 AI 结论 | problem_modeling § 1.2 |
| 仅依赖前端校验结果 | 前端校验可绕过，后端必须独立校验 | 通用安全原则 |
| 在非 HITL 触发条件下强制流转至 `human_reviewing` | 影响系统效率，业务规则约束 | problem_modeling § 三.2 |
| 修改或删除审计日志 | 审计日志必须不可变，支持合规追溯 | problem_modeling § 四.4.3 |

---

## 七、接口边界汇总（API 入口清单）

> 本节列举前后端交互的接口类型，详细 API 规范见 `docs/08_api_spec/api_spec.md`。

### REST API

| 方法 | 路径 | 发起方 | 功能 |
|------|------|-------|------|
| POST | `/api/upload/init` | 前端 | 获取分片上传预签名 URL |
| PUT | `/api/upload/chunk` | 前端 | 上传单个分片 |
| POST | `/api/upload/complete` | 前端 | 合并分片，创建 Document |
| GET | `/api/tasks` | 前端 | 获取任务列表（分页+过滤） |
| GET | `/api/tasks/:taskId` | 前端 | 获取任务详情及当前状态 |
| GET | `/api/tasks/:taskId/risk-items` | 前端 | 获取风险条目列表 |
| GET | `/api/tasks/:taskId/document` | 前端 | 获取原始文档（PDF 渲染用） |
| GET | `/api/tasks/:taskId/extractions` | 前端 | 获取结构化事实字段 |
| GET | `/api/tasks/:taskId/audit-logs` | 前端 | 获取审计日志（分页） |
| POST | `/api/tasks/:taskId/review-ops` | 前端 | 提交单条审核操作（approve/edit/reject_item/annotate） |
| POST | `/api/tasks/:taskId/complete` | 前端 | 提交完成审核 |
| POST | `/api/tasks/:taskId/reject` | 前端 | 提交整体任务驳回 |
| POST | `/api/tasks/:taskId/retry` | 前端 | 手动重试（auto_review_failed） |

### WebSocket 事件（后端推送 → 前端订阅）

| 事件名 | 触发时机 | 数据字段 |
|-------|---------|---------|
| `upload_progress` | 分片上传阶段 | `task_id`, `progress`(0-40%), `message` |
| `parse_progress` | 文档解析阶段 | `task_id`, `stage`, `progress`(40-70%), `message` |
| `quality_check` | OCR 质量门控 | `task_id`, `quality_score`, `progress`(70-85%), `message` |
| `parse_complete` | 解析完成 | `task_id`, `progress`(100%), `message` |
| `parse_failed` | 解析失败 | `task_id`, `error_code`, `message` |
| `auto_review_layer_update` | 每层审核状态变化 | `task_id`, `layer`(1/2/3), `status`, `progress`, `message` |
| `auto_review_complete` | 自动审核完成 | `task_id`, `next_status`(completed/human_reviewing) |
| `auto_review_failed` | 自动审核失败 | `task_id`, `error_code`, `message` |
| `sla_reminder` | SLA 超期催办 | `task_id`, `reviewer_id`, `overdue_minutes` |

---

*本文档是前后端功能边界的收口文档，不含具体实现细节。前端实现细节见 `docs/09_frontend_plan/`，后端实现细节见 `docs/10_backend_plan/`，接口格式见 `docs/08_api_spec/api_spec.md`。*
