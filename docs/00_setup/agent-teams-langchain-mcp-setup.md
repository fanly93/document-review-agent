# Agent Teams & LangChain MCP 配置说明

> 文档生成时间：2026-04-14
> 数据来源：LangChain 官方文档（通过 MCP 实时获取）

---

## 一、环境检查结果

### 1.1 Agent Teams 状态

**启用方式**：在 `.claude/settings.json` 中设置环境变量：

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

**当前状态**：✅ 已在项目级启用

**已配置的 Subagent 角色**（位于 `.claude/subagents/`）：

| 角色 | 文件 | 职责 |
|------|------|------|
| 研究员 | `researcher.md` | 技术调研、方案对比、文档分析 |
| 架构师 | `architect.md` | 系统设计、技术选型、架构决策 |
| 实现者 | `implementer.md` | 功能开发、代码编写、单元测试 |
| 审查者 | `reviewer.md` | 代码审查、安全审计、质量把关 |

---

### 1.2 LangChain MCP Server 连通性

**接入命令**：
```bash
claude mcp add --transport http docs-langchain https://docs.langchain.com/mcp
```

**当前状态**：

```
docs-langchain: https://docs.langchain.com/mcp (HTTP) - ✓ Connected
```

**暴露的 MCP 工具**：

| 工具名 | 功能描述 |
|--------|----------|
| `search_docs_by_lang_chain` | 语义搜索 LangChain/LangGraph/LangSmith 文档知识库 |
| `query_docs_filesystem_docs_by_lang_chain` | 以虚拟文件系统方式读取文档页面（支持 `cat`/`head`/`rg`/`tree` 等命令） |

---

## 二、LangChain MCP 的主要作用

**核心定位**：LangChain 文档 MCP Server 的主要职责是**为 Claude Code 提供实时访问 LangChain 最新技术文档规范的能力**。

### 2.1 解决的问题

Claude 的训练数据存在截止日期，无法感知 LangChain/LangGraph/LangSmith 的最新 API 变更、新特性和最佳实践。接入 `docs-langchain` MCP 后，Claude Code 可以：

- **实时查询**最新的 LangChain、LangGraph、LangSmith 官方文档
- 获取准确的 **API 参考**（参数、返回值、类型签名）
- 检索最新的**代码示例**和集成指南
- 了解当前推荐的**最佳实践**和架构模式

### 2.2 文档覆盖范围

MCP 文档库涵盖约 330 个文档页面，主要包含：

```
/
├── langsmith/          # LangSmith 平台文档（可观测性、评估、部署等）
├── oss/
│   ├── python/         # LangChain Python SDK 文档
│   └── javascript/     # LangChain JS/TS SDK 文档
└── api-reference/      # REST API 参考
```

**典型使用场景**：
- 查询 LangGraph 的最新 API：`search_docs_by_lang_chain("LangGraph interrupt human in the loop")`
- 阅读具体文档页：`query_docs_filesystem(..., "cat /langsmith/add-human-in-the-loop.mdx")`
- 搜索代码示例：`query_docs_filesystem(..., "rg -il 'MultiServerMCPClient' /")`

### 2.3 langchain-mcp-adapters：在代码中使用 MCP

`langchain-mcp-adapters` 是独立的 Python 库，用于在 LangChain Agent 代码中接入任意 MCP Server：

```bash
pip install langchain-mcp-adapters
```

**核心用法**：

```python
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent

async def main():
    client = MultiServerMCPClient({
        "math": {
            "transport": "stdio",           # 本地子进程通信
            "command": "python",
            "args": ["/path/to/math_server.py"],
        },
        "weather": {
            "transport": "http",            # HTTP 远程服务器
            "url": "http://localhost:8000/mcp",
        }
    })

    tools = await client.get_tools()        # 加载 MCP 工具为 LangChain 工具
    agent = create_agent("claude-sonnet-4-6", tools)
    response = await agent.ainvoke({"messages": "what's (3 + 5) x 12?"})
```

**支持的传输协议**：

| 协议 | 适用场景 |
|------|----------|
| `stdio` | 本地子进程，简单场景，天然有状态 |
| `http`（streamable-http）| 远程 HTTP 服务，推荐生产使用 |
| `sse`（已废弃）| 兼容旧版，不推荐新项目 |

**会话管理**：
- **无状态（默认）**：每次工具调用创建新 Session，调用完即销毁
- **有状态**：通过 `async with client.session("server")` 维持持久连接

---

## 三、LangChain Interpreter（沙箱）的作用

### 3.1 定位

LangSmith **Sandboxes（沙箱）** 是 LangSmith 平台提供的托管代码执行环境，也被称为 Interpreter（解释器）。目前处于 **Private Preview** 阶段。

