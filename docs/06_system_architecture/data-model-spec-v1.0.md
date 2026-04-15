# 数据模型规范 v1.0

**阶段**：07_data_model（汇总输出至 06_system_architecture）  
**输出方**：Team Lead（汇总）  
**日期**：2026-04-15  
**版本**：v1.0  
**子文档来源**：
- `docs/07_data_model/upload_parse_task_data_model.md`（Teammate 1）
- `docs/07_data_model/review_rule_result_data_model.md`（Teammate 2）
- `docs/07_data_model/hitl_interaction_data_model.md`（Teammate 3）

---

## 一、全局实体总览

本系统共涉及 **13 个核心实体**，按功能域划分如下：

### 1.1 实体分域概览

| 功能域 | 实体 | 说明 |
|--------|------|------|
| **上传与解析** | `ChunkUpload` | 分片上传会话 |
| | `ChunkPart` | 单分片记录 |
| | `Document` | 文档元数据 |
| | `ParseResult` | 解析结果（含分块） |
| **审核任务** | `ReviewTask` | 审核任务状态机（11态） |
| | `StatusAuditLog` | 状态变更专项日志 |
| **审核规则与结果** | `ReviewRule` | 审核规则定义 |
| | `ReviewResult` | 整体审核结果汇总 |
| | `RiskItem` | 单条风险命中项 |
| | `SourceReference` | 法规来源引用 |
| **人机交互（HITL）** | `HumanReviewOperation` | 人工操作记录 |
| | `EditRecord` | 字段级编辑记录 |
| | `Annotation` | 批注记录 |
| | `AuditLog` | 全链路不可变审计日志 |
| | `ReviewerAssignment` | 审核人分配记录 |

> 合计 **15 个实体**（含 `StatusAuditLog`、`AuditLog` 两个日志类实体）。

---

## 二、全局实体关系图

```
用户上传
   │
   ▼
ChunkUpload ──(1:N)──► ChunkPart
   │ (1:1)
   ▼
Document ──────────────────────────────────────────────────────────────►(is_blocked → 拦截)
   │ (1:1)
   ├──► ParseResult（解析块、质量评估）
   │
   │ (1:1)
   ▼
ReviewTask ◄──────────────── StatusAuditLog（状态变更只追加日志）
   │ (1:1)
   ├──► ReviewResult ──(1:N)──► RiskItem ──(1:N)──► SourceReference
   │                               │ (由 ReviewRule 触发)
   │                            ReviewRule
   │
   │ (1:N)
   ├──► HumanReviewOperation ──(1:N)──► EditRecord
   │         │ (annotate 时)
   │         └──► Annotation
   │
   │ (1:N)
   ├──► ReviewerAssignment（分配历史，含 SLA 字段）
   │
   └──► AuditLog（全链路不可变日志：状态变更 + 人工操作 + 向量库绑定）
```

---

## 三、完整状态机规范

### 3.1 ReviewTask 完整 11 态状态机

```
                    [初始创建]
                        │
                        ▼
                    uploaded
                        │
                        ▼
                    parsing ──────────────────────────► parse_failed（终态）
                        │（解析成功）
                        ▼
                    parsed
                        │
                        ▼
               auto_reviewing ────────────────────────► auto_review_failed（可重试）
                        │（审核完成）
                        ▼
               auto_reviewed
                        │
              ┌─────────┴─────────┐
        （触发HITL）          （无需HITL）
              │                   │
              ▼                   ▼
      human_reviewing ──────► completed（终态）
              │
              ├──────────────────────────────────────► human_review_failed（可重试）
              │
              ▼
          completed（终态）

任意状态 ──────────────────────────────────────────► rejected（终态）
```

**状态类型说明**：

| 状态 | 类型 | 可回退 |
|------|------|--------|
| `uploaded` / `parsing` / `parsed` / `auto_reviewing` / `auto_reviewed` / `human_reviewing` | 中间态 | 否（单向） |
| `auto_review_failed` / `human_review_failed` | 可恢复失败态 | 可重试 |
| `parse_failed` / `completed` / `rejected` | **终态** | **不可回退** |

