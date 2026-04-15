# FastAPI 接口规范 v1.0

**阶段**：08_api_spec  
**日期**：2026-04-15  
**版本**：v1.0  
**依据文档**：
- `docs/06_system_architecture/data-model-spec-v1.0.md`
- `docs/04_interaction_design/langchain-hitl-arch-spec-v1.0.md`
- `docs/03_problem_modeling/problem_modeling.md`
- `docs/04_interaction_design/interactive-design-spec-v1.0.md`

---

## 目录

1. [全局约定](#一全局约定)
2. [认证与授权](#二认证与授权)
3. [统一错误响应格式](#三统一错误响应格式)
4. [文档上传接口](#四文档上传接口)
5. [审核查询接口](#五审核查询接口)
6. [人工审核接口](#六人工审核接口)
7. [WebSocket 实时推送规范](#七websocket-实时推送规范)
8. [前后端联调接入顺序](#八前后端联调接入顺序)
9. [接口约束汇总](#九接口约束汇总)

---

## 一、全局约定

### 1.1 Base URL

```
开发环境：http://localhost:8000/api/v1
生产环境：https://<domain>/api/v1
```

所有 REST 接口均以 `/api/v1` 为前缀，WebSocket 接口以 `/ws/v1` 为前缀。

### 1.2 通用请求规范

| 项目 | 规范 |
|------|------|
| Content-Type | `application/json`（文件上传分片除外，使用 `application/octet-stream`） |
| 字符编码 | UTF-8 |
| 时间格式 | ISO 8601，带时区，如 `2026-04-15T10:30:00+08:00` |
| ID 格式 | UUID v4 字符串，如 `"550e8400-e29b-41d4-a716-446655440000"` |
| 分页参数 | `page`（从 1 开始）、`page_size`（默认 20，最大 100） |

### 1.3 通用响应结构

**成功响应**（HTTP 2xx）：

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

**分页响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [ ... ],
    "total": 100,
    "page": 1,
    "page_size": 20
  }
}
```

### 1.4 状态码使用规范

| HTTP 状态码 | 使用场景 |
|------------|---------|
| 200 | 查询成功、操作成功 |
| 201 | 资源创建成功（如初始化上传） |
| 400 | 请求参数错误、业务校验失败 |
| 401 | 未认证 |
| 403 | 无权限（含文档类型硬拦截） |
| 404 | 资源不存在 |
| 409 | 状态冲突（如对终态任务发起操作） |
| 422 | 请求体格式合法但语义不合法 |
| 500 | 服务器内部错误 |

---

## 二、认证与授权

### 2.1 认证方式

使用 **Bearer Token（JWT）**，在请求头中传递：

```
Authorization: Bearer <access_token>
```

### 2.2 用户角色

| 角色值 | 角色名称 | 可访问的关键接口 |
|--------|---------|----------------|
| `legal_staff` | 企业法务 / 合规专员 | 上传接口、查询接口 |
| `reviewer` | 律师 / 法律顾问 | 查询接口、人工审核接口 |
| `manager` | 业务负责人 | 查询接口（只读） |

> 人工审核操作接口（`POST /tasks/{task_id}/operations`、`POST /tasks/{task_id}/reject`、`POST /tasks/{task_id}/complete`）要求请求者角色为 `reviewer` 且为该任务的 `assigned_reviewer_id`，后端必须二次校验。

---

## 三、统一错误响应格式

所有 4xx / 5xx 响应使用统一结构：

```json
{
  "code": "<error_code>",
  "message": "<human-readable message>",
  "detail": "<可选，详细说明或字段级错误>"
}
```

### 3.1 业务错误码表

| `error_code` | HTTP 状态码 | 含义 | 前端处理建议 |
|-------------|-----------|------|------------|
| `UNSUPPORTED_FORMAT` | 400 | 文件格式不支持 | 提示"请上传 PDF 或 Word 文件" |
| `FILE_TOO_LARGE` | 400 | 文件超过 50MB | 提示"文件大小超限，请压缩后重新上传" |
| `FILE_CORRUPTED` | 400 | 文件完整性校验失败（ETag / MD5 不匹配） | 提示"文件可能已损坏" |
| `DOCUMENT_TYPE_FORBIDDEN` | 403 | 融资股权文件硬拦截 | 提示"此类文档不在 AI 审核范围" |
| `UPLOAD_SESSION_EXPIRED` | 400 | 分片上传会话已过期（超 24h） | 提示重新上传 |
| `PART_MISSING` | 400 | 合并时分片未全部到齐 | 提示重试 |
| `TASK_NOT_FOUND` | 404 | 任务不存在 | 跳转任务列表 |
| `TASK_STATUS_CONFLICT` | 409 | 操作与当前任务状态冲突 | 提示当前状态不允许此操作 |
| `NOT_ASSIGNED_REVIEWER` | 403 | 请求人非当前分配审核人 | 提示"您没有该任务的审核权限" |
| `RISK_ITEM_NOT_FOUND` | 404 | 风险项不存在或不属于此任务 | 前端校验逻辑 bug |
| `REJECT_REASON_TOO_SHORT` | 422 | 驳回理由不足最低字符数 | 提示字符数要求 |
| `CRITICAL_HIGH_NOT_ALL_HANDLED` | 422 | 还有 Critical/High 条目未处理，不能完成审核 | 提示未处理条目数 |

---

## 四、文档上传接口

上传流程分三步：**初始化** → **分片上传** → **合并完成**。

### 4.1 初始化分片上传

**POST** `/api/v1/upload/init`

**权限**：`legal_staff`

**请求体**：

```json
{
  "original_filename": "采购合同-2026-04.pdf",
  "file_size_bytes": 15728640,
  "total_parts": 3,
  "content_type": "application/pdf"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `original_filename` | string | 是 | 原始文件名，≤ 512 字符 |
| `file_size_bytes` | integer | 是 | 总文件大小（字节），≤ 52428800（50MB） |
| `total_parts` | integer | 是 | 总分片数，单文件 < 20MB 时为 1 |
| `content_type` | string | 是 | 枚举：`application/pdf` / `application/vnd.openxmlformats-officedocument.wordprocessingml.document` / `application/msword` |

**后端校验（顺序执行）**：
1. `file_size_bytes` ≤ 52428800，否则返回 `FILE_TOO_LARGE`
2. `content_type` 在允许列表内，否则返回 `UNSUPPORTED_FORMAT`
3. 文件名触发融资股权关键词匹配（预筛），若命中返回 `DOCUMENT_TYPE_FORBIDDEN`（注：内容层拦截在 complete 阶段）

**响应**（HTTP 201）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "chunk_upload_id": "550e8400-e29b-41d4-a716-446655440000",
    "upload_parts": [
      {
        "part_number": 1,
        "presigned_url": "https://s3.example.com/upload/...?part=1&...",
        "expires_at": "2026-04-16T10:30:00+08:00"
      },
      {
        "part_number": 2,
        "presigned_url": "https://s3.example.com/upload/...?part=2&...",
        "expires_at": "2026-04-16T10:30:00+08:00"
      },
      {
        "part_number": 3,
        "presigned_url": "https://s3.example.com/upload/...?part=3&...",
        "expires_at": "2026-04-16T10:30:00+08:00"
      }
    ],
    "session_expires_at": "2026-04-16T10:30:00+08:00"
  }
}
```

| 响应字段 | 类型 | 说明 |
|---------|------|------|
| `chunk_upload_id` | string | 上传会话 ID，后续接口必传 |
| `upload_parts[].part_number` | integer | 分片序号，从 1 开始 |
| `upload_parts[].presigned_url` | string | S3 预签名 URL，前端直接 PUT 上传分片 |
| `upload_parts[].expires_at` | string | 该预签名 URL 有效期（15 分钟） |
| `session_expires_at` | string | 整个上传会话有效期（24 小时） |

> 文件 < 20MB 时，`total_parts=1`，只返回一个预签名 URL，前端直接单次 PUT。

---

### 4.2 上传单个分片（前端直传 S3）

**PUT** `<presigned_url>`（S3 直传，非后端接口）

前端使用 init 返回的预签名 URL 直接 PUT 分片内容：

```
PUT <presigned_url>
Content-Type: application/octet-stream
Content-Length: <分片字节数>

<二进制数据>
```

**S3 响应头**：包含 `ETag`，前端必须记录每个分片的 `ETag` 值，合并时提交。

> 后端不参与此步骤，仅在 complete 阶段校验 ETag。

---

### 4.3 完成上传（合并分片）

**POST** `/api/v1/upload/complete`

**权限**：`legal_staff`

**请求体**：

```json
{
  "chunk_upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "parts": [
    { "part_number": 1, "etag": "\"d41d8cd98f00b204e9800998ecf8427e\"" },
    { "part_number": 2, "etag": "\"098f6bcd4621d373cade4e832627b4f6\"" },
    { "part_number": 3, "etag": "\"5d41402abc4b2a76b9719d911017c592\"" }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `chunk_upload_id` | string | 是 | init 返回的会话 ID |
| `parts` | array | 是 | 所有分片的 part_number + etag，必须与 total_parts 数量一致 |
| `parts[].part_number` | integer | 是 | 分片序号，从 1 开始 |
| `parts[].etag` | string | 是 | S3 返回的 ETag，含双引号 |

**后端执行顺序**：
1. 校验 `chunk_upload_id` 存在且未过期（否则 `UPLOAD_SESSION_EXPIRED`）
2. 校验所有 `part_number` 覆盖 1 到 `total_parts`（否则 `PART_MISSING`）
3. 调用 S3 CompleteMultipartUpload，传入所有 ETag（ETag 不匹配则 `FILE_CORRUPTED`）
4. 对文件内容进行融资股权文件关键词深度检测（否则 `DOCUMENT_TYPE_FORBIDDEN`），**不创建任何记录**
5. 创建 `Document` 记录，`storage_path` 写入 S3 永久路径（**不暴露给前端**）
6. 创建 `ReviewTask` 记录，状态为 `uploaded`，写入 `vector_db_version`
7. 将解析任务投入 Celery `document_parse` 队列
8. 返回 `document_id` 和 `task_id`

**响应**（HTTP 201）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "document_id": "doc-uuid-xxxx",
    "task_id": "task-uuid-xxxx",
    "original_filename": "采购合同-2026-04.pdf",
    "file_size_bytes": 15728640,
    "status": "uploaded"
  }
}
```

| 响应字段 | 类型 | 说明 |
|---------|------|------|
| `document_id` | string | Document 实体 ID |
| `task_id` | string | ReviewTask ID，后续所有查询和操作的主键，同时作为 WebSocket channel 标识 |
| `original_filename` | string | 文件名（前端展示用） |
| `file_size_bytes` | integer | 文件大小 |
| `status` | string | 初始状态固定为 `uploaded` |

> complete 接口返回后，前端应立即建立 WebSocket 连接（`/ws/v1/tasks/{task_id}/progress`），监听后续状态变更。

---

### 4.4 查询文档列表

**GET** `/api/v1/documents`

**权限**：`legal_staff` / `reviewer` / `manager`

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | integer | 否 | 默认 1 |
| `page_size` | integer | 否 | 默认 20，最大 100 |
| `status` | string | 否 | 按 ReviewTask 状态过滤，支持多值逗号分隔 |
| `uploader_user_id` | string | 否 | 按上传人过滤，`legal_staff` 默认只看自己 |

**响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "document_id": "doc-uuid-xxxx",
        "task_id": "task-uuid-xxxx",
        "original_filename": "采购合同-2026-04.pdf",
        "file_size_bytes": 15728640,
        "ocr_quality_level": "high",
        "ocr_quality_score": 92.5,
        "document_type": "procurement_contract",
        "block_reason": null,
        "task_status": "auto_reviewing",
        "created_at": "2026-04-15T10:00:00+08:00"
      }
    ],
    "total": 42,
    "page": 1,
    "page_size": 20
  }
}
```

**items 字段说明**（前端展示必须字段）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `document_id` | string | Document ID |
| `task_id` | string | ReviewTask ID |
| `original_filename` | string | 原始文件名 |
| `file_size_bytes` | integer | 文件大小（字节），前端自行换算 MB |
| `ocr_quality_level` | string | `high` / `medium` / `low` |
| `ocr_quality_score` | float | 0–100 |
| `document_type` | string | 文档分类（Layer 1 输出） |
| `block_reason` | string\|null | 若被拦截则有值，否则 null |
| `task_status` | string | ReviewTask 完整 11 态之一 |
| `created_at` | string | ISO 8601 |

---

## 五、审核查询接口

### 5.1 查询任务详情

**GET** `/api/v1/tasks/{task_id}`

**权限**：`legal_staff` / `reviewer` / `manager`

**路径参数**：`task_id`（ReviewTask UUID）

**响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task": {
      "id": "task-uuid-xxxx",
      "status": "human_reviewing",
      "assigned_reviewer_id": "user-uuid-xxxx",
      "sla_deadline": "2026-04-15T11:30:00+08:00",
      "completed_at": null,
      "created_at": "2026-04-15T10:00:00+08:00"
    },
    "document": {
      "id": "doc-uuid-xxxx",
      "original_filename": "采购合同-2026-04.pdf",
      "file_size_bytes": 15728640,
      "ocr_quality_level": "high",
      "ocr_quality_score": 92.5,
      "document_type": "procurement_contract",
      "block_reason": null
    },
    "review_result": {
      "overall_risk_score": 72.5,
      "risk_level_summary": "high",
      "critical_count": 0,
      "high_count": 3,
      "medium_count": 5,
      "low_count": 8,
      "generated_at": "2026-04-15T10:05:00+08:00"
    }
  }
}
```

**task 字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | ReviewTask ID |
| `status` | string | 完整 11 态之一（见状态机规范） |
| `assigned_reviewer_id` | string\|null | 人工审核分配人，`human_reviewing` 阶段赋值 |
| `sla_deadline` | string\|null | SLA 截止时间，进入 `human_reviewing` 时设置（+60min） |
| `completed_at` | string\|null | 完成时间，终态时有值 |
| `created_at` | string | 创建时间 |

**review_result 字段说明**（`auto_reviewed` 及后续状态才有值，否则为 null）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `overall_risk_score` | float | 0–100 整体风险评分 |
| `risk_level_summary` | string | `critical` / `high` / `medium` / `low` |
| `critical_count` | integer | Critical 级风险项数 |
| `high_count` | integer | High 级风险项数 |
| `medium_count` | integer | Medium 级风险项数 |
| `low_count` | integer | Low 级风险项数 |
| `generated_at` | string | 自动审核完成时间 |

---

### 5.2 查询风险项列表

**GET** `/api/v1/tasks/{task_id}/risk-items`

**权限**：`legal_staff` / `reviewer` / `manager`

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `risk_level` | string | 否 | 按风险等级过滤，支持多值逗号分隔，如 `critical,high` |
| `reviewer_status` | string | 否 | 按处理状态过滤：`pending` / `approved` / `edited` / `reviewer_rejected` |
| `page` | integer | 否 | 默认 1 |
| `page_size` | integer | 否 | 默认 50，最大 200 |

**响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "risk-uuid-xxxx",
        "task_id": "task-uuid-xxxx",
        "risk_type": "liability_asymmetry",
        "risk_level": "high",
        "risk_description": "第8条对乙方违约责任约定明显重于甲方，存在不对等风险。",
        "confidence_score": 85.2,
        "confidence_category": "clause",
        "reasoning": null,
        "location_page": 3,
        "location_paragraph": 12,
        "location_sentence_id": null,
        "reviewer_status": "pending",
        "source_references": [
          {
            "source_type": "law",
            "source_name": "中华人民共和国民法典",
            "article_number": "第585条",
            "reference_text": "当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金……"
          }
        ]
      }
    ],
    "total": 16,
    "page": 1,
    "page_size": 50
  }
}
```

**items 字段说明**：

| 字段 | 类型 | 可编辑 | 说明 |
|------|------|--------|------|
| `id` | string | 否 | RiskItem ID |
| `task_id` | string | 否 | 所属任务 ID |
| `risk_type` | string | **否** | 风险类型，AI 原始字段，不可人工修改 |
| `risk_level` | string | **是** | `critical` / `high` / `medium` / `low`，人工可编辑 |
| `risk_description` | string | **是** | 风险描述，人工可编辑 |
| `confidence_score` | float | **否** | 0–100，AI 原始字段，不可编辑 |
| `confidence_category` | string | **否** | `fact`（≥90）/ `clause`（70-89）/ `legal`（<70），后端计算 |
| `reasoning` | string\|null | **是** | 推理说明，`legal` 类别时必填；人工可编辑 |
| `location_page` | integer | **否** | PDF 定位页码，不可编辑 |
| `location_paragraph` | integer | **否** | PDF 定位段落，不可编辑 |
| `location_sentence_id` | string\|null | **否** | V1 预留，MVP 为 null |
| `reviewer_status` | string | **否**（由操作接口驱动） | `pending` / `approved` / `edited` / `reviewer_rejected` |
| `source_references` | array | **否** | 法规来源引用列表 |

**source_references 字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `source_type` | string | `law` / `regulation` / `standard` / `internal_policy` / `case_law` |
| `source_name` | string | 法规名称 |
| `article_number` | string\|null | 条文编号 |
| `reference_text` | string\|null | 引用原文 |

---

### 5.3 查询审核报告（仅 completed 状态）

**GET** `/api/v1/tasks/{task_id}/result`

**权限**：`legal_staff` / `reviewer` / `manager`

**约束**：任务状态必须为 `completed`，否则返回 `TASK_STATUS_CONFLICT`（409）。

**响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task_id": "task-uuid-xxxx",
    "overall_risk_score": 68.0,
    "risk_level_summary": "high",
    "critical_count": 0,
    "high_count": 2,
    "medium_count": 4,
    "low_count": 7,
    "hitl_triggered": true,
    "generated_at": "2026-04-15T10:05:00+08:00",
    "completed_at": "2026-04-15T11:10:00+08:00",
    "risk_items_summary": [
      {
        "risk_level": "high",
        "count": 2,
        "approved_count": 1,
        "edited_count": 1,
        "rejected_count": 0
      }
    ]
  }
}
```

---

### 5.4 查询操作历史

**GET** `/api/v1/tasks/{task_id}/operations`

**权限**：`legal_staff` / `reviewer` / `manager`

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | integer | 否 | 默认 1 |
| `page_size` | integer | 否 | 默认 20 |

**响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "op-uuid-xxxx",
        "risk_item_id": "risk-uuid-xxxx",
        "operator_id": "user-uuid-xxxx",
        "action": "edit",
        "reject_reason": null,
        "operated_at": "2026-04-15T11:05:00+08:00",
        "edit_records": [
          {
            "edited_field": "risk_level",
            "original_value": "high",
            "new_value": "medium",
            "operated_at": "2026-04-15T11:05:00+08:00"
          }
        ]
      }
    ],
    "total": 8,
    "page": 1,
    "page_size": 20
  }
}
```

