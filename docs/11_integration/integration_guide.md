# 前后端联调指南

**阶段**：11_integration  
**日期**：2026-04-20  
**版本**：v2.0（本次联调完成）  
**联调结果**：✅ 全部接口测试通过

---

## 一、环境启动方式

### 后端

```bash
cd /Users/tanglin/VibeCoding/AgentTeamProject/backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

> 使用系统 Python（`/opt/miniconda3/bin/python3`）  
> 依赖已通过 `pip install` 安装到系统环境

### 前端

```bash
cd /Users/tanglin/VibeCoding/AgentTeamProject/frontend
npm run dev
# 默认地址：http://localhost:5173/
```

---

## 二、接口联调状态总表

### 已完成真实对接（17个接口）

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/auth/register` | POST | ✅ | 前端 auth.ts 自动注册 |
| `/auth/login` | POST | ✅ | 返回 JWT，存入 localStorage |
| `/upload/init` | POST | ✅ | 返回 chunk_upload_id + upload_parts |
| `/upload/complete` | POST | ✅ | 后台自动触发 LangGraph 工作流 |
| `/documents` | GET | ✅ | 支持逗号分隔的多状态过滤 |
| `/tasks/{id}` | GET | ✅ | 含 document、review_result |
| `/tasks/{id}/risk-items` | GET | ✅ | 支持 risk_level 过滤 + 分页 |
| `/tasks/{id}/result` | GET | ✅ | 仅 completed 状态可访问 |
| `/tasks/{id}/operations` | GET | ✅ | 操作历史列表 |
| `/tasks/{id}/operations` | POST | ✅ | approve/edit/reject_item/annotate |
| `/tasks/{id}/annotations` | POST | ✅ | 创建批注 |
| `/tasks/{id}/annotations` | GET | ✅ | 批注列表 |
| `/tasks/{id}/complete` | POST | ✅ | 完成人工审核（仅 human_reviewing） |
| `/tasks/{id}/reject` | POST | ✅ | 驳回任务（支持 human_reviewing 等状态） |
| `/tasks/{id}/audit-logs` | GET | ✅ | 审计日志 |
| `ws://…/tasks/{id}/progress` | WS | ✅ | 工作流进度推送 |
| `/tasks/{id}/debug/trigger-workflow` | POST | ✅ | 调试接口（不写 DB，仅返回结果） |

### 后端未实现，前端保留 mock 标注

| 接口 | 说明 |
|------|------|
| `GET /tasks/{id}/extractions` | 条款提取接口未开发 |
| `GET /tasks/{id}/document` | 文件下载/预览接口未开发 |
| `POST /tasks/{id}/retry` | 重试接口未开发 |
| `POST /tasks/{id}/escalate-to-human` | 升级人工接口未开发 |
| `POST /tasks/{id}/reassign` | 重新分配接口未开发 |

---

## 三、本次联调修复的 Bug

### Bug 1：`GET /documents` 不支持多状态过滤
**位置**：`backend/app/api/v1/documents.py`  
**问题**：`TaskStatus(status)` 无法解析逗号分隔的多值（如 `completed,uploaded`），前端筛选"进行中"等多状态失效。  
**修复**：改为按逗号拆分后逐一转换，用 `IN` 查询。

### Bug 2：`GET /tasks/{id}/operations` 500 错误
**位置**：`backend/app/api/v1/tasks.py`  
**问题**：`HumanReview.operated_at` 是 `String` 列，代码错误调用了 `.isoformat()`（字符串没有此方法）。  
**修复**：直接返回字符串字段，不再调用 `.isoformat()`。

### Bug 3：`POST /tasks/{id}/operations` 后 reviewer_status 未写库
**位置**：`backend/app/services/review_service.py`  
**问题**：`submit_review_decisions` 只写入 `HumanReview` 记录，未将 `reviewer_status` 更新写回 `RiskItem` 表，导致 `POST /complete` 始终报 `CRITICAL_HIGH_NOT_ALL_HANDLED`。  
**修复**：在写入 `HumanReview` 记录之后，遍历 `result["updated_risk_items"]` 同步更新数据库中 `RiskItem` 的 `reviewer_status`、`risk_level`、`risk_description`。

### Bug 4：前端 client.ts 遗留 USE_MOCK 死代码 + 6 个接口未对接
**位置**：`frontend/src/app/api/client.ts`  
**问题**：`USE_MOCK` 常量未定义（靠 undefined 为 falsy 偶然走真实 API）；`getDocuments`、`getTaskResult`、`getOperations`、`getAnnotations`、`addAnnotation`、`completeReview` 6 个函数直接返回 mock 数据，未调用后端。  
**修复**：全量重写 `client.ts`，删除所有 mock 引用和死代码，将 6 个函数改为真实 API 调用。

---

## 四、完整流程验证结果

### 流程 A：文档上传 → 自动审核 → 完成

| 步骤 | 接口 | 结果 |
|------|------|------|
| 1 | POST /upload/init | ✅ 返回 chunk_upload_id |
| 2 | POST /upload/complete | ✅ 返回 task_id，后台自动触发工作流 |
| 3 | GET /tasks/{id}（轮询） | ✅ status 从 uploaded → completed（1秒内） |
| 4 | GET /tasks/{id}/risk-items | ✅ 返回 1 条 medium 风险项 |
| 5 | GET /tasks/{id}/result | ✅ overall_risk_score=50.0 |

### 流程 B：HITL 人工审核完整链路

| 步骤 | 接口 | 结果 |
|------|------|------|
| 1 | POST /upload/complete（含"违约"文件名） | ✅ 触发 high 风险项 |
| 2 | 后台工作流 | ✅ status → human_reviewing（约4秒） |
| 3 | GET /tasks/{id}/risk-items | ✅ 2 条风险项（1 high + 1 medium） |
| 4 | POST /tasks/{id}/operations (approve) | ✅ reviewer_status → approved（已写库） |
| 5 | POST /tasks/{id}/annotations | ✅ 创建批注成功 |
| 6 | GET /tasks/{id}/operations | ✅ 返回操作历史 |
| 7 | POST /tasks/{id}/complete | ✅ status → completed |
| 8 | GET /tasks/{id}/audit-logs | ✅ 4 条日志记录 |

### 流程 C：驳回

| 步骤 | 接口 | 结果 |
|------|------|------|
| 1 | POST /tasks/{id}/reject（from human_reviewing） | ✅ status → rejected |
| 2 | POST /tasks/{id}/reject（from uploaded） | ✅ 正确返回 409 TASK_STATUS_CONFLICT |

---

## 五、已知限制（MVP）

| 项目 | 说明 |
|------|------|
| LLM 调用 | LangGraph 节点降级为模拟结果（LLM_PROVIDER 未配置时 ImportError） |
| 分片上传 | `upload_parts` 返回本地占位 URL，PUT 返回 404，etag 为空字符串，后端不校验，可正常完成上传 |
| 审核人分配 | MVP 固定允许任意登录用户提交审核决策（生产环境需恢复角色校验） |
| 数据库 | SQLite，重启不丢数据（MemorySaver 图状态重启后丢失，已通过 sync_workflow_to_db 持久化到 DB） |
