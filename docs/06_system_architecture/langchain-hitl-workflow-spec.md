# LangGraph 文档审核 HITL 工作流规范

**阶段**：06_system_architecture  
**输出方**：Teammate 2（architect）  
**日期**：2026-04-14  
**依据文档**：
- `docs/04_interaction_design/human_review_hitl_flow.md`
- `docs/04_interaction_design/review_state_handling_flow.md`
- `docs/04_interaction_design/interactive-design-spec-v1.0.md`
- LangChain/LangGraph 官方文档（通过 MCP 工具查询）

---

## 一、文档目标与范围

### 1.1 目标

本文档基于 LangGraph 框架的最新 HITL 实现机制，为文档审核工作流的后端系统架构设计提供完整的技术规范。规范涵盖：
- 如何利用 LangGraph 的 `interrupt()` 机制实现暂停与人工干预
- 审核工作流的状态设计（State Schema）
- 中断点的触发与数据传递协议
- 人工操作与图恢复流程
- 持久化与会话管理策略

### 1.2 范围与边界

**范围内**：
- LangGraph StateGraph 的核心组件设计
- Interrupt/Resume 机制的应用模式
- Checkpointer 与 Thread ID 的会话管理
- 审核工作流的 7 个核心节点与边定义

**范围外**：
- 具体的 Python 实现代码（交由后续 backend_plan 阶段）
- LangSmith 可视化工具的配置（工程细节）
- 前端 UI 与图的交互协议（交由 API 规范）

---

## 二、LangGraph HITL 核心机制说明

### 2.1 Interrupt 机制：暂停执行的桥梁

LangGraph 提供 `interrupt()` 函数，允许在任何图节点内部任意位置调用，实现动态暂停执行：

```python
from langgraph.types import interrupt

def human_review_node(state: ReviewState):
    # 在这里暂停，等待人工输入
    approved = interrupt({
        "action": "review_required",
        "risk_items": state["risk_items"],
        "confidence": state["overall_confidence"]
    })
    # 当后端调用 Command(resume=approved) 时，执行继续
    return {"human_decision": approved}
```

**关键特性**：
- **动态中断**：与静态 breakpoint 不同，interrupt 可根据业务逻辑条件判断是否实际触发
- **自动状态保存**：调用 interrupt 时，LangGraph 自动通过 checkpointer 保存当前图状态
- **等待时间无限**：图将无限期等待，直到调用 `Command(resume=...)` 恢复
- **状态隔离**：不同 thread_id 对应不同的中断状态，互不干扰

### 2.2 State 设计：结构化状态管理

审核工作流的状态使用 TypedDict 模式定义，每个字段可配置独立的 Reducer 函数：

```python
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages
import operator

class ReviewState(TypedDict):
    """审核工作流的完整状态"""
    document_id: str                          # 关键：文档唯一标识
    current_status: str                       # current: uploaded|parsing|parsed|auto_reviewing|auto_reviewed|human_reviewing|completed|rejected
    risk_items: Annotated[list, operator.add] # Reducer: 风险项列表累积追加
    human_reviews: Annotated[list, operator.add] # Reducer: 人工审核记录累积追加
    operator_id: str                          # 当前操作人（人工审核阶段）
    decision_log: Annotated[list, operator.add] # Reducer: 决策日志累积记录
    vector_db_version: str                    # 审核使用的向量库版本（审计用）
```

**Reducer 设计原理**：
- 使用 `operator.add` 自动合并列表：新增的 risk_items 追加而非覆盖
- 每个节点可独立返回部分状态，Reducer 自动处理合并逻辑
- 无 Reducer 字段的更新采用覆盖策略（如 `current_status`）

### 2.3 Command 和恢复流程

恢复中断的执行通过 `Command(resume=...)` 完成：

```python
from langgraph.types import Command

# 前端提交人工审核决策
resume_payload = {
    "action": "approve",
    "risk_item_id": "risk-123",
    "comment": "同意此风险等级评定"
}

# 后端调用（注意：使用相同 thread_id）
config = {"configurable": {"thread_id": "review-task-001"}}
graph.invoke(Command(resume=resume_payload), config=config)
```