---

## 四、实体字段速查表

### 4.1 ChunkUpload

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `id` | VARCHAR(36) | | ✓ | UUID，前端用作上传会话ID |
| `uploader_user_id` | VARCHAR(36) | | ✓ | |
| `original_filename` | VARCHAR(512) | ✓ | ✓ | |
| `total_size_bytes` | BIGINT | | ✓ | |
| `total_parts` | INT | | ✓ | |
| `status` | ENUM | ✓ | ✓ | pending/uploading/completed/expired/failed |
| `expires_at` | TIMESTAMP | | ✓ | created_at + 24h |
| `completed_at` | TIMESTAMP | | ✓ | |

### 4.2 ChunkPart

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `chunk_upload_id` | VARCHAR(36) | | ✓ | FK → ChunkUpload |
| `part_number` | INT | | ✓ | 从 1 开始 |
| `etag` | VARCHAR(128) | | ✓ | 合并前必填 |
| `size_bytes` | BIGINT | | ✓ | |
| `status` | ENUM | | ✓ | pending/uploaded/failed |

### 4.3 Document

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `id` | VARCHAR(36) | | ✓ | |
| `chunk_upload_id` | VARCHAR(36) | | ✓ | FK → ChunkUpload |
| `original_filename` | VARCHAR(512) | ✓ | ✓ | |
| `file_size_bytes` | BIGINT | ✓ | ✓ | 展示"XX MB" |
| `storage_path` | VARCHAR(1024) | | ✓ | **不暴露给前端** |
| `parse_engine_used` | ENUM | | ✓ | direct_text/ocr_paddle/manual_fallback |
| `ocr_quality_score` | FLOAT | ✓ | ✓ | 0-100 |
| `ocr_quality_level` | ENUM | ✓ | ✓ | high/medium/low；后端计算 |
| `document_type` | VARCHAR(64) | ✓ | ✓ | Layer 1 分类后写入 |
| `is_blocked` | BOOLEAN | | ✓ | 融资股权文件硬拦截 |
| `block_reason` | VARCHAR(512) | ✓ | | 拦截原因，前端展示 |

### 4.4 ParseResult

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `document_id` | VARCHAR(36) | | ✓ | FK，唯一（1:1） |
| `status` | ENUM | | ✓ | parsing/completed/failed |
| `total_chunks` | INT | | ✓ | |
| `chunks` | JSON | | ✓ | `[{chunk_id, page, paragraph_index, text, char_count}]` |
| `overall_quality_score` | FLOAT | ✓ | ✓ | |
| `quality_dimensions` | JSON | | ✓ | `{text_clarity, layout_structure, char_recognition}` |
| `error_code` | VARCHAR(64) | ✓ | | 前端根据code选择文案 |
| `error_message` | VARCHAR(1024) | | ✓ | 内部记录，不直接展示 |

### 4.5 ReviewTask

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `id` | VARCHAR(36) | ✓ | ✓ | WebSocket Channel 标识 |
| `document_id` | VARCHAR(36) | | ✓ | FK |
| `status` | ENUM | ✓ | ✓ | 完整 11 态，见 §三 |
| `vector_db_version` | VARCHAR(64) | | ✓ | **创建时写入，不可修改** |
| `assigned_reviewer_id` | VARCHAR(36) | ✓ | ✓ | human_reviewing 阶段赋值 |
| `sla_deadline` | TIMESTAMP | | ✓ | 进入 human_reviewing 时设置（+60min） |
| `reminder_count` | INT | | ✓ | 默认 0，防重复催办 |
| `completed_at` | TIMESTAMP | ✓ | ✓ | |
| `created_at` | TIMESTAMP | ✓ | ✓ | |

### 4.6 ReviewRule

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `rule_code` | VARCHAR(64) | | ✓ | 程序引用唯一编码 |
| `name` | VARCHAR(256) | ✓ | ✓ | |
| `description` | TEXT | ✓ | | |
| `category` | VARCHAR(64) | ✓ | ✓ | |
| `risk_level_hint` | ENUM | | ✓ | 默认风险等级建议 |
| `version` | VARCHAR(32) | | ✓ | RiskItem 绑定版本审计 |
| `is_active` | BOOLEAN | | ✓ | |

