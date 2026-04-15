# 前端架构规范 v1.0

**阶段**：09_frontend_plan → 汇总至 06_system_architecture  
**输出方**：Team Lead（汇总）  
**日期**：2026-04-15  
**版本**：v1.0  
**子文档来源**：
- `docs/09_frontend_plan/page-structure-and-routes.md`（Teammate 1 — 页面结构与路由）
- `docs/09_frontend_plan/review-result-components.md`（Teammate 2 — 审核结果展示组件）
- `docs/09_frontend_plan/hitl-interaction-components.md`（Teammate 3 — 人机交互 UI 组件）

---

## 一、前端架构总体概览

### 1.1 设计原则

| 原则 | 说明 |
|------|------|
| 前端仅为展示层 | 所有业务规则（HITL 触发、状态流转、置信度分类）只能由后端执行，前端不自行计算 |
| 状态驱动路由 | 页面访问权限由 `ReviewTask.status` 决定，路由守卫基于后端状态重定向 |
| WebSocket 驱动进度 | 解析和审核进度页面禁止轮询，必须由 WebSocket 推送驱动 |
| 乐观更新 + 后端权威 | 审核操作先本地更新 UI，以后端最终响应为准 |
| 后端必须二次校验 | 前端所有校验（格式、字数、启用条件）均不可替代后端独立校验 |

---

## 二、页面层级总览

### 2.1 完整页面层级树

```
应用根（App Root）
├── AppLayout（全局导航布局：顶部导航栏 + 用户信息）
│   ├── /upload                          → P01 文档上传页
│   └── /tasks                           → P06 任务列表页
│
└── TaskLayout（任务级布局：AppLayout + 面包屑「任务列表 > 当前任务」）
    └── /tasks/:taskId                   → P07 任务详情页（状态 Hub）
        ├── /tasks/:taskId/parsing       → P02 解析进度页
        ├── /tasks/:taskId/reviewing     → P03 自动审核进度页
        ├── /tasks/:taskId/result        → P04 审核结果页
        ├── /tasks/:taskId/human-review  → P05 人工审核（HITL）页
        └── /tasks/:taskId/failed        → P08 失败处理页
```

**Layout 说明**：
- `AppLayout`：P01、P06 共用，提供顶部导航（系统名称 + 角色/退出）
- `TaskLayout`：所有 `/tasks/:taskId/*` 子页面共用，在 AppLayout 基础上叠加面包屑
- **P07 是状态 Hub**：不跳转到子路由，而是在主体区域动态内嵌 P02/P03 的进度组件，并根据状态提供跳转入口

### 2.2 任务状态 → 可访问路由映射

| ReviewTask 状态 | 前端路由 | 说明 |
|----------------|---------|------|
| `uploaded` / `parsing` | `/tasks/:taskId/parsing`（P02） | 上传后立即跳转，WebSocket 监听进度 |
| `parsed` / `auto_reviewing` / `auto_reviewed` | `/tasks/:taskId/reviewing`（P03） | 解析完成后跳转，等待 auto_review_complete |
| `human_reviewing` | `/tasks/:taskId/human-review`（P05） | HITL 触发后跳转（后端 next_status 决定） |
| `completed` | `/tasks/:taskId/result`（P04） | 只读查阅 |
| `parse_failed` / `auto_review_failed` / `human_review_failed` | `/tasks/:taskId/failed`（P08） | 失败处理，根据失败类型展示不同操作 |
| `rejected` | `/tasks/:taskId`（P07 只读） | 终态，无操作入口 |

### 2.3 路由守卫规则

| 路由 | 布局 | 准入条件 | 准入失败重定向 |
|------|------|---------|--------------|
| `/upload` | AppLayout | 已登录（JWT 有效） | `/login` |
| `/tasks` | AppLayout | 已登录 | `/login` |
| `/tasks/:taskId` | TaskLayout | 已登录 + 任务存在 | `/tasks` |
| `/tasks/:taskId/parsing` | TaskLayout | 状态 IN (`uploaded`, `parsing`) | `/tasks/:taskId` |
| `/tasks/:taskId/reviewing` | TaskLayout | 状态 IN (`parsed`, `auto_reviewing`, `auto_reviewed`) | `/tasks/:taskId` |
| `/tasks/:taskId/result` | TaskLayout | 状态 = `completed` | `/tasks/:taskId` |
| `/tasks/:taskId/human-review` | TaskLayout | 状态 = `human_reviewing` | `/tasks/:taskId` |
| `/tasks/:taskId/failed` | TaskLayout | 状态 IN (`*_failed`) | `/tasks/:taskId` |

