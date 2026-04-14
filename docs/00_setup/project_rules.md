# 项目规范手册（Project Rules）

> 版本：v1.0
> 创建日期：2026-04-14
> 适用范围：所有参与本项目的开发者和 Agent Teammates

---

## 一、项目概览

本项目采用 **Claude Code Agent Teams** 模式进行协作开发，由 Team Lead 统筹协调，多个专职 Subagent 并行推进各阶段工作。

### 技术栈约定

| 层级 | 技术选型 | 备注 |
|------|----------|------|
| 后端语言 | Python | 版本要求 ≥ 3.11 |
| 后端环境管理 | `uv` | 禁止使用 pip/poetry/conda |
| 后端配置管理 | `.env` + `python-dotenv` | 不提交 .env，提供 .env.example |
| 前端（待定） | TBD | 由 architect 阶段确定 |
| 文档格式 | Markdown | 统一 `.md` 扩展名 |

---

## 二、目录结构规范

### 2.1 总体结构

```
AgentTeamProject/
├── frontend/                    # 前端应用（框架待定）
│   ├── src/                     # 源代码
│   ├── public/                  # 静态资源
│   ├── .env.local               # 前端环境变量（不提交）
│   └── package.json / ...
│
├── backend/                     # 后端服务
│   ├── src/                     # 源代码（或按模块组织）
│   ├── tests/                   # 单元测试 / 集成测试
│   ├── .env                     # 环境配置（不提交）
│   ├── .env.example             # 环境变量模板（提交）
│   ├── pyproject.toml           # 依赖声明（uv 维护）
│   └── uv.lock                  # 锁文件（提交）
│
├── docs/                        # 项目全流程文档
│   ├── 00_setup/                # 环境配置与规范
│   ├── 01_business_research/    # 阶段一：业务调研
│   ├── 02_competitive_analysis/ # 阶段二：竞品分析
│   ├── 03_problem_modeling/     # 阶段三：业务问题建模
│   ├── 04_interaction_design/   # 阶段四：核心交互链路设计
│   ├── 05_product_prototype/    # 阶段五：产品原型规范
│   ├── 06_system_architecture/  # 阶段六：系统架构设计
│   ├── 07_data_model/           # 阶段七：数据模型
│   ├── 08_api_spec/             # 阶段八：API 规范
│   ├── 09_frontend_plan/        # 阶段九：前端实现计划
│   ├── 10_backend_plan/         # 阶段十：后端实现计划
│   ├── 11_integration/          # 阶段十一：前后端联调
│   └── 12_deployment/           # 阶段十二：项目发布和部署
│
├── .claude/
│   ├── settings.json            # Agent Teams 配置
│   ├── hooks/                   # 自动化钩子
│   └── subagents/               # Subagent 角色定义
│
├── CLAUDE.md                    # 项目协作规范（Agent 必读）
└── .gitignore                   # 版本管理忽略规则
```

### 2.2 命名规范

| 对象 | 规范 | 示例 |
|------|------|------|
| 文档文件名 | `snake_case.md` | `system_architecture_overview.md` |
| 目录名 | `snake_case` 或 `编号_名称` | `06_system_architecture` |
| Python 文件 | `snake_case.py` | `user_service.py` |
| Python 类名 | `PascalCase` | `UserService` |
| Python 函数/变量 | `snake_case` | `get_user_by_id` |
| 前端组件 | `PascalCase.tsx` | `UserProfile.tsx` |
| 前端工具函数 | `camelCase.ts` | `formatDate.ts` |
| 环境变量 | `UPPER_SNAKE_CASE` | `DATABASE_URL` |

---

## 三、后端开发规范

### 3.1 环境管理（uv）

所有后端操作**必须使用 `uv`**，禁止直接使用 `pip`。

```bash
# 初始化项目
uv init backend

# 进入后端目录后的常用命令
uv add fastapi          # 添加依赖
uv add --dev pytest     # 添加开发依赖
uv sync                 # 同步依赖（等同于 pip install -r requirements.txt）
uv run python main.py   # 运行脚本
uv run pytest           # 运行测试
uv run uvicorn main:app --reload  # 启动开发服务器
```

**提交到版本库的文件**：
- ✅ `pyproject.toml`
- ✅ `uv.lock`
- ❌ `.venv/`（加入 .gitignore）

### 3.2 配置管理（.env）

**`.env.example`（必须提交，值留空或填示例值）**：

```ini
# 应用配置
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000
SECRET_KEY=your-secret-key-here

# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# 外部服务
OPENAI_API_KEY=sk-...
LANGSMITH_API_KEY=lsv2_pt_...
```

**代码中读取配置**：

```python
import os
from dotenv import load_dotenv

load_dotenv()  # 从 .env 加载

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is required")
```

**绝对禁止**：
```python
# ❌ 禁止硬编码
DATABASE_URL = "postgresql://admin:secret@prod-db.example.com/mydb"
API_KEY = "sk-abc123..."
```

### 3.3 代码质量要求

- 所有公共函数必须有类型注解（Python Type Hints）
- 核心业务逻辑必须有单元测试（目标覆盖率 ≥ 80%）
- 不得引入不必要的依赖
- 避免在非边界处进行防御性编程（信任内部函数调用）

---

## 四、前端开发规范

> 具体框架和技术栈由 `architect` 阶段确定后在此补充。

### 4.1 环境变量

- 前端环境变量存于 `.env.local`（不提交）
- 提供 `.env.local.example` 模板（提交）
- 仅允许带框架前缀的变量暴露给客户端（如 `VITE_` / `NEXT_PUBLIC_`）

### 4.2 资源组织