**恢复规则**：
1. 必须使用与中断相同的 `thread_id`，否则无法定位到被保存的状态
2. `Command(resume=...)` 的值成为 `interrupt()` 的返回值，流向下游节点
3. 多次 resume 对应多次 interrupt，每次恢复继续执行到下一个 interrupt 或图终点
4. Resume 值必须是 JSON 可序列化的（字符串、数字、对象、列表等）

### 2.4 Checkpointer 与持久化原理

Checkpointer 负责在每个超步（super-step）后保存图状态快照，是实现中断/恢复和容错的核心：

**超步（Super-step）概念**：
```
START
  ↓ (super-step 0: 初始输入)
[checkpoint-0]
  ↓
node_a  node_b (super-step 1: 可并行执行)
  ↓ (两个节点完成后)
[checkpoint-1]
  ↓
node_c (super-step 2: 顺序执行)
  ↓
[checkpoint-2]
END
```
每个超步后自动创建检查点，保存的信息包括：
- `values`：当前状态各字段的值
- `next`：下一个待执行的节点
- `metadata`：执行元数据（source、writes、step 计数）
- `created_at`：检查点创建时间戳

**Checkpointer 选型**：

| 类型 | 适用场景 | 特点 |
|------|---------|------|
| `InMemorySaver` | 本地开发/演示 | 进程内存存储，重启丢失，单机限制 |
| `PostgresCheckpointer` | 生产环境 | 持久化到 PostgreSQL，支持分布式，数据持久 |
| `RedisCheckpointer` | 高性能生产 | 基于 Redis 缓存，适合实时性强场景，仍需持久化备份 |

**Thread ID 管理**：
- Thread ID 是持久化的唯一指针，对应一个完整的审核任务生命周期
- 建议映射关系：`thread_id = "review-task-" + review_task.id`
- 同一 review_task 的所有中断和恢复必须使用相同 thread_id

---

## 三、Graph 状态设计

### 3.1 审核工作流状态定义

基于交互设计文档的十态状态机，设计如下 State 字段映射：

```python
class ReviewState(TypedDict):
    # 任务标识（必填）
    document_id: str
    review_task_id: str
    
    # 状态管理
    current_status: str  # 取值：uploaded|parsing|parsed|auto_reviewing|auto_reviewed|human_reviewing|completed|rejected
    
    # 文档与风险信息
    document_content: str  # 解析后的文档文本
    document_metadata: dict  # {filename, file_type, page_count, ocr_quality_score}
    risk_items: Annotated[list, operator.add]  # [{id, type, level, confidence, source_text, location_paragraph}]
    
    # 人工审核阶段
    human_reviews: Annotated[list, operator.add]  # [{id, operator_id, action, comment, original_value, new_value, operated_at}]
    assigned_reviewer_id: str | None  # 当前分配的审核人ID
    
    # 审计与版本管理
    vector_db_version: str  # 审核使用的向量库版本
    decision_log: Annotated[list, operator.add]  # 完整的决策审计日志
    created_at: str  # ISO 8601 格式
    completed_at: str | None  # 审核完成时间
```

### 3.2 Reducer 配置策略

**列表累积类字段**（使用 `operator.add`）：
```python
risk_items: Annotated[list, operator.add]
```
说明：多个节点可独立返回 `{"risk_items": [new_risk_1, new_risk_2]}`，LangGraph 自动追加到列表。

**覆盖类字段**（无 Reducer）：
```python
current_status: str
assigned_reviewer_id: str | None
```
说明：每次更新直接替换，最新的值覆盖旧值。

**自定义 Reducer 示例**：
```python
def merge_human_reviews(existing: list, new: list) -> list:
    """审核记录：按时间戳排序，去重"""
    all_reviews = existing + new
    unique_reviews = {r['id']: r for r in all_reviews}
    return sorted(unique_reviews.values(), key=lambda x: x['operated_at'])

human_reviews: Annotated[list, merge_human_reviews]
```

### 3.3 输入/输出状态的分离

为了清晰的 API 契约，建议分离输入和输出状态：