> **重要**：路由守卫只做前端重定向，不可替代后端权限校验。后端对每个 API 均执行独立鉴权。

### 2.4 页面跳转流程

```
P01（上传）
  │ POST /api/v1/upload/complete 成功，后端返回 task_id
  ▼
P02（解析进度）
  │ WebSocket: parse_complete 事件
  ▼
P03（自动审核进度）
  │ WebSocket: auto_review_complete（next_status 由后端决定）
  ├──── next_status = "completed" ──────────────────────► P04（审核结果）
  └──── next_status = "human_reviewing" ───────────────► P05（人工审核 HITL）
         │ 完成审核
         ▼
        P04（审核结果）

P02 ── parse_failed ────────────────────────────────────► P08（失败处理）
P03 ── auto_review_failed ──────────────────────────────► P08（失败处理）
P05 ── human_review_failed ─────────────────────────────► P08（失败处理）
P08（parse_failed）── 重新上传 ─────────────────────────► P01（上传）

P06（任务列表）── 点击行 ────────────────────────────────► P07（任务详情 Hub）
P07（Hub）── 根据状态跳转 ───────────────────────────────► P04 / P05 / P08
```

---

## 三、各页面结构与组件清单

### 3.1 P01 — 文档上传页 `/upload`

| 层级 | 组件 | 说明 |
|------|------|------|
| L1 | `AppLayout` | 全局布局 |
| L2 | `UploadZone` | 拖拽/点击上传，支持多文件（≤10个/次） |
| L2 | `FilePreviewList` | 文件名 + 大小 + 格式图标 + 分片上传进度条（0–40%） |
| L2 | 操作区 | 提交上传按钮（校验通过后可点）+ 清空列表按钮 |
| L2 | 全局错误提示 | Toast / 模态弹窗 |

**前端校验**（客户端快速拦截，后端仍须二次校验）：格式仅允许 `.pdf`/`.docx`/`.doc`；单文件 > 50MB 拦截；≥20MB 触发分片上传（5MB/片，并发 ≤3）

**数据依赖**：
- `POST /api/v1/upload/init` → 返回 `chunk_upload_id` + 预签名 URL
- `PUT /api/v1/upload/chunk` → 上传分片，返回 ETag
- `POST /api/v1/upload/complete` → 合并分片，返回 `task_id`

---

### 3.2 P02 — 解析进度页 `/tasks/:taskId/parsing`

| 层级 | 组件 | 说明 |
|------|------|------|
| L1 | `TaskLayout` | 含面包屑 |
| L2 | 文档信息卡片 | 文件名、上传时间 |
| L2 | `ParseProgressPanel` | 四阶段进度：上传中 → 文本提取 → 质量检测 → 完成（WebSocket 驱动） |
| L2 | OCR 质量警告区 | 70–84% 橙色警告；< 70% 展示降级人工入口 |
| L2 | 错误状态区（条件） | `parse_failed` 时展示：错误说明 + 重新上传 + 联系支持 |

**WebSocket 订阅**：`upload_progress`、`parse_progress`、`quality_check`、`parse_complete`、`parse_failed`

**本地状态**：WebSocket 连接句柄、当前进度值、当前阶段文案

---

### 3.3 P03 — 自动审核进度页 `/tasks/:taskId/reviewing`

| 层级 | 组件 | 说明 |
|------|------|------|
| L1 | `TaskLayout` | 含面包屑 |
| L2 | 文档信息卡片 | 文件名 |
| L2 | `AutoReviewProgressPanel` | Layer1（5%）/ Layer2（35%）/ Layer3（60%）三层进度，WebSocket 驱动 |
| L2 | 约束说明 | "AI 辅助初审，仅供参考" |
| L2 | 错误状态区（条件） | `auto_review_failed` 时：失败原因 + 手动重试（≤1次）+ 升级人工入口 |

**约束**：禁止展示任何审核结论；禁止手动触发 HITL 入口；禁止轮询，仅 WebSocket

**WebSocket 订阅**：`auto_review_layer_update`、`auto_review_complete`、`auto_review_failed`

---

### 3.4 P04 — 审核结果页 `/tasks/:taskId/result`