**action 枚举说明**：

| 值 | 说明 |
|----|------|
| `approve` | 同意 AI 风险评定 |
| `edit` | 修改风险等级/描述/推理说明 |
| `reject_item` | 单条驳回（认为误报） |
| `reject_task` | 整体任务驳回 |
| `annotate` | 添加批注 |

**edit_records 字段说明**（`action=edit` 时有值）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `edited_field` | string | 枚举：`risk_level` / `risk_description` / `reasoning` |
| `original_value` | string | 修改前的值（diff 展示用） |
| `new_value` | string | 修改后的值（diff 展示用） |
| `operated_at` | string | 操作时间戳 |

---

### 5.5 查询批注列表

**GET** `/api/v1/tasks/{task_id}/annotations`

**权限**：`legal_staff` / `reviewer` / `manager`

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `risk_item_id` | string | 否 | 按风险项过滤；不传则返回任务级批注 |

**响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "ann-uuid-xxxx",
        "review_task_id": "task-uuid-xxxx",
        "risk_item_id": "risk-uuid-xxxx",
        "operator_id": "user-uuid-xxxx",
        "content": "此条款与甲方总协议第3章有冲突，建议升级处理。",
        "created_at": "2026-04-15T11:08:00+08:00"
      }
    ],
    "total": 3,
    "page": 1,
    "page_size": 20
  }
}
```

---

### 5.6 查询审计日志

**GET** `/api/v1/tasks/{task_id}/audit-logs`

**权限**：`legal_staff` / `reviewer` / `manager`

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `event_type` | string | 否 | `task_status_change` / `human_action` / `vector_db_bind` |
| `from_time` | string | 否 | ISO 8601，开始时间 |
| `to_time` | string | 否 | ISO 8601，结束时间 |
| `page` | integer | 否 | 默认 1 |
| `page_size` | integer | 否 | 默认 20，最大 100 |

**响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "log-bigserial-xxxx",
        "event_type": "task_status_change",
        "review_task_id": "task-uuid-xxxx",
        "operator_id": null,
        "detail": {
          "old_status": "auto_reviewed",
          "new_status": "human_reviewing",
          "trigger": "system"
        },
        "occurred_at": "2026-04-15T10:06:00+08:00"
      }
    ],
    "total": 15,
    "page": 1,
    "page_size": 20
  }
}
```