### 4.7 ReviewResult

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `task_id` | VARCHAR(36) | | ✓ | FK，唯一（1:1） |
| `overall_risk_score` | FLOAT | ✓ | ✓ | 0-100，顶部评分展示 |
| `risk_level_summary` | ENUM | ✓ | ✓ | critical/high/medium/low |
| `critical_count` | INT | ✓ | ✓ | |
| `high_count` | INT | ✓ | ✓ | |
| `medium_count` | INT | ✓ | ✓ | |
| `low_count` | INT | ✓ | ✓ | |
| `hitl_triggered` | BOOLEAN | | ✓ | HITL判断结果 |
| `hitl_trigger_reasons` | JSON | | ✓ | `["critical_count > 0", ...]` |
| `min_confidence_score` | FLOAT | | ✓ | HITL触发条件计算 |
| `generated_at` | TIMESTAMP | ✓ | ✓ | |

### 4.8 RiskItem

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `task_id` | VARCHAR(36) | ✓ | ✓ | **一级索引**，按任务查风险项 |
| `review_result_id` | VARCHAR(36) | | ✓ | FK → ReviewResult |
| `rule_id` | VARCHAR(36) | | ✓ | FK → ReviewRule（含版本审计） |
| `risk_type` | VARCHAR(64) | ✓ | ✓ | **不可人工编辑** |
| `risk_level` | ENUM | ✓ | ✓ | critical/high/medium/low；**可编辑** |
| `risk_description` | TEXT | ✓ | ✓ | **可编辑** |
| `confidence_score` | FLOAT | ✓ | ✓ | 0-100；**不可编辑** |
| `confidence_category` | ENUM | ✓ | ✓ | fact/clause/legal；**后端计算，前端只渲染** |
| `reasoning` | TEXT | ✓ | ✓ | legal类别必填；**可编辑** |
| `location_page` | INT | ✓ | ✓ | PDF高亮页码；**不可编辑** |
| `location_paragraph` | INT | ✓ | ✓ | PDF高亮段落；**不可编辑** |
| `location_sentence_id` | VARCHAR(64) | ✓ | | **V1预留**，MVP为null |
| `reviewer_status` | ENUM | ✓ | ✓ | pending/approved/edited/reviewer_rejected |

### 4.9 SourceReference

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `risk_item_id` | VARCHAR(36) | | ✓ | FK |
| `source_type` | ENUM | ✓ | ✓ | law/regulation/standard/internal_policy/case_law |
| `source_name` | VARCHAR(512) | ✓ | ✓ | |
| `article_number` | VARCHAR(64) | ✓ | | |
| `reference_text` | TEXT | ✓ | | |

### 4.10 HumanReviewOperation

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `review_task_id` | VARCHAR(36) | ✓ | ✓ | FK |
| `risk_item_id` | VARCHAR(36) | | ✓ | reject_task 时为 null |
| `operator_id` | VARCHAR(36) | ✓ | ✓ | |
| `action` | ENUM | ✓ | ✓ | approve/edit/reject_item/reject_task/annotate |
| `reject_reason` | TEXT | ✓ | ✓ | reject_item≥10字符，reject_task≥20字符 |
| `operated_at` | TIMESTAMP | ✓ | ✓ | |

### 4.11 EditRecord（编辑时的 5 个必填审计字段）

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `operation_id` | VARCHAR(36) | | ✓ | FK → HumanReviewOperation |
| `operator_id` | VARCHAR(36) | | ✓ | 审计必须 |
| `edited_field` | ENUM | ✓ | ✓ | risk_level/risk_description/reasoning |
| `original_value` | TEXT | ✓ | ✓ | diff展示 |
| `new_value` | TEXT | ✓ | ✓ | diff展示 |
| `operated_at` | TIMESTAMP | ✓ | ✓ | 审计必须 |