| 层级 | 组件 | 说明 |
|------|------|------|
| L1 | `TaskLayout` | 含面包屑 |
| L2 | `RiskScorePanel` | 整体风险仪表盘（0-100，5色阶），只读 |
| L2 | `RiskCategoryBoard` | 按等级分类的数量卡片，点击过滤列表 |
| L2 | `RiskItemList` | 可过滤/排序的风险条目列表，P04 完全只读 |
| L3（展开） | `RiskItemDetail` | 完整描述 + 置信度说明 + 原文定位 + 来源引用 |
| 侧边栏 | `FactExtractionPanel` | 合同主体/金额/期限/关键日期（**后端未开发**，详见§五） |
| 底部 | 操作区 | 导出报告（MVP 可选）+ 查看审计日志 |

---

### 3.5 P05 — 人工审核（HITL）页 `/tasks/:taskId/human-review`

| 层级 | 组件 | 说明 |
|------|------|------|
| L1 | `TaskLayout` | 含面包屑 |
| L2 | `HumanReviewToolbar` | 文档名 + 风险评分（只读）+ 处理进度计数 + 完成审核按钮 + 任务驳回按钮 |
| L2 | `PDFViewer`（左侧 60%） | PDF.js 渲染 + 高亮叠加层（颜色 = 风险等级），联动右侧 |
| L2 | `ReviewPanel`（右侧 40%） | RiskScorePanel + RiskCategoryBoard + RiskItemList + RiskItemDetail |
| L3（条目内） | `OperationButtonGroup` | approve / edit / reject_item / annotate 四类操作 |
| 弹窗层 | `RejectTaskModal` | 整体驳回确认，必填原因 ≥20 字符 |
| 弹窗层 | `EditFormModal` | 编辑风险等级/描述/推理说明，展示只读字段 |

---

### 3.6 P06 — 任务列表页 `/tasks`

| 层级 | 组件 | 说明 |
|------|------|------|
| L1 | `AppLayout` | 全局布局 |
| L2 | 筛选/搜索栏 | 状态过滤 + 日期范围 + 文档名搜索 |
| L2 | `TaskTable` | 文档名 / 上传时间 / 状态色标 / 整体风险评分 / 操作；点击行跳 P07 |
| L2 | 分页控件 | — |

**数据依赖**：`GET /api/v1/tasks`（支持分页 + 过滤）

---

### 3.7 P07 — 任务详情页（Hub） `/tasks/:taskId`

| 层级 | 组件 | 说明 |
|------|------|------|
| L1 | `TaskLayout` | 含面包屑 |
| L2 | 任务状态卡片 | 当前状态标签（色标）|
| L2 | `StatusTimeline` | 状态流转时间线（已完成步骤 + 当前步骤 + 待完成）|
| L2 | SLA 倒计时（条件） | `human_reviewing` 状态时展示，来自 `ReviewTask.sla_deadline` |
| L2 | 动态内嵌内容 | `parsing/uploaded` → ParseProgressPanel；`auto_reviewing` → AutoReviewProgressPanel；`completed` → 跳转 P04 按钮；`human_reviewing` → 跳转 P05 按钮；`*_failed` → 跳转 P08 按钮；`rejected` → 只读终态 |
| L2 | `AuditLogPanel` | 审计日志折叠区，分页加载，只读 |

---

### 3.8 P08 — 失败处理页 `/tasks/:taskId/failed`

| 层级 | 组件 | 说明 |
|------|------|------|
| L1 | `TaskLayout` | 含面包屑 |
| L2 | 失败状态说明区 | 失败状态标签 + 错误原因文案 + 分类说明 |
| L2 | 操作区（动态） | `parse_failed`：重新上传 + 联系支持；`auto_review_failed`：手动重试 + 升级人工；`human_review_failed`：重新分配 + 联系管理员 |

---

## 四、核心组件规范总览

### 4.1 全局组件清单