> `audit_logs` 表只有 `INSERT` 权限，API 层只提供查询，严禁提供修改或删除接口。

---

## 六、人工审核接口

以下接口均要求：
1. 任务当前状态为 `human_reviewing`，否则返回 `TASK_STATUS_CONFLICT`
2. 请求人为该任务的 `assigned_reviewer_id`，否则返回 `NOT_ASSIGNED_REVIEWER`

---

### 6.1 提交单条风险项操作

**POST** `/api/v1/tasks/{task_id}/operations`

**权限**：`reviewer`（且为当前 assigned_reviewer）

**请求体**：

```json
{
  "risk_item_id": "risk-uuid-xxxx",
  "action": "edit",
  "reject_reason": null,
  "edited_fields": {
    "risk_level": "medium",
    "risk_description": "修改后的风险描述内容",
    "reasoning": "根据合同整体语境，该条款风险等级应为 medium。"
  },
  "operated_at": "2026-04-15T11:05:00+08:00"
}
```

| 字段 | 类型 | 必填条件 | 说明 |
|------|------|---------|------|
| `risk_item_id` | string | 是 | 目标风险项 ID，必须属于此 task_id |
| `action` | string | 是 | 枚举：`approve` / `edit` / `reject_item` / `annotate` |
| `reject_reason` | string | `action=reject_item` 时必填 | ≥ 10 字符，后端二次校验 |
| `edited_fields` | object | `action=edit` 时必填 | 仅允许 `risk_level`、`risk_description`、`reasoning` 三个字段 |
| `operated_at` | string | 是 | 前端传递操作时间戳（ISO 8601） |

