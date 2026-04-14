# AgentTeamProject — 项目协作规范

> 本文档是所有 Agent Teams 成员的最高行为准则，所有 Subagent 必须在开始工作前阅读并严格遵守。

---

## 一、项目目录结构与职责边界

```
AgentTeamProject/
├── frontend/          # 前端应用（Web UI）
├── backend/           # 后端服务（API Server）
├── docs/              # 项目全流程文档
│   ├── 00_setup/      # 环境配置与项目规范
│   ├── 01_business_research/    # 业务调研
│   ├── 02_competitive_analysis/ # 竞品分析
│   ├── 03_problem_modeling/     # 业务问题建模
│   ├── 04_interaction_design/   # 核心交互链路设计
│   ├── 05_product_prototype/    # 产品原型规范
│   ├── 06_system_architecture/  # 系统架构设计
│   ├── 07_data_model/           # 数据模型
│   ├── 08_api_spec/             # API 规范
│   ├── 09_frontend_plan/        # 前端实现计划
│   ├── 10_backend_plan/         # 后端实现计划
│   ├── 11_integration/          # 前后端联调
│   └── 12_deployment/           # 项目发布和部署
└── .claude/
    ├── settings.json  # Agent Teams 配置
    └── subagents/     # Subagent 角色定义
```

---

## 二、各区域职责边界

### 2.1 `frontend/` — 前端应用

**负责内容**：
- Web 用户界面（UI 组件、页面路由、状态管理）
- 与后端 API 的 HTTP/WebSocket 通信
- 静态资源（图片、字体、样式）

**禁止事项**：
- ❌ 不得包含任何业务逻辑密钥或数据库连接信息
- ❌ 不得直接访问数据库
- ❌ 不得修改 `backend/` 或 `docs/` 下的文件

**配置方式**：前端环境变量通过 `.env.local`（不提交）管理，仅允许 `VITE_` / `NEXT_PUBLIC_` 前缀的变量。

---

### 2.2 `backend/` — 后端服务

**负责内容**：
- REST API / GraphQL / WebSocket 服务端实现
- 业务逻辑、数据处理、外部服务集成
- 数据库迁移脚本与 ORM 模型

**强制规范**：

#### 配置管理（`.env`）
- 所有配置项**必须**通过 `.env` 文件管理，禁止硬编码任何密钥、URL、端口
- `.env` 文件**不得提交**到版本库，使用 `.env.example` 记录所需变量（值留空）
- 配置加载示例：
  ```python
  from dotenv import load_dotenv
  load_dotenv()
  DATABASE_URL = os.getenv("DATABASE_URL")
  ```

#### 运行环境管理（`uv`）
- 后端**统一使用 `uv`** 管理 Python 运行环境和依赖，禁止使用 `pip`、`conda`、`poetry` 等其他工具
- 项目初始化：`uv init`
- 添加依赖：`uv add <package>`
- 运行脚本：`uv run python <script.py>`
- 同步依赖：`uv sync`
- 依赖声明文件：`pyproject.toml`（由 uv 维护），同时提交 `uv.lock`

**禁止事项**：
- ❌ 不得修改 `frontend/` 下的文件
- ❌ 不得将 `.env` 文件提交到版本库
- ❌ 不得使用 `pip install` 或其他非 `uv` 的包管理方式

---

### 2.3 `docs/` — 项目文档

**负责内容**：
- 各阶段调研、设计、规划、规范文档
- 每个 Agent Teams 工作阶段的输出记录

**强制规范**：
- 每个阶段产出的文档必须保存在对应编号目录下（如架构设计 → `06_system_architecture/`）
- 文档格式统一使用 Markdown（`.md`）
- 文档文件名使用小写下划线命名（`snake_case`），如 `system_architecture_overview.md`

**禁止事项**：
- ❌ 不得在 docs 目录下放置任何可执行代码或配置文件
- ❌ 文档目录结构不得随意新增，如需扩展请修改本 CLAUDE.md