```python
class ReviewInput(TypedDict):
    """图的初始输入"""
    document_id: str
    document_content: str
    vector_db_version: str

class ReviewOutput(TypedDict):
    """图的最终输出（filtered state）"""
    review_task_id: str
    final_status: str
    risk_items: list
    human_reviews: list
    completed_at: str | None

# 编译时指定
graph = StateGraph(
    OverallState,
    input_schema=ReviewInput,
    output_schema=ReviewOutput
).add_node(...).compile(checkpointer=checkpointer)
```

### 3.4 与现有数据模型的映射

| State 字段 | → | 数据模型实体 | 映射说明 |
|-----------|---|-----------|--------|
| `document_id` | → | `Document.id` | 1:1 映射 |
| `review_task_id` | → | `ReviewTask.id` | 1:1 映射 |
| `current_status` | → | `ReviewTask.status` | 枚举值一致 |
| `risk_items` | → | `RiskItem[]` | 列表映射，状态完全同步 |
| `human_reviews` | → | `HumanReview[]` | 操作记录一一对应 |
| `vector_db_version` | → | `ReviewTask.vector_db_version` | 审计追溯 |

---

## 四、节点与边设计

### 4.1 七个核心节点定义

审核工作流由以下节点组成：

#### Node 1: `parse_node` — 文档解析
- **入口状态**：`uploaded`
- **职责**：调用多引擎解析策略，提取文本
- **输出**：`document_content`, `document_metadata`
- **出口**：`parsed` 或 `parse_failed`
- **与 interrupt 的关系**：若 OCR 质量不足（<70%），可触发 interrupt 征询用户重新上传

#### Node 2: `auto_review_node` — 自动审核
- **入口状态**：`parsed`
- **职责**：调用三层审核模型生成 risk_items 和 overall_risk_score
- **输出**：`risk_items` (operator.add 累积), `overall_risk_score`
- **出口**：`auto_reviewed` 或 `auto_review_failed`
- **与 interrupt 的关系**：正常流转，不触发人工中断

#### Node 3: `hitl_trigger_check` — HITL 触发判断
- **入口状态**：`auto_reviewed`
- **职责**：根据条件判断是否需要人工审核
  - 风险等级 >= High（6 分）
  - 置信度 < 50%
  - 文档类型未知
- **输出**：`hitl_required: bool`
- **出口**：条件分岔，进入 `completed` 或 `human_reviewing`
- **与 interrupt 的关系**：若 `hitl_required=True`，触发 interrupt，将 risk_items 传送给前端

#### Node 4: `assign_reviewer_node` — 分配审核人
- **入口状态**：`human_reviewing`（需要人工审核）
- **职责**：选择合适的审核人（律师/法务），记录分配信息
- **输出**：`assigned_reviewer_id`
- **出口**：转向 Node 5
- **与 interrupt 的关系**：此节点本身不触发 interrupt，为下一个中断节点准备数据

#### Node 5: `human_decision_node` — 人工决策中断点
- **入口状态**：`human_reviewing`（等待人工输入）
- **职责**：触发 interrupt，暂停执行，等待前端提交的人工决策
- **关键代码**：
  ```python
  def human_decision_node(state: ReviewState):
      decision = interrupt({
          "action": "human_review_required",
          "risk_items": state["risk_items"],
          "operator_id": state["assigned_reviewer_id"],
          "task_id": state["review_task_id"]
      })
      return {"human_reviews": [decision]}  # Reducer 追加
  ```
- **出口**：resume 后继续到 Node 6
- **与 interrupt 的关系**：**核心中断点**，所有人工操作（approve/edit/reject）都通过这里的 resume 流程回到图

#### Node 6: `apply_decisions_node` — 应用人工决策
- **入口状态**：由 Node 5 恢复后的状态（包含 human_reviews）
- **职责**：处理人工决策，更新 risk_items 状态（标记为已批准/已编辑/已驳回）
- **输出**：更新后的 `risk_items` 状态标签
- **出口**：检查所有 Critical/High 条目是否已处理，是则 → Node 7，否则回 Node 5
- **与 interrupt 的关系**：作为从 interrupt resume 后的处理节点