### 4.12 Annotation

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `review_task_id` | VARCHAR(36) | ✓ | ✓ | 冗余关联，便于按任务查批注 |
| `risk_item_id` | VARCHAR(36) | ✓ | | 可为null（任务级批注） |
| `operator_id` | VARCHAR(36) | ✓ | ✓ | |
| `content` | TEXT | ✓ | ✓ | MVP单人单次 |
| `created_at` | TIMESTAMP | ✓ | ✓ | |

### 4.13 AuditLog（全链路不可变日志）

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `event_type` | ENUM | | ✓ | task_status_change/human_action/vector_db_bind |
| `review_task_id` | VARCHAR(36) | | ✓ | 所有事件必须绑定任务 |
| `related_operation_id` | VARCHAR(36) | | ✓ | 人工操作时关联 |
| `operator_id` | VARCHAR(36) | | ✓ | 人工操作时必填 |
| `detail` | JSON | | ✓ | 完整业务上下文 |
| `occurred_at` | TIMESTAMP | | ✓ | 应用层设置，非数据库默认 |

### 4.14 ReviewerAssignment

| 字段 | 类型 | FE | BE | 关键说明 |
|------|------|----|----|---------|
| `review_task_id` | VARCHAR(36) | | ✓ | FK |
| `reviewer_id` | VARCHAR(36) | ✓ | ✓ | |
| `status` | ENUM | ✓ | ✓ | active/replaced/completed |
| `assigned_at` | TIMESTAMP | ✓ | ✓ | |
| `sla_deadline` | TIMESTAMP | | ✓ | assigned_at + 60min |
| `first_reminded_at` | TIMESTAMP | | ✓ | +30min阈值触发 |
| `reassigned_at` | TIMESTAMP | | ✓ | +60min阈值触发 |

---

## 五、关键约束汇总

### 5.1 不可变约束

| 约束 | 涉及实体 | 说明 |
|------|---------|------|
| 向量库版本绑定 | `ReviewTask.vector_db_version` | 任务创建时写入，**不可修改** |
| 审计日志只追加 | `AuditLog`、`StatusAuditLog` | 只追加，**不修改不删除** |
| 终态不可回退 | `ReviewTask.status` | `parse_failed`/`completed`/`rejected` 不可回退 |
| AI 原始字段不可编辑 | `RiskItem` | `risk_type`/`confidence_score`/`location_*` 不允许人工修改 |

### 5.2 后端独立执行约束（不依赖前端）

| 约束 | 说明 |
|------|------|
| HITL 触发判断 | 只能由后端执行，前端不可控制 |
| `confidence_category` 计算 | 后端按 ≥90%/70-89%/<70% 计算，前端只做颜色渲染 |
| 状态机路径执行 | 后端唯一执行方 |
| 完成审核条件校验 | 后端校验 Critical/High 全处理，前端只控制按钮启用 |
| 融资股权文件硬拦截 | 后端必须拦截，`Document.is_blocked=true` |
| 驳回理由长度校验 | 后端二次校验（reject_item≥10，reject_task≥20） |

### 5.3 置信度分级规范（全局统一）

| `confidence_category` | `confidence_score` 范围 | 前端颜色 | 额外要求 |
|----------------------|------------------------|---------|---------|
| `fact` | ≥ 90 | 绿色 | 无 |
| `clause` | 70–89 | 黄色 | 无 |
| `legal` | < 70 | 橙色 | **必须展示 `reasoning` 字段** |

---

## 六、索引全局汇总