| 组件名 | 所在页面 | 功能描述 | 关键约束 |
|-------|---------|---------|---------|
| `UploadZone` | P01 | 拖拽/点击上传 | 前端格式/大小校验；≥20MB 分片 |
| `FilePreviewList` | P01 | 待上传文件列表 + 进度 | WebSocket 驱动分片进度 |
| `ParseProgressPanel` | P02、P07 | 解析四步进度 | 仅 WebSocket，禁止轮询 |
| `AutoReviewProgressPanel` | P03、P07 | 三层审核进度 | 禁止展示结论，禁止手动触发 HITL |
| `RiskScorePanel` | P04、P05 | 风险仪表盘（0-100，5色阶） | 数据只读，颜色由 `risk_level_summary` 决定 |
| `RiskCategoryBoard` | P04、P05 | 按等级分类统计看板 | 点击过滤 RiskItemList |
| `RiskItemList` | P04、P05 | 可过滤/排序风险列表 | 置信度颜色由后端 `confidence_category` 决定 |
| `RiskItemDetail` | P04、P05 | 单条款详情展开 | P04 完全只读；P05 可编辑三个字段 |
| `SourceReferencePanel` | P04、P05（RiskItemDetail 内） | 法规引用折叠面板 | 只读，来自 `SourceReference[]` |
| `FactExtractionPanel` | P04 侧边栏 | 合同主体/金额/期限 | **后端未开发**（见§五） |
| `PDFViewer` | P05 | PDF.js + 高亮叠加层 | 定位坐标来自后端，前端只执行；**GetDocument 接口后端未开发**（见§五） |
| `HumanReviewToolbar` | P05 | 文档名 + 进度计数 + 完成/驳回 | 完成按钮有启用条件守卫 |
| `OperationButtonGroup` | P05 | approve/edit/reject/annotate | 乐观更新 + 后端最终校验 |
| `RejectTaskModal` | P05 | 整体驳回确认弹窗 | 原因 ≥20 字符（前端 + 后端校验） |
| `EditFormModal` | P05 | 编辑表单弹窗 | 只能编辑三个字段，5 字段审计记录 |
| `TaskTable` | P06 | 任务列表表格 | 支持过滤/搜索/分页 |
| `StatusTimeline` | P07 | 状态流转时间线 | 只读，来自后端 |
| `AuditLogPanel` | P07 | 审计日志折叠区 | 只读，分页加载 |

---

## 五、后端未开发接口汇总

> 以下接口在 `docs/08_api_spec/fastapi-spec-v1.0.md` 中**尚未定义**，前端对应功能需标注「后端未开发」，不可自行伪造数据。

| 接口 | 前端使用场景 | 影响组件 | 建议处理方式 |
|------|------------|---------|------------|
| `GET /api/v1/tasks/{task_id}/extractions` | 获取结构化事实字段 | `FactExtractionPanel` | 短期隐藏组件，待后端实现后启用 |
| `GET /api/v1/tasks/{task_id}/document` | 获取 PDF 文件（PDF.js 渲染） | `PDFViewer` | P05 无法渲染 PDF；建议优先实现，否则 HITL 功能无法使用 |
| `POST /api/v1/tasks/{task_id}/retry` | 手动重试自动审核 | P08 auto_review_failed 操作区 | 暂时禁用按钮，提示「功能开发中」 |
| `POST /api/v1/tasks/{task_id}/escalate-to-human` | OCR 质量低时升级人工 | P02 质量警告区 | 暂时隐藏升级入口 |
| `POST /api/v1/tasks/{task_id}/reassign` | 重新分配审核人 | P08 human_review_failed 操作区 | 暂时禁用按钮，提示「功能开发中」 |

> **特别说明**：`GET /api/v1/tasks/{task_id}/document` 是 P05 HITL 页面的核心依赖。无此接口则 PDFViewer 无法渲染原始文档，双视图联动功能整体不可用，建议优先排期。

---

## 六、前后端边界约束（汇总）

### 6.1 前端绝对禁止项

| 禁止行为 | 原因 |
|---------|------|
| 自行计算 `confidence_category` | 类别决定法律语义，只能由后端权威输出 |
| 自行触发或绕过 HITL | HITL 是系统行为，由后端唯一执行 |
| 自行执行状态机流转 | 状态机是核心业务规则 |
| P03 展示部分审核结论 | 避免用户在审核未完成时误判 |
| 用轮询替代 WebSocket（P02/P03） | 影响实时性，增加服务器负载 |
| 跳过后端校验直接完成审核 | 合规要求：Critical/High 必须全部处理 |
| 存储密钥、直接访问数据库 | 基本安全要求 |

### 6.2 关键交互约束

| 交互 | 约束 |
|------|------|
| 置信度颜色渲染 | 由后端 `confidence_category` 字段决定（fact=绿，clause=黄，legal=橙）|
| `legal` 类别条目 | 必须展示 `reasoning` 字段，不可缺失 |
| 完成审核按钮启用 | 前端本地计数（所有 Critical/High `reviewer_status ≠ pending`）+ 后端最终校验 |
| 整体驳回理由 | ≥20 字符，前端校验 + 后端二次校验 |
| 单条驳回理由 | ≥10 字符，前端校验 + 后端二次校验 |
| PDF 高亮位置 | 来自后端 `location_page` + `location_paragraph`，前端只执行定位，不自行推算 |
| 审核操作提交 | 乐观更新（先更新本地 UI），以后端响应为最终权威 |

---