#### Node 7: `finalize_node` — 完成审核
- **入口状态**：所有 Critical/High 条目已处理
- **职责**：重新计算风险评分（排除驳回的项），生成最终报告
- **输出**：`overall_risk_score` (更新), `decision_log` 完整审计记录
- **出口**：`completed` 终态
- **与 interrupt 的关系**：无中断，作为工作流的最后确定步骤

### 4.2 节点间的数据流向

```
START
  ↓
parse_node ─→ [parse_failed] (END)
  ↓
auto_review_node ─→ [auto_review_failed] (可重试)
  ↓
hitl_trigger_check
  ├─→ NO HITL: completed (END)
  └─→ HITL REQUIRED:
       ↓
    assign_reviewer_node
       ↓
    human_decision_node ◄─────────────┐
       │ [INTERRUPT 暂停]             │
       │ (等待前端 resume)            │
       ↓ [resume 恢复]                │
    apply_decisions_node              │
       ├─→ 所有 Critical/High 已处理   │
       │     ↓                        │
       │   finalize_node              │
       │     ↓                        │
       │   completed (END)            │
       │                              │
       └─→ 尚有未处理条目             │
             └──────────────────────→┘
             (回到 human_decision_node，
              等待下一次人工操作)
```

### 4.3 条件路由规则

**在 `hitl_trigger_check` 处的路由判断**：

```python
def hitl_trigger_check(state: ReviewState):
    requires_hitl = (
        any(item['level'] >= 6 for item in state['risk_items'])  # High 或 Critical
        or any(item['confidence'] < 0.5 for item in state['risk_items'])  # 置信度不足
        or state['document_metadata']['file_type'] == 'unknown'  # 文档类型未知
    )
    
    if requires_hitl:
        return {"current_status": "human_reviewing"}
    else:
        return {"current_status": "completed"}
```

**在 `apply_decisions_node` 处的循环判断**：

```python
def apply_decisions_node(state: ReviewState):
    # 统计 Critical/High 条目处理状态
    critical_high_items = [
        item for item in state['risk_items']
        if item['level'] >= 6
    ]
    all_decided = all(
        any(review['risk_item_id'] == item['id'] 
            for review in state['human_reviews'])
        for item in critical_high_items
    )
    
    if all_decided:
        return {"current_status": "completed"}
    else:
        return {"current_status": "human_reviewing"}  # 继续等待
```

---

## 五、中断点设计

### 5.1 中断条件触发规则

中断在 `human_decision_node` 中触发，条件判断在 `hitl_trigger_check` 完成。触发规则：

| 条件 | 触发类型 | 中断负载 |
|------|---------|--------|
| 风险等级 >= High（6 分） | 系统强制 | 包含该风险项的完整信息 |
| 置信度 < 50% | 系统强制 | 包含置信度等级及推理说明 |
| 文档类型未知 | 系统强制 | 提示用户选择文档类型 |
| 任何一项满足上述 | 触发中断 | 进入 `human_decision_node` 的 interrupt |

### 5.2 中断负载（Interrupt Payload）设计

当 `human_decision_node` 中的 `interrupt()` 被调用时，传递的负载包含：

```python
interrupt_payload = {
    "action": "human_review_required",
    "task_id": state["review_task_id"],
    "operator_id": state["assigned_reviewer_id"],
    "risk_items": [
        {
            "id": "risk-001",
            "type": "missing_clause",
            "level": "High",
            "confidence": 0.45,
            "source_text": "违约责任",
            "location_paragraph": 12,
            "reasoning": "该条款缺失标准的限制条款...",
            "confidence_category": "legal"  # 后端提供
        },
        # ... 其他风险项
    ],
    "overall_risk_score": 75,
    "summary_by_level": {
        "Critical": 1,
        "High": 3,
        "Medium": 5,
        "Low": 2
    }
}
```

**传递给前端的方式**（通过 stream API）：
```
stream.interrupt = {
    "value": interrupt_payload,
    "interrupts": [Interrupt(value=interrupt_payload)]
}
```

### 5.3 多个风险项的并行中断处理

当存在多个 Critical/High 条目时，LangGraph 支持在单个 interrupt 中传递所有条目，前端逐个处理：

