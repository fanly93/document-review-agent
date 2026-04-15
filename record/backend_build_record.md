# 后端构建与测试记录

**日期**：2026-04-15  
**阶段**：后端 MVP 开发完成  
**用途**：供前后端联调参考

---

## 一、项目启动方式

```bash
cd /Users/tanglin/VibeCoding/AgentTeamProject/backend

# 启动服务
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 运行端到端测试
python3 tests/test_e2e.py
```

> **注意**：使用系统 Python（`/opt/miniconda3/bin/python3`），不使用 uv venv。  
> uv 包管理器在本机 TLS 握手失败，依赖通过 `pip install` 直接安装到系统环境。

**已安装的关键依赖**：
- fastapi、uvicorn、langgraph、langchain、langchain-openai
- sqlalchemy、python-jose、bcrypt（直接用，不用 passlib）
- pydantic、python-dotenv、httpx

---

## 二、后端目录结构

```
backend/
├── app/
│   ├── main.py                   # FastAPI 入口，路由注册，WebSocket 端点，startup 建表
│   ├── config.py                 # 配置（读取项目根目录 .env）
│   ├── core/
│   │   ├── llm_provider.py       # LLM 工厂（DeepSeek/DashScope 切换）
│   │   ├── security.py           # JWT + bcrypt（直接用 bcrypt 包，不用 passlib）
│   │   ├── errors.py             # 统一错误码 + raise_error()
│   │   └── state_machine.py      # 状态机合法转移校验
│   ├── workflow/
│   │   ├── state.py              # ReviewState TypedDict + Reducer
│   │   ├── nodes.py              # 7个核心节点（含 human_decision_node 的 interrupt()）
│   │   ├── graph.py              # StateGraph 组装，get_review_graph() 单例
│   │   └── checkpointer.py       # MemorySaver（开发），NotImplementedError（生产）
│   ├── workers/
│   │   ├── celery_app.py         # Celery 初始化（Redis broker）
│   │   └── document_tasks.py     # parse_document Celery 任务
│   ├── hitl/
│   │   ├── interrupt_handler.py  # resume_graph()，get_thread_id()
│   │   ├── reviewer_assign.py    # assign_reviewer()（MVP 固定返回 reviewer-001）
│   │   └── decision_processor.py # 四类操作处理（approve/edit/reject/annotate）
│   ├── websocket/
│   │   ├── manager.py            # WebSocketManager 单例（按 task_id 分组）
│   │   └── events.py             # 标准事件格式构建函数
│   ├── models/                   # SQLAlchemy ORM（8张表）
│   │   ├── base.py               # BaseModel（UUID PK，created_at，updated_at）
│   │   ├── user.py               # User（legal_staff / reviewer / manager）
│   │   ├── document.py           # Document
│   │   ├── review_task.py        # ReviewTask（11态状态机枚举）
│   │   ├── risk_item.py          # RiskItem
│   │   ├── human_review.py       # HumanReview
│   │   └── audit_log.py          # AuditLog（只允许 INSERT）
│   ├── schemas/                  # Pydantic v2
│   │   ├── upload.py
│   │   ├── task.py
│   │   ├── risk_item.py
│   │   └── review.py             # 含 AuthRegisterRequest / AuthLoginRequest
│   ├── services/
│   │   ├── upload_service.py     # 分片上传（内存会话，MVP 本地存储）
│   │   ├── task_service.py       # 任务创建 + 状态转移 + AuditLog 写入
│   │   └── review_service.py     # 提交人工审核决策 + LangGraph resume
│   ├── api/
│   │   ├── deps.py               # JWT Bearer Token 依赖注入
│   │   └── v1/
│   │       ├── auth.py           # 注册/登录/用户列表
│   │       ├── upload.py         # 上传初始化/完成
│   │       ├── tasks.py          # 任务详情/风险项/审计日志
│   │       ├── review.py         # 提交审核操作/驳回/调试触发工作流
│   │       └── router.py         # 路由聚合
│   └── db/
│       └── session.py            # SQLAlchemy engine（SQLite），create_tables()
├── tests/
│   └── test_e2e.py               # MVP 端到端测试（27个用例，纯 urllib，无 pytest 依赖）
└── uploads/                      # MVP 本地文件存储目录
```