| 表名 | 索引字段 | 类型 | 优先级 |
|------|---------|------|--------|
| `Document` | `chunk_upload_id` | 唯一索引 | 高 |
| `Document` | `created_at` | 普通索引 | 高 |
| `ReviewTask` | `document_id` | 唯一索引 | 高 |
| `ReviewTask` | `status` | 普通索引 | 高 |
| `ReviewTask` | `assigned_reviewer_id` | 普通索引 | 高 |
| `ReviewTask` | `sla_deadline` | 普通索引 | 高 |
| `ReviewResult` | `task_id` | 唯一索引 | 高 |
| `RiskItem` | `task_id` | 普通索引（**一级索引**） | **最高** |
| `RiskItem` | `risk_level` | 普通索引 | 高 |
| `RiskItem` | `reviewer_status` | 普通索引 | 高 |
| `RiskItem` | `(task_id, reviewer_status)` | 复合索引 | 高 |
| `HumanReviewOperation` | `review_task_id` | 普通索引 | 高 |
| `HumanReviewOperation` | `(review_task_id, action)` | 复合索引 | 中 |
| `AuditLog` | `review_task_id` | 普通索引 | 高 |
| `AuditLog` | `occurred_at` | 普通索引 | 中 |
| `ReviewerAssignment` | `(status, sla_deadline)` | 复合索引 | 高 |
| `StatusAuditLog` | `task_id` | 普通索引 | 高 |
| `ChunkPart` | `chunk_upload_id` | 普通索引 | 中 |

---

## 七、前端必须字段全局汇总

> 后端 API 响应中**必须包含**的字段（前端展示或交互逻辑强依赖）。

| 场景 | 实体 | 必须字段 |
|------|------|---------|
| 文档列表页 | `Document` | `id`, `original_filename`, `file_size_bytes`, `ocr_quality_level`, `document_type`, `block_reason` |
| 上传进度 | `ChunkUpload` | `id`, `original_filename`, `status` |
| 任务状态驱动路由 | `ReviewTask` | `id`, `status`, `assigned_reviewer_id`, `completed_at`, `created_at` |
| 审核结果总览 | `ReviewResult` | `overall_risk_score`, `risk_level_summary`, `critical_count`, `high_count`, `medium_count`, `low_count`, `generated_at` |
| 风险列表（右侧面板） | `RiskItem` | `id`, `task_id`, `risk_type`, `risk_level`, `risk_description`, `confidence_score`, `confidence_category`, `reasoning`, `reviewer_status` |
| PDF定位高亮 | `RiskItem` | `location_page`, `location_paragraph`, `location_sentence_id` |
| 操作历史/diff | `HumanReviewOperation`, `EditRecord` | `action`, `operator_id`, `operated_at`, `reject_reason`, `edited_field`, `original_value`, `new_value` |
| 批注展示 | `Annotation` | `review_task_id`, `risk_item_id`, `operator_id`, `content`, `created_at` |
| 法规引用 | `SourceReference` | `source_type`, `source_name`, `article_number`, `reference_text` |

---

## 八、后端必须字段全局汇总

> 后端业务逻辑**强依赖**的字段，不得缺失。

| 业务逻辑 | 实体 | 关键字段 |
|---------|------|---------|
| 分片合并校验 | `ChunkPart` | `etag`, `part_number` |
| 融资股权文件拦截 | `Document` | `is_blocked` |
| 解析引擎审计 | `Document` | `parse_engine_used`, `storage_path` |
| 向量化与重新审核 | `ParseResult` | `chunks`, `parse_engine_version` |
| HITL 触发判断 | `ReviewResult` | `hitl_triggered`, `hitl_trigger_reasons`, `min_confidence_score` |
| 置信度分级（不依赖前端） | `RiskItem` | `confidence_category`（后端计算） |
| 低置信度推理说明必填 | `RiskItem` | `reasoning`（`legal`类别时必填） |
| 完成审核条件校验 | `RiskItem` | `(task_id, reviewer_status, risk_level)` 联合校验 |
| 向量库版本绑定 | `ReviewTask` | `vector_db_version`（不可修改） |
| SLA 监控 | `ReviewTask` + `ReviewerAssignment` | `sla_deadline`, `reminder_count` |
| 审计完整性 | `AuditLog` | `event_type`, `detail`, `occurred_at`（应用层设置） |
| 编辑字段合法性 | `EditRecord` | `edited_field`（校验在允许范围内） |
| 驳回理由长度 | `HumanReviewOperation` | `reject_reason`（reject_item≥10，reject_task≥20） |

---

## 九、与上游文档的对应关系