**核心能力**：在完全隔离的容器环境中安全执行任意代码和文件系统操作，不影响主机基础设施。

### 3.2 主要用途

| 场景 | 说明 |
|------|------|
| 安全执行 Agent 生成的代码 | 防止恶意或错误代码影响宿主系统 |
| 文件系统操作隔离 | Agent 可以读写文件，但限制在沙箱内 |
| 可复现的测试环境 | 每次运行从同一基础镜像启动 |
| 多语言执行 | 支持 Python、JavaScript/TypeScript 等 |

### 3.3 核心资源概念

```
Sandboxes
├── Templates       # 定义容器镜像、资源限制、卷挂载、认证代理配置
├── Warm Pools      # 预创建沙箱池，减少冷启动延迟，自动补充
├── Service URLs    # 通过认证 URL 访问沙箱内运行的 HTTP 服务
└── Auth Proxy      # 将凭证注入对外 API 请求，避免硬编码 secrets
```

### 3.4 与 langchain-mcp-adapters 的关系

Sandbox 可以被暴露为 MCP Server，供 LangChain Agent 通过 `langchain-mcp-adapters` 调用：

```python
client = MultiServerMCPClient({
    "code_executor": {
        "transport": "http",
        "url": "https://my-sandbox.langsmith.app/mcp",
        "headers": {"X-Api-Key": "lsv2_pt_..."}
    }
})
tools = await client.get_tools()
# Agent 现在可以调用沙箱执行代码
```

---

## 四、Human-in-the-Loop 详细流程

Human-in-the-loop（人工介入循环，简称 HitL）是 LangGraph 的核心特性，允许在 Agent 工作流执行中暂停，等待人类审核或提供输入后再继续。

### 4.1 实现原理

LangGraph 通过 **Checkpoint（检查点）机制** + **`interrupt()` 函数** 实现 HitL：

- 每个节点执行后自动保存状态到 Checkpointer
- `interrupt()` 调用会立即暂停当前节点执行，将 payload 返回给调用方
- 调用方通过 `Command(resume=...)` 注入人工输入后，图从暂停点继续执行

### 4.2 两种中断类型

#### 方式一：动态中断（推荐用于 HitL）

在节点内部调用 `interrupt()` 函数，可携带任意 JSON 可序列化的 payload：

```python
from langgraph.types import interrupt, Command
from langgraph.graph import StateGraph, START
from typing import TypedDict

class State(TypedDict):
    some_text: str

def human_node(state: State):
    value = interrupt(                          # ① 暂停执行，向上层暴露 payload
        {"text_to_revise": state["some_text"]} # payload 可以是任意 JSON 对象
    )
    return {"some_text": value}                # ② 恢复后，interrupt() 返回值即为人工输入

graph_builder = StateGraph(State)
graph_builder.add_node("human_node", human_node)
graph_builder.add_edge(START, "human_node")
graph = graph_builder.compile()
```

#### 方式二：静态中断（仅推荐用于调试）

在编译时或运行时指定在哪些节点前后中断：

```python
# 编译时设定
graph = graph_builder.compile(
    interrupt_before=["node_a"],           # 执行 node_a 之前暂停
    interrupt_after=["node_b", "node_c"],  # 执行 node_b/c 之后暂停
)

# 或在运行时动态指定（更灵活）
await client.runs.wait(
    thread_id, assistant_id,
    inputs=inputs,
    interrupt_before=["node_a"],
    interrupt_after=["node_b"]
)
```

> **注意**：静态中断不适合生产环境的 HitL 场景，主要用于断点调试和测试。

### 4.3 完整交互流程

```
用户/系统                    LangGraph Agent Server              人工审核方
   │                               │                                │
   │── ① 创建 Thread ─────────────>│                                │
   │<─ 返回 thread_id ─────────────│                                │
   │                               │                                │
   │── ② 启动 Run（初始输入）──────>│                                │
   │   runs.wait(thread_id,        │                                │
   │     input={"some_text": ...}) │                                │
   │                               │── 执行图节点 ──────────────────│
   │                               │   遇到 interrupt() ────────────│
   │<─ 返回 __interrupt__ 对象 ────│                                │
   │   {                           │                                │
   │     value: {text_to_revise},  │                                │
   │     resumable: true,          │                                │
   │     when: "during"            │   （图处于挂起状态）            │
   │   }                           │                                │
   │                               │                                │
   │── ③ 展示给人工审核 ────────────────────────────────────────────>│
   │<─ 人工提供修改意见 ─────────────────────────────────────────────│
   │                               │                                │
   │── ④ 恢复执行 ─────────────────>│                                │
   │   runs.wait(thread_id,        │                                │
   │     command=Command(          │                                │
   │       resume="Edited text"))  │                                │
   │                               │── 从断点继续执行 ───────────────│
   │<─ ⑤ 返回最终结果 ─────────────│                                │
```