---

## 三、API 接口清单

**Base URL**：`http://localhost:8000/api/v1`  
**认证方式**：`Authorization: Bearer <JWT Token>`

### 认证接口（无需 Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 注册用户（role: legal_staff / reviewer / manager） |
| POST | `/auth/login` | 登录，返回 JWT access_token |
| GET  | `/auth/users` | 列出所有用户（MVP 调试用） |

### 上传接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/upload/init` | 任意登录用户 | 初始化上传，返回 chunk_upload_id |
| POST | `/upload/complete` | 任意登录用户 | 完成上传，创建 Document + ReviewTask |

### 任务查询接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/tasks/{task_id}` | 任务详情（含 document、review_result） |
| GET | `/tasks/{task_id}/risk-items` | 风险项列表（支持 risk_level 过滤、分页） |
| GET | `/tasks/{task_id}/audit-logs` | 审计日志（只增不改） |

### 人工审核接口（需 reviewer 角色）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/tasks/{task_id}/operations` | 提交审核决策（approve/edit/reject/annotate） |
| POST | `/tasks/{task_id}/reject` | 整体驳回任务 |

### 调试接口（MVP 专用）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/tasks/{task_id}/debug/trigger-workflow` | 跳过 Celery，直接同步触发 LangGraph 工作流 |

### WebSocket

```
ws://localhost:8000/ws/v1/tasks/{task_id}/progress
```

事件格式：`{"event": "...", "task_id": "...", "stage": "...", "progress": 0, "message": "..."}`

---

## 四、LangGraph 工作流说明

**Thread ID 规范**：`f"review-task-{task_id}"`

**状态流转路径**：

```
uploaded → parsing → parsed → auto_reviewing → auto_reviewed
                                                    ↓
                                        需要HITL？ → human_reviewing → completed
                                        不需要HITL → completed
```

**HITL 触发条件**（任一满足）：
- 任一风险项 `risk_level` 为 `high` 或 `critical`
- 任一风险项 `confidence < 0.5`
- `document_metadata.file_type == "unknown"`

**MVP auto_review_node 说明**：
- Layer 3 LLM 分析为**模拟结果**（输出 medium 级别风险项，不实际调用 LLM）
- 默认文档类型识别为 `general_contract`（不触发 HITL）
- 如需测试 HITL 链路，可在文件名中包含"违约"或"赔偿"触发 high 级风险项

---

## 五、LLM 模型接入

通过 `.env` 中的 `LLM_PROVIDER` 环境变量切换，默认 `deepseek`：

```bash
# DeepSeek（默认）
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat

# DashScope/Qwen
LLM_PROVIDER=dashscope
DASHSCOPE_API_KEY=sk-xxx
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen-max
```

调用方式：
```python
from app.core.llm_provider import get_review_llm
llm = get_review_llm()
response = llm.invoke("分析以下合同条款...")
```

---

## 六、MVP 与生产的差异（联调注意事项）

| 项目 | MVP 当前实现 | 生产需要 |
|------|------------|---------|
| 数据库 | SQLite（`review.db`） | PostgreSQL 16 |
| Checkpointer | MemorySaver（重启丢失） | PostgresCheckpointer |
| 文件存储 | 本地 `uploads/` 目录，模拟内容 | S3 兼容对象存储 |
| 工作流触发 | 同步调用（`/debug/trigger-workflow`） | Celery + Redis 异步队列 |
| LLM 分析 | Layer 3 为模拟结果 | 真实 LLM 调用 |
| 审核人分配 | 固定返回 `reviewer-001` | 从数据库查询分配 |

---

## 七、测试结果

**运行命令**：`python3 tests/test_e2e.py`  
**结果**：**27/27 全部通过**