## 七、WebSocket 事件与页面订阅关系

| 事件名 | 订阅页面 | 触发行为 |
|-------|---------|---------|
| `upload_progress`（0-40%） | P02 | 更新上传阶段进度条 |
| `parse_progress`（40-70%） | P02 | 更新解析阶段进度条 |
| `quality_check`（70-85%） | P02 | 展示 OCR 质量分 + 条件渲染警告区 |
| `parse_complete`（100%） | P02 | 路由跳转至 P03 |
| `parse_failed` | P02 | 路由跳转至 P08 |
| `auto_review_layer_update` | P03 | 更新 Layer1/2/3 各层进度 |
| `auto_review_complete` | P03 | 根据 `next_status` 跳转至 P04 或 P05 |
| `auto_review_failed` | P03 | 路由跳转至 P08 |
| `sla_reminder` | P05 | 展示 SLA 超期提醒 Toast |

**断线重连策略**：指数退避，最大 3 次；失败后降级为每 5 秒轮询查询状态（仅状态字段，不含进度）。

---

## 八、数据模型 → 前端字段映射汇总

| 前端场景 | 实体 | 关键字段 |
|---------|------|---------|
| 上传进度 | `ChunkUpload` | `id`、`original_filename`、`status` |
| 任务列表 | `ReviewTask` + `Document` | `id`/`status`/`created_at` + `original_filename`/`file_size_bytes` |
| 风险评分展示 | `ReviewResult` | `overall_risk_score`、`risk_level_summary`、`*_count`、`generated_at` |
| 风险列表 | `RiskItem` | `id`/`task_id`/`risk_type`/`risk_level`/`risk_description`/`confidence_score`/`confidence_category`/`reviewer_status` |
| PDF 定位高亮 | `RiskItem` | `location_page`/`location_paragraph`/`location_sentence_id`（V1 预留） |
| 低置信度推理 | `RiskItem` | `reasoning`（`confidence_category=legal` 时必显） |
| 可编辑字段（P05） | `RiskItem` | `risk_level`/`risk_description`/`reasoning` |
| 法规引用 | `SourceReference` | `source_type`/`source_name`/`article_number`/`reference_text` |
| 操作历史/diff | `HumanReviewOperation` + `EditRecord` | `action`/`operated_at`/`reject_reason` + `edited_field`/`original_value`/`new_value` |
| 批注展示 | `Annotation` | `review_task_id`/`risk_item_id`/`operator_id`/`content`/`created_at` |
| SLA 倒计时 | `ReviewTask` | `sla_deadline`（`human_reviewing` 状态时展示） |
| 审计日志 | `AuditLog` | 只读，分页，按 `review_task_id` 过滤 |

---

## 九、与上游文档的对应关系

| 规范决策 | 来源文档 | 章节 |
|---------|---------|------|
| 页面清单与层级 | `frontend-design-spec-v1.0.md` | §一、§二 |
| 前后端职责边界 | `frontend-backend-boundary-spec.md` | §一、§六 |
| 数据模型字段 | `data-model-spec-v1.0.md` | §四、§七 |
| API 接口定义 | `fastapi-spec-v1.0.md` | §四、§五、§六、§七 |
| HITL 工作流与中断协议 | `langchain-hitl-arch-spec-v1.0.md` | §三 |
| WebSocket 事件格式 | `frontend-backend-boundary-spec.md` | §七 |
| 置信度三档分级 | `data-model-spec-v1.0.md` | §五.3 |
| 11 态状态机 | `data-model-spec-v1.0.md` | §三 |

---

## 十、子文档索引

| 子文档 | 路径 | 覆盖内容 |
|-------|------|---------|
| 页面结构与路由规范 | `docs/09_frontend_plan/page-structure-and-routes.md` | P01/P02/P03/P06/P07/P08 路由、组件树、守卫、数据依赖 |
| 审核结果展示组件规范 | `docs/09_frontend_plan/review-result-components.md` | RiskScorePanel / RiskCategoryBoard / RiskItemList / RiskItemDetail / FactExtractionPanel / SourceReferencePanel |
| HITL 人机交互组件规范 | `docs/09_frontend_plan/hitl-interaction-components.md` | HumanReviewToolbar / PDFViewer / OperationButtonGroup / RejectTaskModal / EditFormModal / AuditLogPanel |

---

*本文档由 Team Lead 在 Teammate 1、2、3 全部完成后综合整理汇总。所有设计决策均可在三份子文档中找到对应依据。本文档作为前端实现阶段（`frontend/` 目录）的直接输入规范。*