**前端的处理流程**：
1. 接收 interrupt 负载（包含所有 risk_items）
2. 用户逐个审核、操作（同意/编辑/驳回）
3. 每个操作记录到本地队列
4. 点击"完成审核"按钮时，批量 resume：
   ```python
   resume_payload = {
       "decisions": [
           {"risk_item_id": "risk-001", "action": "approve", "comment": "..."},
           {"risk_item_id": "risk-002", "action": "edit", "new_level": "Medium", ...},
           {"risk_item_id": "risk-003", "action": "reject_item", "reason": "..."}
       ]
   }
   graph.invoke(Command(resume=resume_payload), config)
   ```

**后端处理**：
```python
def human_decision_node(state: ReviewState):
    decisions = interrupt({...})  # 返回的是 resume_payload
    
    # 所有决策在同一次 resume 中批量到达
    reviews = [
        {
            "id": str(uuid.uuid4()),
            "risk_item_id": decision["risk_item_id"],
            "action": decision["action"],
            "comment": decision.get("comment", ""),
            "operated_at": datetime.utcnow().isoformat()
        }
        for decision in decisions["decisions"]
    ]
    
    return {"human_reviews": reviews}  # Reducer 追加到列表
```

---

## 六、人工操作协议

### 6.1 同意（Approve）操作

**前端发送**：
```json
{
  "action": "approve",
  "risk_item_id": "risk-001",
  "comment": "同意此风险评定"
}
```

**后端处理**（在 `apply_decisions_node` 中）：
```python
for review in state['human_reviews']:
    if review['action'] == 'approve':
        risk_item = next(
            (item for item in state['risk_items'] if item['id'] == review['risk_item_id']),
            None
        )
        if risk_item:
            risk_item['reviewer_status'] = 'approved'
```

**数据库记录**：在 `HumanReview` 表中插入记录，`action = 'approve'`

### 6.2 编辑（Edit）操作

**前端发送**：
```json
{
  "action": "edit",
  "risk_item_id": "risk-002",
  "edited_field": "risk_level",
  "original_value": "High",
  "new_value": "Medium",
  "comment": "根据条款 A，风险等级应降为中等"
}
```

**后端处理**（在 `apply_decisions_node` 中）：
```python
for review in state['human_reviews']:
    if review['action'] == 'edit':
        risk_item = next(
            (item for item in state['risk_items'] if item['id'] == review['risk_item_id']),
            None
        )
        if risk_item:
            # 更新指定字段
            risk_item[review['edited_field']] = review['new_value']
            risk_item['reviewer_status'] = 'edited'
```

**编辑字段范围**（可编辑）：
- `risk_level`（风险等级）
- `risk_description`（风险描述）
- `reasoning`（推理说明）

**不可编辑字段**（保留 AI 原始值）：
- `risk_type`
- `location_page`, `location_paragraph`
- `confidence`（置信度）

### 6.3 驳回（Reject）操作 — 两个层级

#### 单条驳回（reject_item）
```json
{
  "action": "reject_item",
  "risk_item_id": "risk-003",
  "reason": "此条款在现代合同实践中已成为标准免责条款，不构成风险"
}
```

后端处理：
```python
risk_item['reviewer_status'] = 'reviewer_rejected'
risk_item['reject_reason'] = review['reason']
```

效果：该风险项在最终评分中被排除，但完整记录保留用于审计。

#### 整体任务驳回（reject_task）
```json
{
  "action": "reject_task",
  "reason": "文档版本过旧，建议重新提交最新版本进行审核"
}
```

后端处理：
```python
def human_decision_node(state: ReviewState):
    decision = interrupt({...})
    
    if decision.get('action') == 'reject_task':
        # 状态流转至 rejected，任务终止
        return {
            "current_status": "rejected",
            "reject_reason": decision["reason"],
            "decision_log": [{"event": "task_rejected", "reason": decision["reason"]}]
        }
```

### 6.4 批注（Annotate）的独立存储

批注可独立添加，不影响风险项的最终操作状态：

```json
{
  "action": "annotate",
  "risk_item_id": "risk-001",
  "comment": "需要咨询法律顾问团队关于此条款的最新判例"
}
```