**后端执行顺序**：
1. 校验 task_id 存在且状态为 `human_reviewing`
2. 校验请求人为 `assigned_reviewer_id`
3. 校验 `risk_item_id` 属于该任务
4. 若 `action=reject_item`，校验 `reject_reason` ≥ 10 字符
5. 若 `action=edit`，校验 `edited_fields` 中字段名在允许范围内，记录 `original_value` 和 `new_value`
6. 写入 `HumanReviewOperation` 记录
7. 若 `action=edit`，写入对应 `EditRecord` 记录
8. 更新 `RiskItem.reviewer_status`：`approve→approved`，`edit→edited`，`reject_item→reviewer_rejected`
9. 写入 `AuditLog`（`event_type=human_action`）
10. 触发 LangGraph `Command(resume=...)` 推进工作流

**响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "operation_id": "op-uuid-xxxx",
    "risk_item_id": "risk-uuid-xxxx",
    "reviewer_status": "edited",
    "pending_critical_high_count": 2
  }
}
```

| 响应字段 | 类型 | 说明 |
|---------|------|------|
| `operation_id` | string | 新创建的操作记录 ID |
| `risk_item_id` | string | 操作的风险项 ID |
| `reviewer_status` | string | 操作后该风险项的状态 |
| `pending_critical_high_count` | integer | 当前任务中仍未处理的 Critical/High 条目数，前端用于判断"完成审核"按钮是否可用 |

---

### 6.2 添加批注

**POST** `/api/v1/tasks/{task_id}/annotations`

**权限**：`reviewer`（且为当前 assigned_reviewer）

**请求体**：

```json
{
  "risk_item_id": "risk-uuid-xxxx",
  "content": "此条款需要与甲方总协议第3章核对，建议线下沟通。"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `risk_item_id` | string | 否 | 不传则为任务级批注；传则为条目级批注 |
| `content` | string | 是 | 批注内容，MVP 不限字数 |

**响应**（HTTP 201）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "annotation_id": "ann-uuid-xxxx",
    "review_task_id": "task-uuid-xxxx",
    "risk_item_id": "risk-uuid-xxxx",
    "operator_id": "user-uuid-xxxx",
    "content": "此条款需要与甲方总协议第3章核对，建议线下沟通。",
    "created_at": "2026-04-15T11:08:00+08:00"
  }
}
```

---

### 6.3 完成审核

**POST** `/api/v1/tasks/{task_id}/complete`

**权限**：`reviewer`（且为当前 assigned_reviewer）

**请求体**：（无需 body，POST 空 body 即可）

**后端执行顺序**：
1. 校验 task_id 状态为 `human_reviewing`
2. 校验请求人为 `assigned_reviewer_id`
3. **统计当前任务中 `risk_level IN (critical, high) AND reviewer_status = pending` 的条目数，若 > 0，返回 `CRITICAL_HIGH_NOT_ALL_HANDLED`（422）**
4. 触发 LangGraph `Command(resume=...)` 进入 `finalize_node`
5. 状态流转至 `completed`
6. 写入 `ReviewTask.completed_at`
7. 写入 `AuditLog`

**响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task_id": "task-uuid-xxxx",
    "status": "completed",
    "completed_at": "2026-04-15T11:20:00+08:00"
  }
}
```