| 测试项 | 结果 |
|--------|------|
| 服务健康检查 | ✓ |
| 用户注册 | ✓ |
| 用户登录（获取 JWT Token） | ✓ |
| 融资股权文件 403 拦截 | ✓ |
| 超大文件 400 拦截 | ✓ |
| 文档上传初始化 (201) | ✓ |
| 文档上传完成 (201) | ✓ |
| 任务详情查询 | ✓ |
| 不存在任务 404 | ✓ |
| LangGraph 完整工作流触发 | ✓ |
| 工作流产出最终状态（completed） | ✓ |
| 工作流产出风险项（2个） | ✓ |
| 风险项分页查询 | ✓ |
| 审计日志查询 | ✓ |
| 审计日志有记录 | ✓ |
| 状态机冲突 409 | ✓ |
| TASK_NOT_FOUND 错误码 | ✓ |
| DOCUMENT_TYPE_FORBIDDEN 错误码 | ✓ |
| 其他校验用例 9项 | ✓ |

---

## 八、已知问题与遗留事项

### 问题 1：风险项未入库
**现象**：工作流触发后 `GET /tasks/{task_id}/risk-items` 返回空列表（total: 0），但工作流内存状态中产出了 2 个风险项。  
**原因**：LangGraph 工作流节点产出的 `risk_items` 存储在图状态（MemorySaver）中，未同步写入数据库 `risk_items` 表。  
**修复方向**：在 `finalize_node` 完成后，由 `upload.py` 或工作流回调将 `risk_items` 批量 INSERT 到数据库。

### 问题 2：HITL 数据库集成未验证
**现象**：`POST /tasks/{task_id}/operations` 的 `review_service` 调用了 `resume_graph()`，但 HITL 链路（`human_reviewing` 状态下的 interrupt/resume）未经完整数据库入库测试。  
**原因**：MVP auto_review_node 默认生成中等风险项，不触发 HITL，`task.status` 停留在 `uploaded`（工作流触发后状态未同步回数据库）。  
**修复方向**：工作流节点需在关键状态变更时同步调用 `task_service.transition_task_status()` 写库。

### 问题 3：工作流状态未同步数据库
**现象**：工作流执行完毕后数据库中 `review_tasks.status` 仍为 `uploaded`，未变为 `completed`。  
**原因**：LangGraph 节点只更新图状态 `current_status`，未调用数据库写入函数。  
**修复方向**：在各节点（`parse_node`、`auto_review_node`、`finalize_node`）中注入 db session 并调用 `transition_task_status()`，或在工作流执行完成后由调用方统一同步。

### 问题 4：passlib 与 bcrypt 兼容性
**现象**：`passlib.context.CryptContext` 在 Python 3.13 + bcrypt 5.x 下抛出 `ValueError: password cannot be longer than 72 bytes`。  
**已修复**：`security.py` 改为直接使用 `bcrypt` 包（`bcrypt.hashpw` / `bcrypt.checkpw`），绕过 passlib。

---

## 九、前后端联调建议

1. **先跑通认证流程**：前端登录获取 Token → 放入请求头 `Authorization: Bearer <token>`

2. **上传流程联调顺序**：
   - `POST /upload/init` → 获取 `chunk_upload_id`
   - MVP 阶段跳过分片直传，直接 `POST /upload/complete`（parts 传任意 etag）
   - 获取 `task_id` 后，调用 `POST /tasks/{task_id}/debug/trigger-workflow` 触发工作流

3. **修复风险项入库（问题1）后**，`GET /tasks/{task_id}/risk-items` 才能返回真实数据

4. **HITL 测试**：触发 HITL 需上传文件名包含"违约"，使 auto_review_node 生成 high 级风险项；或修改 `nodes.py` 的 `hitl_trigger_check` 逻辑强制触发

5. **WebSocket 连接**：complete 上传后立即连接 `ws://localhost:8000/ws/v1/tasks/{task_id}/progress` 监听状态变更事件