```
frontend/src/
├── components/    # 可复用 UI 组件
├── pages/         # 页面级组件（路由映射）
├── hooks/         # 自定义 React Hooks
├── services/      # API 请求封装
├── store/         # 全局状态管理
├── utils/         # 工具函数
└── types/         # TypeScript 类型定义
```

---

## 五、文档规范

### 5.1 各阶段文档要求

每个阶段的文档必须包含以下信息头：

```markdown
# 文档标题

> **阶段**：XX（如：系统架构设计）
> **负责人**：architect / researcher / ...
> **创建日期**：YYYY-MM-DD
> **状态**：草稿 / 评审中 / 已确认
> **关联文档**：[上游文档链接]

---
```

### 5.2 各阶段必须输出的文档

| 编号 | 阶段 | 目录 | 核心输出文件 | 说明 |
|------|------|------|-------------|------|
| 01 | 业务调研 | `01_business_research/` | `business_research.md` | 用户需求、业务背景、市场规模 |
| 02 | 竞品分析 | `02_competitive_analysis/` | `competitive_analysis.md` | 竞品功能对比、差异化机会 |
| 03 | 问题建模 | `03_problem_modeling/` | `problem_modeling.md` | 核心业务问题、用户旅程、痛点优先级 |
| 04 | 交互设计 | `04_interaction_design/` | `interaction_flows.md` | 核心流程图、状态转换、边界条件 |
| 05 | 原型规范 | `05_product_prototype/` | `prototype_spec.md` | 页面结构、组件规格、交互说明 |
| 06 | 系统架构 | `06_system_architecture/` | `architecture_overview.md` | 技术选型、模块划分、部署架构 |
| 07 | 数据模型 | `07_data_model/` | `data_model.md` | ER 图、表结构、关系说明 |
| 08 | API 规范 | `08_api_spec/` | `api_spec.md` | 接口列表、请求/响应格式、错误码 |
| 09 | 前端计划 | `09_frontend_plan/` | `frontend_plan.md` | 组件拆解、状态设计、实现顺序 |
| 10 | 后端计划 | `10_backend_plan/` | `backend_plan.md` | 模块拆解、数据库选型、实现顺序 |
| 11 | 联调规范 | `11_integration/` | `integration_guide.md` | Mock 策略、联调环境、测试用例 |
| 12 | 部署方案 | `12_deployment/` | `deployment_guide.md` | 环境配置、CI/CD、监控告警 |

---

## 六、Agent Teams 工作流程

### 6.1 标准工作流

```
Team Lead 接收任务
    │
    ├── 简单任务（< 5 步，单一文件）
    │       └── 直接执行，完成后更新任务状态
    │
    └── 复杂任务（跨模块 / 多步骤 / 架构影响）
            │
            ├── ① 进入 Plan 模式（/plan）
            ├── ② 制定详细实施计划
            ├── ③ Team Lead 确认计划
            ├── ④ 创建任务列表（TaskCreate）
            ├── ⑤ 分配给对应 Subagent
            ├── ⑥ Subagent 执行并输出文件
            └── ⑦ reviewer 审查，Team Lead 汇总
```

### 6.2 任务分配原则

- **并行优先**：无依赖关系的任务应并行分配给不同 Subagent
- **单一职责**：每个 Subagent 只做本职工作，不越界
- **输出为先**：每个任务必须有明确的文件输出，不允许"只在对话中回复"
- **依赖显式化**：任务间的依赖关系必须在 TaskCreate 时明确说明

### 6.3 何时必须进入 Plan 模式

| 场景 | 是否需要 Plan |
|------|-------------|
| 单个文档的修改或补充 | ❌ 直接执行 |
| 新建单个文档 | ❌ 直接执行 |
| 跨多个文件的改动 | ✅ 必须 Plan |
| 新的架构决策 | ✅ 必须 Plan |
| 前后端接口设计 | ✅ 必须 Plan |
| 数据库 Schema 设计 | ✅ 必须 Plan |
| 超过 5 个步骤的任务 | ✅ 必须 Plan |
| 影响其他 Subagent 工作的决策 | ✅ 必须 Plan |

---

## 七、版本管理规范

### 7.1 .gitignore 必须包含

```gitignore
# 环境变量（绝对不提交）
.env
.env.local
.env.*.local

# Python 运行环境
.venv/
__pycache__/
*.pyc
*.pyo
*.egg-info/

# Node.js
node_modules/

# 构建产物
dist/
build/
.next/

# IDE
.vscode/
.idea/
*.swp

# 系统文件
.DS_Store
Thumbs.db
```

### 7.2 提交信息格式

```
<type>(<scope>): <subject>

type:
  feat     - 新功能
  fix      - 修复问题
  docs     - 文档变更
  refactor - 代码重构
  test     - 测试相关
  chore    - 构建/工具变更

scope: frontend / backend / docs / infra

示例：
docs(06_system_architecture): 添加系统架构概览文档
feat(backend): 实现用户认证 API
fix(frontend): 修复登录页面表单验证问题
```

---

## 八、安全规范

1. **密钥管理**：所有 API Key、数据库密码、JWT Secret 等敏感信息必须通过 `.env` 管理，绝不硬编码
2. **输入验证**：所有外部输入（用户请求、第三方回调）必须在边界处验证
3. **SQL 安全**：使用 ORM 或参数化查询，禁止字符串拼接 SQL
4. **依赖安全**：定期运行 `uv run pip-audit` 检查已知漏洞
5. **日志脱敏**：日志中不得出现密码、Token、完整信用卡号等敏感信息

---

## 九、文档更新记录

| 日期 | 版本 | 变更内容 | 操作人 |
|------|------|----------|--------|
| 2026-04-14 | v1.0 | 初始版本创建 | Team Lead |