---

### 6.4 整体驳回任务

**POST** `/api/v1/tasks/{task_id}/reject`

**权限**：`reviewer`（且为当前 assigned_reviewer）；任意状态（非终态）均可调用。

**请求体**：

```json
{
  "reject_reason": "文档内容与业务实际情况严重不符，无法基于此文本完成审核，需重新提交。"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `reject_reason` | string | 是 | ≥ 20 字符，后端二次校验 |

**后端执行顺序**：
1. 校验任务当前状态不是终态（`parse_failed`、`completed`、`rejected`），否则 `TASK_STATUS_CONFLICT`
2. 校验 `reject_reason` ≥ 20 字符，否则 `REJECT_REASON_TOO_SHORT`
3. 状态立即流转至 `rejected`（终态，不可恢复）
4. 写入 `HumanReviewOperation`（`action=reject_task`）
5. 写入 `AuditLog`
6. 通过 WebSocket 推送 `task_rejected` 事件

**响应**（HTTP 200）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task_id": "task-uuid-xxxx",
    "status": "rejected",
    "reject_reason": "文档内容与业务实际情况严重不符……"
  }
}
```

---

## 七、WebSocket 实时推送规范

### 7.1 连接地址

```
ws://<host>/ws/v1/tasks/{task_id}/progress
```