| 数据模型决策 | 来源文档 | 章节 |
|------------|---------|------|
| 11 态状态机定义 | `interactive-design-spec-v1.0.md` | §五.1 |
| OCR 质量三档（high/medium/low） | `interactive-design-spec-v1.0.md` | §二.2 |
| 置信度三档分级（fact/clause/legal） | `interactive-design-spec-v1.0.md` | §五.3 |
| HITL 触发条件（Critical/置信度<50%） | `interactive-design-spec-v1.0.md` | §一.1 |
| vector_db_version 绑定 ReviewTask | `interactive-design-spec-v1.0.md` | §五.4 |
| 审计日志 5 字段必填 | `interactive-design-spec-v1.0.md` | §四.2（编辑操作） |
| SLA 30/60分钟双阈值 | `interactive-design-spec-v1.0.md` | §三.3 |
| PDF 高亮段落级精度（MVP） | `interactive-design-spec-v1.0.md` | §四.1 |
| 前端不执行 HITL 判断 | `frontend-backend-boundary-spec.md` | §二.3 |
| confidence_category 后端计算 | `frontend-backend-boundary-spec.md` | §三.2 |
| 融资股权文件硬拦截 | `backend-service-arch-spec.md` | §一.3 |

---

## 十、为后续阶段提供的规范输入

### 10.1 为 API 规范（08_api_spec）提供的输入

| API 功能 | 必须返回的字段 |
|---------|--------------|
| GET /tasks/{id} | `ReviewTask` 全部 FE Required 字段 + `ReviewResult` 全部 FE Required 字段 |
| GET /tasks/{id}/risk-items | `RiskItem` 全部 FE Required 字段 + `SourceReference` FE Required 字段 |
| POST /tasks/{id}/operations | 接收 `HumanReviewOperation` 字段，返回更新后的 `RiskItem.reviewer_status` |
| GET /tasks/{id}/annotations | `Annotation` 全部 FE Required 字段 |
| GET /tasks/{id}/audit-log | `AuditLog` 分页，支持 `event_type` / `occurred_at` 过滤 |
| WebSocket task channel | 推送 `ReviewTask.status` 变更 + 进度 percent |

### 10.2 为前端实现计划（09_frontend_plan）提供的输入

| 前端模块 | 依赖字段 |
|---------|---------|
| 上传组件 | `ChunkUpload.id`（会话）、`ChunkPart.status`（进度） |
| 任务列表 | `ReviewTask`: `id`/`status`/`created_at`；`Document`: `original_filename`/`file_size_bytes` |
| 审核结果总览 | `ReviewResult` 全量 FE 字段 |
| 双视图（右侧面板） | `RiskItem` 全量 FE 字段；风险列表按 `risk_level` 排序，`reviewer_status` 状态渲染 |
| PDF高亮定位 | `RiskItem`: `location_page`/`location_paragraph`，高亮颜色 = `risk_level` 颜色 |
| 完成审核按钮启用 | 统计 `risk_level IN (critical,high) AND reviewer_status = pending` 的条目数 = 0 |
| diff展示 | `EditRecord`: `edited_field`/`original_value`/`new_value` |

### 10.3 为后端实现计划（10_backend_plan）提供的输入

| 后端服务 | 依赖字段 |
|---------|---------|
| 状态机引擎 | `ReviewTask.status` 完整枚举 + 转换规则（见 §三） |
| HITL 判断服务 | `ReviewResult.hitl_trigger_reasons` 逻辑条件 |
| SLA 监控服务 | `ReviewerAssignment.sla_deadline` + `status=active` 索引扫描 |
| 审计日志服务 | `AuditLog.event_type` 三类 + `detail` JSON 结构（见 hitl doc §五） |
| 置信度计算 | `RiskItem.confidence_category` = `score≥90→fact, 70-89→clause, <70→legal` |

---

*本文档由 Team Lead 在 Teammate 1、2、3 全部完成后综合整理汇总。所有字段定义均可在三份子文档中找到对应依据。本文档作为 API 规范设计（08）、前端实现计划（09）、后端实现计划（10）的直接输入规范。*