---

## 三、Agent Teams 工作规范

### 3.1 复杂任务必须先进入 Plan 模式

凡符合以下任意一条的任务，**必须先在 Plan 模式下规划，获得 Team Lead 确认后再实施**：

- 涉及新建多个文件或目录
- 涉及跨模块（frontend/backend/docs）的改动
- 需要设计新的数据结构或 API 接口
- 预计执行步骤超过 5 步
- 对现有架构有较大影响的重构

**Plan 模式启动方式**：向 Team Lead 发送 `进入 Plan 模式` 或直接使用 `/plan` 命令。

### 3.2 每个阶段必须有明确的输出文件

每个 Agent Teams 工作阶段结束时，**必须将产出写入对应的文档文件**，不得仅在对话中回复而不落地文档。

| 阶段 | 负责 Subagent | 输出目录 | 必须输出的文件 |
|------|--------------|----------|---------------|
| 业务调研 | researcher | `docs/01_business_research/` | `business_research.md` |
| 竞品分析 | researcher | `docs/02_competitive_analysis/` | `competitive_analysis.md` |
| 问题建模 | architect | `docs/03_problem_modeling/` | `problem_modeling.md` |
| 交互设计 | architect | `docs/04_interaction_design/` | `interaction_flows.md` |
| 原型规范 | architect | `docs/05_product_prototype/` | `prototype_spec.md` |
| 系统架构 | architect | `docs/06_system_architecture/` | `architecture_overview.md` |
| 数据模型 | architect | `docs/07_data_model/` | `data_model.md` |
| API 规范 | architect + implementer | `docs/08_api_spec/` | `api_spec.md` |
| 前端计划 | implementer | `docs/09_frontend_plan/` | `frontend_plan.md` |
| 后端计划 | implementer | `docs/10_backend_plan/` | `backend_plan.md` |
| 联调规范 | implementer + reviewer | `docs/11_integration/` | `integration_guide.md` |
| 部署方案 | architect + reviewer | `docs/12_deployment/` | `deployment_guide.md` |

### 3.3 Subagent 协作规则

- **researcher**：只负责调研和输出报告，不编写任何代码
- **architect**：只负责设计文档，不直接修改 frontend/ 或 backend/ 代码
- **implementer**：按照 architect 产出的设计文档编写代码，不自行更改架构决策
- **reviewer**：审查产出，发现问题通过任务列表反馈，不直接修改他人代码

### 3.4 任务状态管理

- 使用 `TaskCreate` 创建任务并分配给对应 Subagent
- Subagent 开始工作时立即将任务更新为 `in_progress`
- 完成并写入输出文件后将任务更新为 `completed`
- 被阻塞时设置为 `blocked` 并说明原因

---

## 四、Agent Teams 配置

### 启用

```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

### 可用 Subagent 角色

| 角色 | 定义文件 | 使用时机 |
|------|----------|----------|
| researcher | `.claude/subagents/researcher.md` | 技术调研、文档分析、方案对比 |
| architect | `.claude/subagents/architect.md` | 系统设计、架构决策、技术选型 |
| implementer | `.claude/subagents/implementer.md` | 功能开发、代码编写、单元测试 |
| reviewer | `.claude/subagents/reviewer.md` | 代码审查、安全审计、质量把关 |

### 注意事项

- Agent Teams 是实验性功能，不支持 `/resume` 和 `/rewind`
- 一个会话只能管理一个 Team，理想规模 3-5 人
- 清理 Team 时必须通过 Lead 执行
- 避免多个 Teammate 同时编辑同一文件（会产生冲突）

---

## 五、MCP 集成

| MCP Server | 接入地址 | 用途 |
|------------|----------|------|
| docs-langchain | https://docs.langchain.com/mcp | 实时获取 LangChain/LangGraph/LangSmith 最新技术文档 |

接入命令：
```bash
claude mcp add --transport http docs-langchain https://docs.langchain.com/mcp
```