**认证方式**：在查询参数中传递 token：

```
ws://<host>/ws/v1/tasks/{task_id}/progress?token=<access_token>
```

**连接时机**：在 `POST /upload/complete` 成功后立即建立连接。

### 7.2 统一消息格式（服务端 → 客户端）

```json
{
  "event": "<事件名>",
  "task_id": "<ReviewTask UUID>",
  "stage": "<当前阶段，可选>",
  "progress": 0,
  "message": "<用户可读文案>",
  "data": { }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `event` | string | 事件类型（见下表） |
| `task_id` | string | ReviewTask ID |
| `stage` | string\|null | 当前阶段标识，可选 |
| `progress` | integer | 0–100 进度值，仅上传/解析阶段有意义 |
| `message` | string | 前端直接展示的文案，使用进行时（"解析中…"） |
| `data` | object\|null | 附加业务数据，按事件类型不同 |

### 7.3 事件类型详细规范

| 事件名 | 触发时机 | `progress` | `data` 内容 |
|-------|---------|-----------|------------|
| `upload_progress` | 分片上传进度节点 | 0–40 | `{"uploaded_parts": 2, "total_parts": 3}` |
| `parse_progress` | 解析引擎工作中 | 40–70 | `{"engine": "paddleocr"}` |
| `quality_check` | OCR 质量门控完成 | 70–85 | `{"ocr_quality_score": 88.5, "ocr_quality_level": "high"}` |
| `parse_complete` | 解析成功 | 100 | `{"document_type": "procurement_contract"}` |
| `parse_failed` | 解析失败 | — | `{"error_code": "OCR_QUALITY_TOO_LOW", "error_message": "..."}` |
| `auto_review_layer1` | Layer 1 完成 | — | `{"document_type": "nda"}` |
| `auto_review_layer2` | Layer 2 完成 | — | `{"rule_matched_count": 12}` |
| `auto_review_layer3` | Layer 3 完成 | — | `{}` |
| `auto_review_complete` | 自动审核全部完成 | — | `{"risk_level_summary": "high", "critical_count": 0, "high_count": 3}` |
| `auto_review_failed` | 自动审核失败 | — | `{"error_code": "MODEL_TIMEOUT", "retry_count": 1}` |
| `hitl_required` | HITL 触发，等待人工 | — | `{"assigned_reviewer_id": "user-uuid-xxxx", "sla_deadline": "..."}` |
| `task_completed` | 整个审核流程完成 | — | `{"overall_risk_score": 68.0, "risk_level_summary": "high"}` |
| `task_rejected` | 任务被驳回 | — | `{"reject_reason": "..."}` |

### 7.4 客户端心跳规范

- 客户端每 30 秒发送一次 `{"type": "ping"}`
- 服务端回复 `{"type": "pong"}`
- 超过 60 秒无 pong 应视为连接断开，客户端重连

### 7.5 连接断开处理

任务进入终态（`completed`、`rejected`、`parse_failed`）后，服务端主动关闭 WebSocket 连接（发送 close frame）。前端不需要对终态任务保持连接。

---

## 八、前后端联调接入顺序

本节描述**前端按哪个顺序接入各接口**，以及每步的依赖关系和验收标准。

### 8.1 阶段一：上传与进度推送（优先接入）

```
Step 1  POST /api/v1/upload/init
          ↓ 拿到 chunk_upload_id + presigned_url 列表