### 4.4 代码实现（Python SDK）

```python
from langgraph_sdk import get_client
from langgraph_sdk.schema import Command

client = get_client(url="<DEPLOYMENT_URL>")
assistant_id = "agent"

# ① 创建对话线程
thread = await client.threads.create()
thread_id = thread["thread_id"]

# ② 运行图，直到遇到 interrupt
result = await client.runs.wait(
    thread_id,
    assistant_id,
    input={"some_text": "original text"}
)

# 检查中断信息
print(result['__interrupt__'])
# [
#   {
#     'value': {'text_to_revise': 'original text'},
#     'resumable': True,
#     'ns': ['human_node:fc722478-...'],
#     'when': 'during'
#   }
# ]

# ③ 人工处理后，注入人工输入恢复执行
final_result = await client.runs.wait(
    thread_id,
    assistant_id,
    command=Command(resume="Edited text by human")
)
print(final_result)
# {'some_text': 'Edited text by human'}
```

### 4.5 REST API 方式

```bash
# 创建 Thread
curl -X POST <DEPLOYMENT_URL>/threads \
  -H 'Content-Type: application/json' -d '{}'

# 启动 Run（等待 interrupt）
curl -X POST <DEPLOYMENT_URL>/threads/<THREAD_ID>/runs/wait \
  -H 'Content-Type: application/json' \
  -d '{"assistant_id": "agent", "input": {"some_text": "original text"}}'

# 恢复执行（注入人工输入）
curl -X POST <DEPLOYMENT_URL>/threads/<THREAD_ID>/runs/wait \
  -H 'Content-Type: application/json' \
  -d '{"assistant_id": "agent", "command": {"resume": "Edited text"}}'
```

### 4.6 Time Travel（时间旅行）

HitL 的高级用法：回溯到历史检查点重新执行：

```python
# 获取线程历史记录，找到目标 checkpoint
history = await client.threads.get_history(thread_id)

# 可选：修改某个检查点的状态
await client.threads.update_state(
    thread_id,
    values={"some_text": "modified state"},
    checkpoint_id=target_checkpoint_id
)

# 从指定检查点恢复执行（生成新的执行分支）
result = await client.runs.wait(
    thread_id,
    assistant_id,
    input=None,
    checkpoint_id=target_checkpoint_id
)
```

---

## 五、架构全景图

```
Claude Code (当前会话 / Team Lead)
│
├── Agent Teams（实验性功能）
│   ├── CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
│   ├── Teammate: researcher（研究员）
│   ├── Teammate: architect（架构师）
│   ├── Teammate: implementer（实现者）
│   └── Teammate: reviewer（审查者）
│
└── MCP Servers
    └── docs-langchain（https://docs.langchain.com/mcp）
        ├── 工具：search_docs_by_lang_chain
        │   └── 语义搜索 330+ 篇官方文档
        └── 工具：query_docs_filesystem_docs_by_lang_chain
            └── 以文件系统方式精读任意文档页面


LangGraph 应用侧（独立部署）
│
├── Agent Server（LangSmith 部署）
│   ├── /mcp 端点 → 将 Agent 暴露为 MCP Tool
│   └── Human-in-the-loop
│       ├── interrupt() → 动态中断，等待人工输入
│       └── Command(resume=...) → 注入人工输入继续
│
├── langchain-mcp-adapters（Python 库）
│   ├── MultiServerMCPClient → 连接 MCP Server
│   ├── client.get_tools() → 加载为 LangChain 工具
│   └── Tool Interceptors → 注入运行时上下文
│
└── Sandboxes（私有预览）
    └── 隔离的代码执行环境（Interpreter）
```

---

## 六、参考文档

| 主题 | 官方链接 |
|------|----------|
| LangChain MCP Adapters（Python） | https://docs.langchain.com/oss/python/langchain/mcp |
| LangSmith MCP Server | https://docs.langchain.com/langsmith/langsmith-mcp-server |
| Agent Server MCP 端点 | https://docs.langchain.com/langsmith/server-mcp |
| Human-in-the-loop | https://docs.langchain.com/langsmith/add-human-in-the-loop |
| Time Travel | https://docs.langchain.com/langsmith/human-in-the-loop-time-travel |
| Sandboxes（Interpreter） | https://docs.langchain.com/langsmith/sandboxes |
| LangSmith MCP Server GitHub | https://github.com/langchain-ai/langsmith-mcp-server |