后端处理：
```python
review = {
    "id": str(uuid.uuid4()),
    "risk_item_id": decision["risk_item_id"],
    "action": "annotate",
    "comment": decision["comment"],
    "operated_at": datetime.utcnow().isoformat()
}
return {"human_reviews": [review]}  # 通过 Reducer 追加
```

---

## 七、恢复与持久化设计

### 7.1 Checkpointer 选型建议

**开发环境**（本地测试）：
```python
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()
graph = workflow.compile(checkpointer=checkpointer)
```
- 适用场景：快速原型验证、单机演示
- 限制：重启即丢失，不支持分布式

**生产环境（推荐方案）**：
```python
from langgraph.checkpoint.postgres import PostgresCheckpointer

# 使用 PostgreSQL 持久化
checkpointer = PostgresCheckpointer(
    connection_string="postgresql://user:password@host/langgraph_db"
)
graph = workflow.compile(checkpointer=checkpointer)
```
- 优势：数据完全持久化，支持分布式，事务安全
- 配置：需提前创建 langgraph 专用数据库

**高性能方案（可选）**：
```python
from langgraph.checkpoint.redis import RedisCheckpointer

checkpointer = RedisCheckpointer(
    connection_string="redis://localhost:6379"
)
```
- 优势：低延迟，适合实时性强的场景
- 限制：需配合数据库备份（Redis 本身非持久存储）

### 7.2 Thread ID 管理与会话映射

**Thread ID 的设计**：
```python
# 映射规则：一个 ReviewTask 对应一个 Thread
thread_id = f"review-task-{review_task.id}"

# 初始化图执行
config = {"configurable": {"thread_id": thread_id}}
result = graph.invoke(
    {"document_id": doc_id, "document_content": content, ...},
    config=config
)

# 若遇到 interrupt，获取中断信息
if "__interrupt__" in result:
    interrupt_payload = result["__interrupt__"][0].value
    # 前端展示，等待用户操作
```

**会话生命周期**：
1. 创建 ReviewTask → 分配 thread_id
2. 首次调用 graph.invoke() → 执行到第一个 interrupt 或完成
3. 前端用户操作 → 后端 resume（相同 thread_id）
4. 后续 resume 继续执行 → 可能再次 interrupt
5. 最终完成 → 状态流转至 `completed` 或 `rejected`

### 7.3 State 恢复流程与超步处理

**获取当前状态快照**：
```python
config = {"configurable": {"thread_id": "review-task-001"}}
state_snapshot = graph.get_state(config)

# StateSnapshot 包含：
# - values: 当前所有状态字段
# - next: 下一个待执行节点
# - config: thread_id、checkpoint_id 等
# - metadata: 执行元数据、super-step 计数
# - created_at: 快照创建时间
```

**查看执行历史**：
```python
history = list(graph.get_state_history(config))
# 返回按时间倒序的所有检查点列表
# 可用于调试、重放、审计
```

**从特定检查点恢复（时间旅行）**：
```python
# 查找某个中断点
interrupted_checkpoint = next(
    s for s in history
    if s.tasks and any(t.interrupts for t in s.tasks)
)

# 从该点重新开始
config["configurable"]["checkpoint_id"] = interrupted_checkpoint.config["configurable"]["checkpoint_id"]
graph.invoke(Command(resume=new_decision), config=config)
```

### 7.4 中断重试与错误恢复

**场景 1：前端操作失败，需重试**
```python
# 前端重新提交相同 decision，后端自动幂等处理
config = {"configurable": {"thread_id": "review-task-001"}}
try:
    result = graph.invoke(Command(resume=decision), config=config)
except Exception as e:
    # 错误发生时，checkpointer 已保存该超步的成功节点输出
    # 重新调用将从保存点重新开始，避免重复执行
    result = graph.invoke(Command(resume=decision), config=config)
```

**场景 2：图节点执行异常**
```python
# 若 apply_decisions_node 执行失败，checkpointer 保存了：
# - 已完成节点的输出
# - 待执行节点队列
# 
# 修复代码后，重新 resume 会跳过已完成的节点，直接重试失败节点
```