Step 2  PUT <presigned_url> × N（前端直传 S3，收集 ETag）
          ↓ 记录每片 ETag
Step 3  POST /api/v1/upload/complete（提交 parts 列表）
          ↓ 拿到 task_id + document_id，status=uploaded
Step 4  WS /ws/v1/tasks/{task_id}/progress（建立 WebSocket 连接）
          ↓ 监听 upload_progress / parse_progress / quality_check / parse_complete
```

**验收标准**：
- 分片上传进度条正常推进（0→40→70→100）
- 解析成功后页面自动跳转到审核等待页
- 解析失败时展示对应错误码对应的文案

---

### 8.2 阶段二：自动审核进度展示

```
Step 5  WS 继续监听（已建立连接）
          ↓ 监听 auto_review_layer1 / auto_review_layer2 / auto_review_layer3 / auto_review_complete
Step 6  收到 auto_review_complete 后，调用：
        GET /api/v1/tasks/{task_id}
          ↓ 拿 task.status（判断是否需要 HITL）
          ↓ 拿 review_result（overview panel 数据）
```

**验收标准**：
- Layer 1/2/3 分层进度展示正常
- `auto_review_complete` 收到后，能正确渲染风险评分总览
- 若 `task.status = completed`（无需 HITL），直接跳转到结果页

---

### 8.3 阶段三：人工审核界面加载

```
Step 7  收到 hitl_required 事件 或 GET /tasks/{task_id} 返回 status=human_reviewing 时：
        GET /api/v1/tasks/{task_id}/risk-items（默认不过滤，加载全量）
          ↓ 渲染右侧风险列表面板
Step 8  GET /api/v1/tasks/{task_id}/risk-items?risk_level=critical,high（过滤高危）
          ↓ 在列表顶部优先渲染 Critical/High 条目
Step 9  统计 risk_items 中 risk_level IN (critical,high) AND reviewer_status=pending 的数量
          ↓ 前端维护"待处理计数"，用于控制"完成审核"按钮 disabled 状态
```

**验收标准**：
- 风险列表正确渲染，`confidence_category` 颜色规范（fact→绿，clause→黄，legal→橙）
- `legal` 类别的条目必须展示 `reasoning` 字段
- 点击风险条目触发 PDF 定位（左侧跳转至 `location_page` / `location_paragraph`）

---

### 8.4 阶段四：人工审核操作

```
Step 10  同意/编辑/单条驳回：
         POST /api/v1/tasks/{task_id}/operations
           ↓ 拿到 reviewer_status + pending_critical_high_count
           ↓ 前端更新对应条目状态标记，更新待处理计数

Step 11  添加批注（独立操作，不影响 reviewer_status）：
         POST /api/v1/tasks/{task_id}/annotations

Step 12  待处理计数降为 0 后，"完成审核"按钮变为可点击：
         POST /api/v1/tasks/{task_id}/complete
           ↓ 拿到 status=completed + completed_at

Step 13（可选）整体驳回：
         POST /api/v1/tasks/{task_id}/reject
           ↓ 二次确认弹窗（前端）→ 请求 → WS 收到 task_rejected 事件 → 跳转驳回结果页
