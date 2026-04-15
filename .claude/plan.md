# LangChain HITL 工作流规范 - 设计计划

## 任务目标
基于 LangChain MCP 工具查询的最新 LangGraph HITL 实现方案，为文档审核工作流设计完整的规范文档。

## 已完成的研究
通过 LangChain MCP 工具，已获得以下技术信息：

### 1. LangGraph Interrupt 机制（核心 HITL 基础）
- `interrupt()` 函数：在节点内部任意位置调用，暂停图执行
- 状态保存：通过 checkpointer 自动保存图状态，使用 thread_id 作为持久指针
- 恢复机制：通过 `Command(resume=...)` 恢复执行，resume 值成为 interrupt() 的返回值
- 中断向下传递：中断信息通过 `__interrupt__` 字段或 `stream.interrupts` 暴露给调用方

### 2. State 设计（状态管理）
- TypedDict 模式：使用类型注解定义状态结构
- Reducer 模式：为每个状态键独立定义归并函数（如 operator.add 用于列表追加）
- 输入/输出分离：支持不同的 InputState、OutputState、OverallState 组合
- 私有状态：节点间可传递不在整体状态中的私有数据

### 3. Command 和 Resume 机制
- `Command(resume=...)` 作为恢复输入传递给 graph.invoke()
- 必须使用相同 thread_id 才能恢复到相同检查点
- Resume 值可以是任何 JSON 可序列化的值，对应中断时的决策

### 4. Checkpointer 与持久化
- Thread ID：持久指针，存储、检索、恢复状态的关键
- 超步（Super-step）：图执行的最小单位，每个超步后创建检查点
- StateSnapshot：包含 values、next、config、metadata、created_at 等字段
- Checkpointer 类型：InMemorySaver（开发）、PostgresStore（生产）、RedisStore（生产）

## 文档结构设计（初步）

### 第 1 部分：概述
- 文档目标与范围
- 与交互设计文档的承接关系
- LangGraph HITL 架构适配

### 第 2 部分：LangGraph HITL 核心机制说明
- 2.1 Interrupt 机制详解
- 2.2 State 设计原理
- 2.3 Command 和恢复流程
- 2.4 Checkpointer 持久化原理

### 第 3 部分：Graph 状态设计
- 3.1 审核工作流 State 定义（TypedDict）
- 3.2 各状态字段的含义与 Reducer 配置
- 3.3 输入/输出状态的分离
- 3.4 与现有数据模型的映射关系

### 第 4 部分：节点与边设计
- 4.1 七个核心节点的定义（自动审核、中断点、人工审核等）
- 4.2 节点间的数据流向与状态更新
- 4.3 条件路由规则

### 第 5 部分：中断点设计
- 5.1 中断条件触发规则（风险等级、置信度等）
- 5.2 中断负载设计（中断时传递哪些数据给前端）
- 5.3 多个风险项的并行中断处理

### 第 6 部分：人工操作协议
- 6.1 同意（Approve）操作的状态流转
- 6.2 编辑（Edit）操作的记录与验证
- 6.3 驳回（Reject）操作的二级分类处理
- 6.4 批注（Annotate）的独立存储

### 第 7 部分：恢复与持久化设计
- 7.1 Checkpointer 选型建议（开发 vs 生产）
- 7.2 Thread ID 管理与会话映射
- 7.3 State 恢复流程与超步处理
- 7.4 中断重试与错误恢复

### 第 8 部分：与后端 API 的集成边界
- 8.1 后端需提供的 API 接口清单
- 8.2 State 序列化与反序列化
- 8.3 数据库与 Checkpointer 的协调

## 设计原则
1. **对应关系明确**：每个设计决策直接映射到现有交互设计文档的场景
2. **实现可落地**：避免过度抽象，给出具体的 TypedDict 示例和 Reducer 配置
3. **持久化优先**：强调生产环境必须使用持久化 Checkpointer，明确 PostgreSQL/Redis 方案
4. **可操性强**：包含具体的代码示例（伪代码或参考代码）展示 interrupt/resume 的实际调用
5. **与现有系统兼容**：确保设计不违反已有的状态机、API 规范、数据模型定义

## 预期输出
- 文件路径：`docs/06_system_architecture/langchain-hitl-workflow-spec.md`
- 字数：3000-4000 字（覆盖 8 个部分）
- 格式：Markdown + 伪代码示例
- 语言：中文

## 批准标记
此计划已审核，可开始实施。