**场景 3：长期中断（数天后恢复）**
```python
# 即使中断了 7 天，只要 checkpointer 中保存了该 thread_id 的状态，
# 后端就能继续执行
config = {"configurable": {"thread_id": "review-task-001"}}
current_state = graph.get_state(config)

# 判断是否仍在等待中断
if current_state.next:  # 还有待执行节点
    graph.invoke(Command(resume=new_decision), config=config)
```

---

## 八、与后端 API 的集成边界

### 8.1 后端需提供的关键 API

| API 名称 | 输入 | 输出 | 职责 |
|---------|------|------|------|
| `POST /reviews/{task_id}/start` | document_id, content | thread_id, 初始状态 | 启动审核流程 |
| `GET /reviews/{task_id}/state` | task_id | 当前 State 快照 | 查询当前状态 |
| `POST /reviews/{task_id}/decision` | decision payload | 更新后的 State | 提交人工决策，触发 resume |
| `GET /reviews/{task_id}/history` | task_id | 所有检查点列表 | 审计日志查询 |

### 8.2 State 序列化与反序列化

**State → JSON（发送给前端）**：
- `risk_items: list` → JSON 数组，每个对象包含完整风险信息
- `human_reviews: list` → JSON 数组，记录操作历史
- `current_status: str` → JSON 字符串（枚举值）
- 复杂对象（如文档元数据）→ JSON 嵌套对象

**JSON → State（后端接收）**：
- 前端提交的 decision payload 必须遵循预定义的 JSON Schema
- 后端验证 JSON 结构 → 反序列化为 Python dict
- 通过 `Command(resume=...)` 传入图执行

### 8.3 数据库与 Checkpointer 的协调

**数据库层** 负责：
- `ReviewTask` 表：任务元数据、状态、时间戳
- `RiskItem` 表：风险项信息（来自自动审核）
- `HumanReview` 表：人工操作记录（来自 interrupt 恢复后）

**Checkpointer 层** 负责：
- 保存每个超步后的完整 State 快照
- 管理 thread_id → 检查点映射
- 支持状态恢复和历史查询

**协调机制**：
```python
# 审核完成时的数据流
def finalize_node(state: ReviewState):
    # State 中的信息来自 Checkpointer 恢复
    
    # 同时持久化到数据库
    review_task = ReviewTask.query.get(state["review_task_id"])
    review_task.status = "completed"
    review_task.completed_at = datetime.utcnow()
    
    # human_reviews 来自 State 的累积
    for review in state["human_reviews"]:
        db.session.add(HumanReview(
            review_task_id=state["review_task_id"],
            operator_id=review["operator_id"],
            action=review["action"],
            comment=review.get("comment", ""),
            ...
        ))
    db.session.commit()
    
    return {"current_status": "completed"}
```

---

## 九、设计总结与要点

### 关键设计决策

1. **使用 interrupt() 而非 breakpoint**：动态、条件化、更灵活
2. **State 采用 Reducer 模式**：允许多节点并行更新列表类字段
3. **Thread ID = ReviewTask ID**：清晰的会话映射，便于审计追溯
4. **Checkpointer 生产用 PostgreSQL**：持久、分布式、事务安全
5. **中断点单一化**：所有人工操作通过 `human_decision_node` 的 interrupt/resume 实现
6. **批量 resume**：所有决策在一次 resume 中完成，减少网络往返

### 与现有设计的对应

- **交互设计**的 10 态状态机 ↔ **State 设计**的 `current_status` 字段
- **交互设计**的四类操作（approve/edit/reject/annotate） ↔ **人工操作协议**的 action 字段
- **交互设计**的 HITL 触发条件 ↔ **中断点设计**的 `hitl_trigger_check` 节点
- **交互设计**的编辑记录 ↔ **State 的 human_reviews Reducer** 完整记录

### 后续实现指导

- **backend_plan 阶段**：基于本规范实现各节点函数、Checkpointer 配置、API 路由
- **API 规范阶段**：详细定义 decision payload 的 JSON Schema、错误码、超时处理
- **数据模型阶段**：确保数据库表与 State 字段的字段对应、索引策略

---

*本文档严格基于 LangChain 官方 LangGraph 文档（v1.1+）与现有交互设计规范的深度融合，为后续后端实现提供完整的技术蓝图。*