```

**验收标准**：
- 操作后条目状态标记即时更新（不需要刷新整页）
- 编辑后展示 diff（`original_value` vs `new_value`）
- `pending_critical_high_count` 降为 0 才能点击"完成审核"
- 整体驳回需通过前端二次确认弹窗防误操作

---

### 8.5 阶段五：结果查阅与历史追溯

```
Step 14  GET /api/v1/tasks/{task_id}/result（仅 completed 状态）
           ↓ 渲染最终审核报告

Step 15  GET /api/v1/tasks/{task_id}/operations（操作历史）
           ↓ 展示操作记录 + EditRecord diff

Step 16  GET /api/v1/tasks/{task_id}/annotations（批注列表）

Step 17  GET /api/v1/tasks/{task_id}/audit-logs（审计日志，管理员视角）
```

**验收标准**：
- 完成状态任务可正常加载审核报告
- 编辑操作的 diff 可展示（`edited_field` / `original_value` / `new_value`）
- 审计日志分页功能正常

---

### 8.6 接口依赖关系汇总

```
upload/init
    └─→ upload/chunk(S3直传)
            └─→ upload/complete
                    └─→ WS 连接（task_id 来自 complete 响应）
                    └─→ GET /tasks/{task_id}（轮询降级方案，正常路径用 WS）
                            └─→ GET /tasks/{task_id}/risk-items
                                    └─→ POST /tasks/{task_id}/operations（× N）
                                    └─→ POST /tasks/{task_id}/annotations（× N）
                                    └─→ POST /tasks/{task_id}/complete
                                                └─→ GET /tasks/{task_id}/result
                                    └─→ POST /tasks/{task_id}/reject（任意时刻）
```

---

## 九、接口约束汇总

### 9.1 后端必须独立校验（不信任前端）

| 校验项 | 接口 | 规则 |
|--------|------|------|
| 文件格式 | `POST /upload/init` | MIME 类型白名单校验 |
| 文件大小 | `POST /upload/init` | ≤ 50MB |
| 融资股权文件拦截 | `POST /upload/complete` | 内容关键词深度检测，命中则不创建任何记录 |
| ETag 完整性 | `POST /upload/complete` | 所有分片 ETag 必须收齐且与 S3 一致 |
| HITL 触发判断 | 后端自动（不通过前端） | 风险≥High / 置信度<50% / 未知文档类型，任一满足即触发 |
| `confidence_category` 计算 | `GET /risk-items` | ≥90→fact，70-89→clause，<70→legal，后端计算，前端只渲染 |
| 审核人身份校验 | 所有 `POST /tasks/{id}/operations` 类接口 | 必须为 `assigned_reviewer_id` |
| 驳回理由长度 | `POST /operations`（reject_item） | ≥ 10 字符 |
| 驳回理由长度 | `POST /reject` | ≥ 20 字符 |
| 完成审核前置条件 | `POST /complete` | `risk_level IN (critical,high) AND reviewer_status=pending` 数量必须为 0 |
| 终态任务保护 | 所有写接口 | `completed`、`rejected`、`parse_failed` 状态的任务不接受任何写操作 |
| 可编辑字段范围 | `POST /operations`（edit） | `edited_fields` 只允许 `risk_level`、`risk_description`、`reasoning` |

### 9.2 前端禁止自行计算的字段

| 字段 | 理由 |
|------|------|
| `confidence_category` | 后端按评分阈值计算，前端仅做颜色渲染 |
| `reviewer_status` | 由后端操作接口驱动变更，前端不得直接修改本地状态 |
| HITL 是否触发 | 纯后端决策，前端不得预判或绕过 |
| 状态机路径 | 后端唯一执行方，前端只消费 `task.status` |

### 9.3 不可暴露给前端的字段

| 字段 | 实体 | 说明 |
|------|------|------|
| `storage_path` | `Document` | S3 内部路径，前端通过预签名 URL 访问 |
| `vector_db_version` | `ReviewTask` | 内部审计字段，不展示 |
| `hitl_trigger_reasons` | `ReviewResult` | 内部判断逻辑，不展示 |
| `min_confidence_score` | `ReviewResult` | 内部计算字段 |
| `parse_engine_used` | `Document` | 内部技术字段 |

### 9.4 审计日志强制写入时机

| 时机 | `event_type` | 必填 `detail` 字段 |
|------|-------------|------------------|
| 任务状态每次变更 | `task_status_change` | `old_status`、`new_status`、`trigger`（system/user） |
| 任何人工操作提交 | `human_action` | `action`、`operator_id`、`risk_item_id`（若有）、`operated_at` |
| ReviewTask 创建时 | `vector_db_bind` | `vector_db_version`、`task_id`、`created_at` |

---

*本文档作为前端实现计划（09_frontend_plan）和后端实现计划（10_backend_plan）的直接输入接口规范，所有字段定义均可在上游数据模型文档中找到对应依据。*
