# 页面结构与路由规范

**阶段**：09_frontend_plan  
**日期**：2026-04-15  
**版本**：v1.0  
**负责角色**：前端架构规划 Teammate 1  
**依据文档**：
- `docs/06_system_architecture/frontend-design-spec-v1.0.md`
- `docs/06_system_architecture/frontend-backend-boundary-spec.md`
- `docs/06_system_architecture/data-model-spec-v1.0.md`
- `docs/08_api_spec/fastapi-spec-v1.0.md`

**覆盖页面**：P01 文档上传页、P02 解析进度页、P03 自动审核进度页、P06 任务列表页、P07 任务详情页、P08 失败处理页

---

## 目录

1. [页面层级总览](#一页面层级总览)
2. [路由整体架构](#二路由整体架构)
3. [P01 文档上传页](#三p01--文档上传页-upload)
4. [P02 解析进度页](#四p02--解析进度页-taskstaskidparsing)
5. [P03 自动审核进度页](#五p03--自动审核进度页-taskstaskidreviewing)
6. [P06 任务列表页](#六p06--任务列表页-tasks)
7. [P07 任务详情页](#七p07--任务详情页-taskstaskid)
8. [P08 失败处理页](#八p08--失败处理页-taskstaskidfailed)
9. [关键约束与边界说明](#九关键约束与边界说明)

---

## 一、页面层级总览

### 1.1 完整页面层级树

```
应用根（App Root）
├── AppLayout（全局导航布局）
│   ├── /upload                        → P01 文档上传页
│   └── /tasks                         → P06 任务列表页
│
└── TaskLayout（任务级布局，含面包屑）
    └── /tasks/:taskId                 → P07 任务详情页（Hub 页）
        ├── /tasks/:taskId/parsing     → P02 解析进度页
        ├── /tasks/:taskId/reviewing   → P03 自动审核进度页
        ├── /tasks/:taskId/failed      → P08 失败处理页
        │
        │   [下列页面超出本文档范围，仅列出以完整展示树结构]
        ├── /tasks/:taskId/result      → P04 审核结果页
        └── /tasks/:taskId/human-review → P05 人工审核（HITL）页
```

**说明**：
- `AppLayout`：顶部导航栏（系统名称 + 用户角色/退出）+ 页面主体区域，供 P01 和 P06 共用。
- `TaskLayout`：在 `AppLayout` 基础上叠加面包屑（任务列表 > 当前任务），供所有 `/tasks/:taskId/*` 子页面共用。
- P07 作为任务的核心 Hub 页，会在主体区域动态内嵌 P02/P03/P04 的核心组件；P02/P03 也可作为独立路由直接访问（WebSocket 长连接需要独立页面生命周期）。

### 1.2 任务状态与可访问路由映射表

| ReviewTask 状态 | 前端应访问的路由 | 说明 |
|----------------|----------------|------|
| `uploaded` / `parsing` | `/tasks/:taskId/parsing` | 上传完成后立即跳转，WebSocket 监听进度 |
| `parsed` / `auto_reviewing` | `/tasks/:taskId/reviewing` | 解析完成后自动跳转 |
| `auto_reviewed` | `/tasks/:taskId/reviewing`（等待跳转）或 P07 | auto_review_complete 事件触发路由跳转 |
| `human_reviewing` | `/tasks/:taskId/human-review`（P05，超出本文档范围） | - |
| `completed` | `/tasks/:taskId/result`（P04，超出本文档范围） | - |
| `parse_failed` | `/tasks/:taskId/failed` | - |
| `auto_review_failed` | `/tasks/:taskId/failed` | - |
| `human_review_failed` | `/tasks/:taskId/failed` | - |
| `rejected` | `/tasks/:taskId`（P07 只读终态） | 不提供任何操作入口 |

---

## 二、路由整体架构

### 2.1 完整路由配置表

| 路径 | 对应页面 | 布局组件 | 路由守卫条件 | 准入失败重定向 |
|------|---------|---------|------------|--------------|
| `/upload` | P01 文档上传页 | `AppLayout` | 已登录（JWT 有效） | `/login` |
| `/tasks` | P06 任务列表页 | `AppLayout` | 已登录 | `/login` |
| `/tasks/:taskId` | P07 任务详情页 | `TaskLayout` | 已登录 + 任务存在 | `/tasks`（任务不存在时） |
| `/tasks/:taskId/parsing` | P02 解析进度页 | `TaskLayout` | 已登录 + 任务状态 IN (`uploaded`, `parsing`) | `/tasks/:taskId` |
| `/tasks/:taskId/reviewing` | P03 自动审核进度页 | `TaskLayout` | 已登录 + 任务状态 IN (`parsed`, `auto_reviewing`, `auto_reviewed`) | `/tasks/:taskId` |
| `/tasks/:taskId/failed` | P08 失败处理页 | `TaskLayout` | 已登录 + 任务状态 IN (`parse_failed`, `auto_review_failed`, `human_review_failed`) | `/tasks/:taskId` |

> **注意**：路由守卫只做前端重定向，不可替代后端权限校验。后端对每个 API 均执行独立鉴权。

### 2.2 页面跳转流程图

```
用户操作：提交上传（P01）
         │
         │ POST /api/v1/upload/complete 成功
         │ 后端返回 task_id，状态为 uploaded
         ▼
P02 解析进度页（/tasks/:taskId/parsing）
         │
         │ WebSocket 接收 parse_complete 事件
         │ 前端路由跳转（由事件驱动）
         ▼
P03 自动审核进度页（/tasks/:taskId/reviewing）
         │
         │ WebSocket 接收 auto_review_complete 事件
         │ 事件携带 next_status 字段（后端决定）
         │
         ├──── next_status = "completed" ──────────────────────────► P04 审核结果页
         │     GET /tasks/:taskId/result
         │
         └──── next_status = "human_reviewing" ───────────────────► P05 人工审核页
               /tasks/:taskId/human-review

P02 ─── WebSocket 接收 parse_failed ────────────────────────────► P08 失败处理页
         /tasks/:taskId/failed

P03 ─── WebSocket 接收 auto_review_failed ──────────────────────► P08 失败处理页
         /tasks/:taskId/failed

P08（parse_failed）─── 点击"重新上传"按钮 ───────────────────► P01 文档上传页
                        /upload

P08（auto_review_failed）─── 点击"手动重试"按钮 ────────────► P03 自动审核进度页
                              POST /api/v1/tasks/:taskId/retry
                              （**后端未开发**）

P06 任务列表页 ─── 点击任务行 ──────────────────────────────► P07 任务详情页
                   /tasks/:taskId

P07 任务详情页 ─── 根据当前状态展示操作入口：
  状态 = parsing/uploaded    → 内嵌 ParseProgressPanel 组件
  状态 = auto_reviewing      → 内嵌 AutoReviewProgressPanel 组件
  状态 = completed           → 跳转 P04 按钮
  状态 = human_reviewing     → 跳转 P05 按钮
  状态 = *_failed            → 跳转 P08 按钮
  状态 = rejected            → 只读展示，无操作入口
```

### 2.3 路由守卫实现要点

路由守卫在前端执行以下逻辑（以 React Router `loader` 或 Vue Router `beforeEnter` 为实现载体）：

**步骤 1：身份校验**
- 检查本地存储的 JWT Token 是否存在且未过期（前端解析 exp 字段）
- 校验失败 → 重定向 `/login`

**步骤 2：任务状态预检（仅 `/tasks/:taskId/*` 路由）**
- 路由进入前，调用 `GET /api/v1/tasks/{task_id}` 获取当前状态
- 根据 API 返回的 `task.status` 判断是否满足目标路由的访问条件
- 不满足时重定向至对应路由（见 2.1 配置表）

**步骤 3：状态不匹配的重定向决策树**

```
收到 task.status 后：
  - uploaded / parsing           → 重定向 /tasks/:taskId/parsing
  - parsed / auto_reviewing      → 重定向 /tasks/:taskId/reviewing
  - auto_reviewed                → 重定向 /tasks/:taskId/reviewing（等待 WS 事件）
  - human_reviewing              → 重定向 /tasks/:taskId/human-review（超出本文档范围）
  - completed                    → 重定向 /tasks/:taskId/result（超出本文档范围）
  - parse_failed
  | auto_review_failed
  | human_review_failed          → 重定向 /tasks/:taskId/failed
  - rejected                     → 重定向 /tasks/:taskId（只读展示）
  - task 不存在（404）           → 重定向 /tasks（任务列表）
```

**重要约束**：
- 前端路由守卫产生的重定向仅为用户体验优化，不可替代后端权限校验
- 后端每个接口均独立校验 JWT 和操作权限，前端守卫绕过不等于后端授权

### 2.4 Layout 层级

| 布局组件 | 包含页面 | 公共 UI 元素 |
|---------|---------|------------|
| `AppLayout` | P01（/upload）、P06（/tasks） | 顶部导航栏（系统名称、用户角色标签、退出按钮） |
| `TaskLayout` | P02、P03、P07、P08 | 继承 AppLayout + 面包屑（任务列表 > 任务名称） |

`TaskLayout` 面包屑数据来源：
- "任务列表"：静态文字，链接至 `/tasks`
- "任务名称"：从 `GET /api/v1/tasks/{task_id}` 返回的 `document.original_filename` 字段

---

## 三、P01 — 文档上传页 `/upload`

### 3.1 路由路径

```
路径：/upload
动态参数：无
```

### 3.2 页面层级关系

| 维度 | 说明 |
|------|------|
| 父布局 | `AppLayout` |
| 面包屑 | 无（顶层页面） |
| 跳转触发条件 | 提交上传成功（`POST /api/v1/upload/complete` 返回 201），前端获得 `task_id` 后立即跳转 `/tasks/:taskId/parsing` |

### 3.3 路由守卫规则

| 条件 | 处理方式 |
|------|---------|
| JWT 有效 | 正常进入 |
| JWT 无效或缺失 | 重定向 `/login` |
| 无额外任务状态前置条件 | — |

### 3.4 页面组件树

```
P01 页面根（UploadPage）
├── [继承] AppLayout
│   ├── TopNavBar（顶部导航栏）
│   │   ├── SystemLogo（系统名称/LOGO）
│   │   └── UserInfo（角色标签 + 退出按钮）
│   └── PageContent（主体插槽）
│       ├── UploadZone（上传拖拽区）
│       │   ├── DropArea（拖拽区域，支持 dragover / drop 事件）
│       │   │   ├── DropIcon（上传图标）
│       │   │   ├── DropHintText（拖拽提示文字）
│       │   │   └── FileInput（隐藏 input[type=file]，多文件，accept=".pdf,.docx,.doc"）
│       │   ├── SelectButton（点击选择文件按钮，触发 FileInput click）
│       │   └── FormatHintText（格式说明：支持 PDF / .docx / .doc，单文件 ≤ 50MB）
│       ├── FilePreviewList（文件待上传列表，条件展示：有文件时渲染）
│       │   └── FilePreviewItem × N（每个待上传文件）
│       │       ├── FileTypeIcon（格式图标：PDF / Word）
│       │       ├── FileNameText（文件名）
│       │       ├── FileSizeText（文件大小，换算为 MB）
│       │       ├── UploadProgressBar（上传分片进度，0–40%，WebSocket 驱动；< 20MB 时不展示）
│       │       ├── FileStatusBadge（状态标签：待上传 / 上传中 / 上传完成 / 上传失败）
│       │       └── RemoveButton（单文件移除，上传进行中时禁用）
│       ├── ActionBar（操作区，条件：有文件时展示）
│       │   ├── SubmitButton（提交上传按钮；所有文件通过客户端校验后启用）
│       │   └── ClearButton（清空列表按钮；上传进行中时禁用）
│       └── GlobalToast（全局 Toast 提示，轻量错误提示）
│           └── ErrorModal（阻断性错误弹窗，如融资股权文件硬拦截）
```

### 3.5 数据依赖

| API | 方法 | 路径 | 触发时机 | 规范状态 |
|-----|------|------|---------|---------|
| 初始化分片上传 | POST | `/api/v1/upload/init` | 用户点击"提交上传"，前端校验通过后调用 | 已在 API 规范中定义 |
| 上传分片（S3 直传） | PUT | `<presigned_url>`（S3，非后端接口） | 逐片上传，并发 ≤ 3 | 已在 API 规范中定义 |
| 完成上传 | POST | `/api/v1/upload/complete` | 所有分片上传完毕后调用 | 已在 API 规范中定义 |

> 文件 < 20MB 时，`total_parts=1`，前端只发起一次直传，无需切片。

### 3.6 WebSocket 订阅

P01 页面自身**不建立 WebSocket 连接**。

WebSocket 连接在 `POST /api/v1/upload/complete` 返回 `task_id` 并跳转 P02 后，由 P02 页面负责建立。

### 3.7 本地状态（不持久化到后端）

| 本地状态 | 类型 | 说明 |
|---------|------|------|
| `pendingFiles` | `File[]` | 待上传文件队列（用户选择后加入，移除后删除） |
| `uploadSessionMap` | `Map<filename, chunkUploadId>` | 文件名 → 上传会话 ID 的映射，complete 后清空 |
| `fileProgressMap` | `Map<filename, number>` | 文件名 → 当前分片上传进度（0–100%）的本地映射 |
| `fileStatusMap` | `Map<filename, 'pending'|'uploading'|'done'|'error'>` | 每个文件的上传状态 |
| `isSubmitting` | `boolean` | 提交中状态，防重复提交，控制按钮 disabled |
| `clientValidationErrors` | `string[]` | 客户端校验错误列表（格式不支持、超大文件等），展示在 Toast |

---

## 四、P02 — 解析进度页 `/tasks/:taskId/parsing`

### 4.1 路由路径

```
路径：/tasks/:taskId/parsing
动态参数：
  :taskId — ReviewTask UUID（如 "550e8400-e29b-41d4-a716-446655440000"）
```

### 4.2 页面层级关系

| 维度 | 说明 |
|------|------|
| 父布局 | `TaskLayout`（含面包屑） |
| 面包屑 | 任务列表 > `{document.original_filename}` > 解析进度 |
| 跳转触发条件 | 接收到 WebSocket `parse_complete` 事件后，前端自动跳转 `/tasks/:taskId/reviewing` |
| 错误跳转条件 | 接收到 WebSocket `parse_failed` 事件后，前端自动跳转 `/tasks/:taskId/failed` |

### 4.3 路由守卫规则

| 条件 | 处理方式 |
|------|---------|
| JWT 有效 + 任务状态 IN (`uploaded`, `parsing`) | 正常进入 |
| 任务状态为 `parsed` / `auto_reviewing` | 重定向 `/tasks/:taskId/reviewing` |
| 任务状态为 `*_failed` | 重定向 `/tasks/:taskId/failed` |
| 任务状态为其他终态或非解析态 | 重定向 `/tasks/:taskId` |
| 任务不存在 | 重定向 `/tasks` |

### 4.4 页面组件树

```
P02 页面根（ParsingProgressPage）
├── [继承] TaskLayout
│   ├── TopNavBar（继承自 AppLayout）
│   ├── BreadcrumbBar（面包屑）
│   │   ├── TaskListLink（"任务列表" → /tasks）
│   │   ├── BreadcrumbSeparator
│   │   ├── TaskNameText（document.original_filename，截断展示）
│   │   ├── BreadcrumbSeparator
│   │   └── CurrentPageLabel（"解析进度"，非链接）
│   └── PageContent（主体插槽）
│       ├── DocumentInfoCard（文档信息卡片）
│       │   ├── FileNameText（文件名）
│       │   └── UploadTimeText（创建时间）
│       ├── ParseProgressPanel（进度可视化组件，WebSocket 驱动）
│       │   ├── StageIndicatorRow（阶段状态图标行，水平排列）
│       │   │   ├── StageStep（上传中，图标 + 文字 + 状态：完成/进行中/等待）
│       │   │   ├── StageStep（文本提取，图标 + 文字 + 状态）
│       │   │   ├── StageStep（质量检测，图标 + 文字 + 状态）
│       │   │   └── StageStep（完成，图标 + 文字 + 状态）
│       │   ├── GlobalProgressBar（全局进度条，0–100%，数值来自 WebSocket progress 字段）
│       │   └── CurrentStageText（当前阶段动词进行时文案，如"文档解析中…"）
│       ├── OcrQualityWarningArea（条件展示：quality_score 在 70–84 时展示橙色警告）
│       │   ├── QualityScoreDisplay（质量分数值展示）
│       │   ├── QualityWarningText（"解析质量中等，建议人工复核关键条款"）
│       │   └── ManualFallbackLink（条件展示：quality_score < 70 时展示"降级人工通道"入口）
│       └── ParseFailedArea（条件展示：parse_failed 状态）
│           ├── FailureIcon
│           ├── ErrorDescriptionText（错误说明文案，来自后端 error_code 对应的前端文案映射）
│           ├── RetryUploadButton（"重新上传"，跳转 /upload）
│           └── ContactSupportLink（联系支持入口）
```

### 4.5 数据依赖

| API | 方法 | 路径 | 触发时机 | 规范状态 |
|-----|------|------|---------|---------|
| 获取任务详情（含文档信息） | GET | `/api/v1/tasks/{task_id}` | 页面进入时调用一次（初始化文档信息卡片） | 已在 API 规范中定义 |

> 进度数据**全部由 WebSocket 推送驱动**，不得使用 REST 轮询替代。

### 4.6 WebSocket 订阅

**连接地址**：`/ws/v1/tasks/{task_id}/progress`  
**连接时机**：页面挂载（`onMounted`/`useEffect`）时立即建立连接  
**销毁时机**：页面卸载（`onUnmounted`/`useEffect cleanup`）时关闭连接

| 订阅事件 | 触发时机（后端） | 前端处理 |
|---------|--------------|---------|
| `upload_progress` | 分片上传阶段（0–40%） | 更新 `progressValue`，`currentStage = 'uploading'` |
| `parse_progress` | 文档解析阶段（40–70%） | 更新 `progressValue`，`currentStage = 'extracting'` |
| `quality_check` | OCR 质量门控（70–85%） | 更新 `progressValue`，`currentStage = 'quality'`，缓存 `quality_score` |
| `parse_complete` | 解析完成（100%） | 更新 `progressValue = 100`，延迟 800ms 后路由跳转至 `/tasks/:taskId/reviewing` |
| `parse_failed` | 解析失败 | 展示 `ParseFailedArea`，停止进度动画 |

**断线重连策略**：指数退避，最大重试 3 次（1s / 2s / 4s）。3 次失败后降级为每 5 秒轮询 `GET /api/v1/tasks/{task_id}` 查询状态，但必须在界面展示"实时进度暂时不可用，正在重试…"提示。

### 4.7 本地状态（不持久化到后端）

| 本地状态 | 类型 | 说明 |
|---------|------|------|
| `progressValue` | `number`（0–100） | 当前进度条数值，由 WebSocket progress 字段驱动 |
| `currentStage` | `'uploading'|'extracting'|'quality'|'done'|'failed'` | 当前阶段，驱动 StageIndicatorRow 各步状态 |
| `currentStageMessage` | `string` | 当前阶段文案（如"文档解析中…"） |
| `ocrQualityScore` | `number | null` | OCR 质量分，来自 quality_check 事件 |
| `wsRetryCount` | `number` | WebSocket 断线重连次数计数 |
| `isFallbackPolling` | `boolean` | 是否已降级为轮询模式 |
| `isParseError` | `boolean` | 是否接收到 parse_failed 事件 |

---

## 五、P03 — 自动审核进度页 `/tasks/:taskId/reviewing`

### 5.1 路由路径

```
路径：/tasks/:taskId/reviewing
动态参数：
  :taskId — ReviewTask UUID
```

### 5.2 页面层级关系

| 维度 | 说明 |
|------|------|
| 父布局 | `TaskLayout`（含面包屑） |
| 面包屑 | 任务列表 > `{document.original_filename}` > 自动审核 |
| 跳转触发条件（正常） | 接收到 WebSocket `auto_review_complete` 事件，根据事件的 `next_status` 字段跳转：`completed` → P04（`/tasks/:taskId/result`）；`human_reviewing` → P05（`/tasks/:taskId/human-review`） |
| 跳转触发条件（失败） | 接收到 WebSocket `auto_review_failed` 事件后，展示失败态并提供跳转 P08 按钮 |

### 5.3 路由守卫规则

| 条件 | 处理方式 |
|------|---------|
| JWT 有效 + 任务状态 IN (`parsed`, `auto_reviewing`, `auto_reviewed`) | 正常进入 |
| 任务状态为 `uploaded` / `parsing` | 重定向 `/tasks/:taskId/parsing` |
| 任务状态为 `*_failed` | 重定向 `/tasks/:taskId/failed` |
| 任务状态为 `completed` / `human_reviewing` | 重定向 `/tasks/:taskId` |
| 任务不存在 | 重定向 `/tasks` |

### 5.4 页面组件树

```
P03 页面根（ReviewingProgressPage）
├── [继承] TaskLayout
│   ├── TopNavBar（继承自 AppLayout）
│   ├── BreadcrumbBar（面包屑）
│   │   ├── TaskListLink（"任务列表" → /tasks）
│   │   ├── BreadcrumbSeparator
│   │   ├── TaskNameText（document.original_filename）
│   │   ├── BreadcrumbSeparator
│   │   └── CurrentPageLabel（"自动审核"）
│   └── PageContent（主体插槽）
│       ├── DocumentInfoCard（文档信息卡片，与 P02 相同结构）
│       │   ├── FileNameText
│       │   └── UploadTimeText
│       ├── AutoReviewProgressPanel（三层审核进度组件，WebSocket 驱动）
│       │   ├── Layer1StatusRow（格式校验 & 文档分类）
│       │   │   ├── LayerIcon（状态图标：等待中/进行中/完成）
│       │   │   ├── LayerLabel（"格式校验 & 文档分类"）
│       │   │   ├── LayerProgressWeight（权重标注：5%）
│       │   │   └── LayerStatusText（"格式校验 & 文档分类中…" / "已完成"）
│       │   ├── Layer2StatusRow（条款识别 & 规则匹配）
│       │   │   ├── LayerIcon
│       │   │   ├── LayerLabel（"条款识别 & 规则匹配"）
│       │   │   ├── LayerProgressWeight（权重标注：35%）
│       │   │   └── LayerStatusText（"条款识别 & 规则匹配中…" / "已完成"）
│       │   └── Layer3StatusRow（LLM 深度分析）
│       │       ├── LayerIcon
│       │       ├── LayerLabel（"LLM 深度分析"）
│       │       ├── LayerProgressWeight（权重标注：60%）
│       │       └── LayerStatusText（"LLM 深度分析中…" / "已完成"）
│       ├── DisclaimerText（约束说明："AI 辅助初审，仅供参考，不构成法律建议"）
│       └── AutoReviewFailedArea（条件展示：auto_review_failed 时）
│           ├── FailureIcon
│           ├── FailureReasonText（失败原因文案，来自 error_code 前端文案映射）
│           ├── RetryButton（"手动重试"按钮，仅首次失败可点击，已重试过则禁用；点击后调用 POST /retry）
│           └── EscalateToHumanLink（"升级人工审核"入口，跳转 P08 或直接触发 escalate 操作）
```

**P03 展示约束（来自 frontend-design-spec 和 frontend-backend-boundary-spec）**：
- **禁止**展示任何审核结论（包括局部结果），即使 Layer1/2 已完成也不展示分析结论
- **禁止**展示"手动触发 HITL"入口（HITL 触发由后端决定，前端无权操控）
- 所有进度由 WebSocket 推送，**禁止**前端使用定时器轮询替代

### 5.5 数据依赖

| API | 方法 | 路径 | 触发时机 | 规范状态 |
|-----|------|------|---------|---------|
| 获取任务详情 | GET | `/api/v1/tasks/{task_id}` | 页面进入时调用一次（初始化文档信息卡片） | 已在 API 规范中定义 |
| 手动重试（auto_review_failed 时） | POST | `/api/v1/tasks/{task_id}/retry` | 用户点击"手动重试"按钮（≤1次） | **后端未开发** |

### 5.6 WebSocket 订阅

**连接地址**：`/ws/v1/tasks/{task_id}/progress`（与 P02 同一 channel）  
**连接时机**：页面挂载时建立，若已有 P02 未断开的连接，复用同一连接句柄  
**销毁时机**：页面卸载时关闭连接

| 订阅事件 | 触发时机（后端） | 前端处理 |
|---------|--------------|---------|
| `auto_review_layer_update` | 每层审核状态变化（Layer 1/2/3 各自推送） | 根据 `layer` 字段（1/2/3）更新对应层状态和进度 |
| `auto_review_complete` | 自动审核全部完成 | 读取 `next_status` 字段，跳转对应路由（completed → P04；human_reviewing → P05） |
| `auto_review_failed` | 自动审核失败 | 展示 `AutoReviewFailedArea`，停止进度动画 |

**断线重连策略**：同 P02（指数退避，最大 3 次，降级轮询）。

### 5.7 本地状态（不持久化到后端）

| 本地状态 | 类型 | 说明 |
|---------|------|------|
| `layerStatusMap` | `Record<1|2|3, 'pending'|'active'|'done'>` | 三层各自的执行状态，驱动 LayerIcon 渲染 |
| `layerMessageMap` | `Record<1|2|3, string>` | 三层各自的状态文案 |
| `wsRetryCount` | `number` | WebSocket 断线重连次数计数 |
| `isFallbackPolling` | `boolean` | 是否已降级为轮询模式 |
| `isAutoReviewError` | `boolean` | 是否接收到 auto_review_failed 事件 |
| `retryUsed` | `boolean` | 是否已使用过手动重试（最多 1 次） |

---

## 六、P06 — 任务列表页 `/tasks`

### 6.1 路由路径

```
路径：/tasks
动态参数：无
```

### 6.2 页面层级关系

| 维度 | 说明 |
|------|------|
| 父布局 | `AppLayout` |
| 面包屑 | 无（顶层页面） |
| 跳转触发条件 | 点击任务行（任意列区域）跳转 `/tasks/:taskId` |

### 6.3 路由守卫规则

| 条件 | 处理方式 |
|------|---------|
| JWT 有效 | 正常进入 |
| JWT 无效 | 重定向 `/login` |
| 无额外任务状态前置条件 | — |

### 6.4 页面组件树

```
P06 页面根（TaskListPage）
├── [继承] AppLayout
│   ├── TopNavBar（继承自 AppLayout）
│   └── PageContent（主体插槽）
│       ├── PageHeader（页面标题区）
│       │   ├── PageTitle（"审核任务列表"）
│       │   └── NewUploadButton（"新建审核"按钮，跳转 /upload）
│       ├── FilterSearchBar（筛选/搜索栏）
│       │   ├── StatusFilterTabs（任务状态过滤 Tab：全部 / 进行中 / 已完成 / 失败）
│       │   │   └── [Tab 对应状态映射]
│       │   │       ├── 全部：不过滤
│       │   │       ├── 进行中：status IN (uploaded, parsing, parsed, auto_reviewing, auto_reviewed, human_reviewing)
│       │   │       ├── 已完成：status = completed
│       │   │       └── 失败：status IN (parse_failed, auto_review_failed, human_review_failed)
│       │   ├── DateRangePicker（日期范围筛选：按创建时间，精确到日）
│       │   └── FileNameSearchInput（文档名搜索框，输入后 debounce 300ms 触发请求）
│       ├── TaskTable（任务列表表格）
│       │   ├── TableHeader（表头行）
│       │   │   ├── ColHeader（文档名）
│       │   │   ├── ColHeader（上传时间）
│       │   │   ├── ColHeader（当前状态）
│       │   │   ├── ColHeader（整体风险评分）
│       │   │   └── ColHeader（操作）
│       │   └── TableRow × N（每个任务一行，点击跳转 /tasks/:taskId）
│       │       ├── FileNameCell（文档名，截断超长）
│       │       ├── UploadTimeCell（created_at，格式化展示）
│       │       ├── StatusBadgeCell（状态色标 + 文字，颜色由状态决定）
│       │       ├── RiskScoreCell（整体风险评分，仅 auto_reviewed 及之后状态有值，其他显示"—"）
│       │       └── ActionCell（"查看"链接，跳转 /tasks/:taskId）
│       └── PaginationControl（分页控件）
│           ├── PageSizeSelector（每页条数：10 / 20 / 50）
│           ├── PageNavigator（上一页 / 页码 / 下一页）
│           └── TotalCountText（"共 N 条"）
```

**状态色标规范**（来自 frontend-design-spec）：

| 状态值 | 展示文字 | 色标颜色 |
|-------|---------|---------|
| `uploaded` / `parsing` / `parsed` | 解析中 | 蓝色 |
| `auto_reviewing` / `auto_reviewed` | 审核中 | 蓝色 |
| `human_reviewing` | 人工审核中 | 橙色 |
| `completed` | 已完成 | 绿色 |
| `parse_failed` / `auto_review_failed` / `human_review_failed` | 失败 | 红色 |
| `rejected` | 已驳回 | 灰色 |

### 6.5 数据依赖

| API | 方法 | 路径 | 触发时机 | 规范状态 |
|-----|------|------|---------|---------|
| 获取任务列表 | GET | `/api/v1/documents` | 页面进入、筛选/搜索/分页参数变更时重新请求 | 已在 API 规范中定义 |

**请求参数说明**（传递至 GET /api/v1/documents）：
- `page`：分页页码
- `page_size`：每页条数
- `status`：状态过滤（多值逗号分隔）
- `uploader_user_id`：`legal_staff` 角色默认传自身 user_id（后端也会限制），其他角色不传

### 6.6 WebSocket 订阅

P06 页面**不建立 WebSocket 连接**。

任务状态变更通过用户主动刷新列表获知（点击刷新按钮或筛选条件变更时重新请求）。

### 6.7 本地状态（不持久化到后端）

| 本地状态 | 类型 | 说明 |
|---------|------|------|
| `filterStatus` | `string | null` | 当前选中的状态过滤 Tab |
| `dateRange` | `[Date, Date] | null` | 日期范围筛选值 |
| `searchKeyword` | `string` | 文档名搜索关键词 |
| `currentPage` | `number` | 当前页码（从 1 开始） |
| `pageSize` | `number` | 每页条数（默认 20） |
| `isLoading` | `boolean` | 列表加载状态，控制 TableBody 显示骨架屏 |

---

## 七、P07 — 任务详情页 `/tasks/:taskId`

### 7.1 路由路径

```
路径：/tasks/:taskId
动态参数：
  :taskId — ReviewTask UUID
```

### 7.2 页面层级关系

| 维度 | 说明 |
|------|------|
| 父布局 | `TaskLayout`（含面包屑） |
| 面包屑 | 任务列表 > `{document.original_filename}` |
| 入口 | P06 任务列表页点击任意任务行 |
| 子路由跳转条件 | 根据任务状态动态展示操作入口（非嵌套路由，而是条件渲染跳转按钮/链接） |

**P07 的核心定位**：P07 是任务的"状态 Hub 页"，展示任务全貌（状态时间线 + 审计日志）。当任务处于活跃进度状态时，P07 会内嵌对应的进度组件（复用 P02/P03 的组件，不是路由嵌套）；当任务到达可操作的终点状态时，P07 提供跳转入口。

### 7.3 路由守卫规则

| 条件 | 处理方式 |
|------|---------|
| JWT 有效 + 任务存在 | 正常进入 |
| JWT 有效 + 任务不存在（API 返回 404） | 重定向 `/tasks` 并展示 Toast："任务不存在或已被删除" |
| JWT 无效 | 重定向 `/login` |
| 无额外任务状态限制（所有状态均可访问 P07） | — |

### 7.4 页面组件树

```
P07 页面根（TaskDetailPage）
├── [继承] TaskLayout
│   ├── TopNavBar（继承自 AppLayout）
│   ├── BreadcrumbBar（面包屑）
│   │   ├── TaskListLink（"任务列表" → /tasks）
│   │   ├── BreadcrumbSeparator
│   │   └── TaskNameText（document.original_filename，非链接）
│   └── PageContent（主体插槽）
│       ├── TaskStatusCard（任务状态卡片）
│       │   ├── CurrentStatusBadge（当前状态标签 + 色标）
│       │   ├── StatusTimeline（状态流转时间线，只读）
│       │   │   ├── TimelineStep × N（已完成步骤，含时间戳）
│       │   │   ├── TimelineStep（当前步骤，活跃高亮）
│       │   │   └── TimelineStep × N（待完成步骤，灰色）
│       │   └── SlaCountdown（条件展示：仅 human_reviewing 状态时展示 SLA 倒计时）
│       │       ├── SlaDeadlineText（"需在 {sla_deadline} 前完成审核"）
│       │       └── CountdownTimer（剩余时间倒计时，前端本地计算；以 sla_deadline 为基准）
│       ├── DynamicContentArea（动态内容区，根据 task.status 条件渲染）
│       │   │
│       │   ├── [status = uploaded / parsing]
│       │   │   └── ParseProgressPanel（复用 P02 的进度组件，此时 P07 也建立 WebSocket）
│       │   │
│       │   ├── [status = parsed / auto_reviewing / auto_reviewed]
│       │   │   └── AutoReviewProgressPanel（复用 P03 的进度组件）
│       │   │
│       │   ├── [status = completed]
│       │   │   └── ViewResultButton（"查看审核结果"按钮 → /tasks/:taskId/result）
│       │   │
│       │   ├── [status = human_reviewing]
│       │   │   └── GoToHumanReviewButton（"进入人工审核"按钮 → /tasks/:taskId/human-review）
│       │   │
│       │   ├── [status = parse_failed / auto_review_failed / human_review_failed]
│       │   │   └── GoToFailedPageButton（"查看失败详情"按钮 → /tasks/:taskId/failed）
│       │   │
│       │   └── [status = rejected]
│       │       └── RejectedTerminalNotice（"任务已被驳回，不可继续操作"，只读展示）
│       │
│       └── AuditLogPanel（审计日志折叠区）
│           ├── PanelToggleButton（折叠/展开，默认折叠）
│           └── [展开后展示]
│               ├── AuditLogList（审计日志条目列表）
│               │   └── AuditLogItem × N
│               │       ├── EventTypeTag（事件类型标签）
│               │       ├── EventDetailText（detail 字段展示，状态变更/操作描述）
│               │       └── OccurredAtText（发生时间）
│               └── AuditLogPagination（分页控件，默认 20 条/页）
```

### 7.5 数据依赖

| API | 方法 | 路径 | 触发时机 | 规范状态 |
|-----|------|------|---------|---------|
| 获取任务详情 | GET | `/api/v1/tasks/{task_id}` | 页面进入时调用，状态变更后重新调用 | 已在 API 规范中定义 |
| 获取审计日志 | GET | `/api/v1/tasks/{task_id}/audit-logs` | AuditLogPanel 展开时（懒加载），分页变更时 | 已在 API 规范中定义 |

### 7.6 WebSocket 订阅

**连接条件**：仅当任务状态为 `uploaded` / `parsing` / `parsed` / `auto_reviewing` / `auto_reviewed` 时，P07 建立 WebSocket 连接（以复用进度组件的实时能力）。

**连接地址**：`/ws/v1/tasks/{task_id}/progress`

| 订阅事件 | 触发时机（后端） | 前端处理 |
|---------|--------------|---------|
| `parse_complete` | 解析完成 | 重新调用 GET /tasks/{task_id}，刷新任务状态和 DynamicContentArea |
| `parse_failed` | 解析失败 | 重新调用 GET /tasks/{task_id}，DynamicContentArea 切换为失败态 |
| `auto_review_complete` | 自动审核完成 | 重新调用 GET /tasks/{task_id}，DynamicContentArea 切换为对应状态 |
| `auto_review_failed` | 自动审核失败 | 重新调用 GET /tasks/{task_id}，DynamicContentArea 切换为失败态 |

**P07 与 P02/P03 的 WebSocket 共存说明**：
- 若用户直接访问 P07（而非经由 P02/P03 跳转），P07 自行建立 WebSocket 连接
- 若用户从 P02/P03 跳转至 P07（WebSocket 理论上已断开），P07 重新建立连接
- 同一浏览器 Tab 同时只存在一条到该 task_id channel 的 WebSocket 连接

### 7.7 本地状态（不持久化到后端）

| 本地状态 | 类型 | 说明 |
|---------|------|------|
| `taskDetail` | `ReviewTask & Document & ReviewResult | null` | 从 API 获取的任务详情，驱动整页渲染 |
| `isAuditLogExpanded` | `boolean` | AuditLogPanel 展开/折叠状态，默认 false |
| `auditLogPage` | `number` | 审计日志当前页码 |
| `auditLogPageSize` | `number` | 审计日志每页条数，默认 20 |
| `slaRemainingSeconds` | `number | null` | SLA 倒计时剩余秒数，前端本地计算（以 sla_deadline 为基准） |

---

## 八、P08 — 失败处理页 `/tasks/:taskId/failed`

### 8.1 路由路径

```
路径：/tasks/:taskId/failed
动态参数：
  :taskId — ReviewTask UUID
```

### 8.2 页面层级关系

| 维度 | 说明 |
|------|------|
| 父布局 | `TaskLayout`（含面包屑） |
| 面包屑 | 任务列表 > `{document.original_filename}` > 失败详情 |
| 入口 | P02 接收 parse_failed 事件、P03 接收 auto_review_failed 事件、P07 点击"查看失败详情"按钮 |
| 跳转触发条件 | parse_failed：点击"重新上传"跳转 `/upload`；auto_review_failed：点击"手动重试"（成功后跳转 P03） |

### 8.3 路由守卫规则

| 条件 | 处理方式 |
|------|---------|
| JWT 有效 + 任务状态 IN (`parse_failed`, `auto_review_failed`, `human_review_failed`) | 正常进入 |
| 任务状态为非失败态 | 重定向 `/tasks/:taskId` |
| 任务不存在 | 重定向 `/tasks` |

### 8.4 页面组件树

```
P08 页面根（TaskFailedPage）
├── [继承] TaskLayout
│   ├── TopNavBar（继承自 AppLayout）
│   ├── BreadcrumbBar（面包屑）
│   │   ├── TaskListLink（"任务列表" → /tasks）
│   │   ├── BreadcrumbSeparator
│   │   ├── TaskNameText（document.original_filename）
│   │   ├── BreadcrumbSeparator
│   │   └── CurrentPageLabel（"失败详情"）
│   └── PageContent（主体插槽）
│       ├── FailureStatusArea（失败状态说明区）
│       │   ├── FailureIcon（红色警告图标）
│       │   ├── FailureStatusBadge（失败状态标签：解析失败 / 自动审核失败 / 人工审核失败）
│       │   ├── FailureReasonText（具体错误文案，前端根据 task.status 和 error_code 映射）
│       │   └── FailureCategoryExplain（错误分类说明，帮助用户理解失败原因）
│       └── ActionArea（操作区，根据失败状态动态渲染）
│           │
│           ├── [task.status = parse_failed]
│           │   ├── RetryUploadButton（"重新上传"，跳转 /upload，清空当前上传会话）
│           │   └── ContactSupportLink（"联系技术支持"，展示支持联系方式或跳转工单页）
│           │
│           ├── [task.status = auto_review_failed]
│           │   ├── ManualRetryButton（"手动重试"；仅在 retryUsed=false 时启用；点击调用 POST /retry）
│           │   │   └── [已重试过：按钮变为 disabled，显示"已使用重试机会"]
│           │   └── EscalateToHumanButton（"升级人工审核"；点击触发升级操作）
│           │       └── [**后端未开发**：POST /api/v1/tasks/{task_id}/escalate-to-human]
│           │
│           └── [task.status = human_review_failed]
│               ├── ReassignButton（"重新分配审核人"；仅管理员/系统触发，法务/律师角色不展示）
│               │   └── [**后端未开发**：POST /api/v1/tasks/{task_id}/reassign]
│               └── ContactAdminLink（"联系管理员"，展示管理员联系方式）
```

### 8.5 数据依赖

| API | 方法 | 路径 | 触发时机 | 规范状态 |
|-----|------|------|---------|---------|
| 获取任务详情 | GET | `/api/v1/tasks/{task_id}` | 页面进入时调用，获取失败状态和错误信息 | 已在 API 规范中定义 |
| 手动重试自动审核 | POST | `/api/v1/tasks/{task_id}/retry` | 用户点击"手动重试"（仅 auto_review_failed，≤1次） | **后端未开发** |
| 升级人工审核 | POST | `/api/v1/tasks/{task_id}/escalate-to-human` | 用户点击"升级人工审核"（auto_review_failed 时） | **后端未开发** |
| 重新分配审核人 | POST | `/api/v1/tasks/{task_id}/reassign` | 管理员点击"重新分配"（human_review_failed 时） | **后端未开发** |

**错误文案映射规则**（前端本地维护，后端不提供文案）：

| task.status | error_code（来自 ParseResult.error_code 或 WebSocket 事件） | 展示文案 |
|------------|----------------------------------------------------------|---------|
| `parse_failed` | `OCR_QUALITY_LOW` | "文档扫描质量不足，无法自动提取文字。建议重新扫描后上传，或联系技术支持。" |
| `parse_failed` | `UNSUPPORTED_CONTENT` | "文档内容格式暂不支持解析，请联系技术支持。" |
| `parse_failed` | `PARSE_TIMEOUT` | "文档解析超时，可能由于文件过大或服务繁忙，请稍后重试。" |
| `auto_review_failed` | `LLM_SERVICE_ERROR` | "AI 审核服务暂时不可用，请手动重试或升级人工审核。" |
| `auto_review_failed` | `RULE_ENGINE_ERROR` | "规则引擎异常，请联系技术支持。" |
| `human_review_failed` | — | "人工审核过程出现异常，请联系管理员重新分配审核人。" |

### 8.6 WebSocket 订阅

P08 页面**不建立 WebSocket 连接**。

失败页为终点状态展示页，无需实时推送。若用户点击"手动重试"成功，前端通过 API 响应判断并跳转 P03。

### 8.7 本地状态（不持久化到后端）

| 本地状态 | 类型 | 说明 |
|---------|------|------|
| `taskDetail` | `ReviewTask & Document | null` | 任务详情，驱动失败状态和操作区渲染 |
| `retryUsed` | `boolean` | 是否已点击过"手动重试"（本地记录，刷新页面后需从后端判断）|
| `isRetrying` | `boolean` | 手动重试请求进行中，控制按钮 loading 状态 |
| `isEscalating` | `boolean` | 升级人工审核请求进行中 |

---

## 九、关键约束与边界说明

### 9.1 前端明确禁止的行为

以下约束来源于 `frontend-backend-boundary-spec.md`，前端实现**必须严格遵守**：

| 禁止行为 | 原因 |
|---------|------|
| 自行根据 `confidence_score` 数值计算 `confidence_category` | 置信度类别决定法律展示语义，必须由后端提供 `confidence_category` 字段，前端只做颜色渲染 |
| 在 P03 展示任何审核结论（即使 Layer1/2 已完成） | 避免用户在审核未完成时误判 AI 初步结论 |
| 在 P03 展示"手动触发 HITL"入口 | HITL 触发是系统行为，由后端基于业务规则决定，前端无权触发或干预 |
| 前端自行执行状态机路径（如将 auto_reviewing 直接跳转 completed） | 状态机是核心业务规则，后端唯一执行方 |
| 在 P05（完成审核）绕过后端校验直接流转状态 | 合规要求：Critical/High 条目必须全部人工处理，后端须二次校验 |
| 使用定时器轮询替代 WebSocket（P02/P03） | 影响实时性，增加服务器负载 |
| 前端存储或处理任何密钥/凭证 | 安全基本要求 |

### 9.2 后端未开发接口汇总

本文档涉及以下接口尚未在 `docs/08_api_spec/fastapi-spec-v1.0.md` 中定义，前端实现时**不得自行伪造接口格式**，需等待后端确认后对接：

| 接口 | 方法 | 路径 | 使用场景 |
|------|------|------|---------|
| 手动重试自动审核 | POST | `/api/v1/tasks/{task_id}/retry` | P03 和 P08 的手动重试按钮 |
| 升级人工审核 | POST | `/api/v1/tasks/{task_id}/escalate-to-human` | P08（auto_review_failed）升级入口 |
| 重新分配审核人 | POST | `/api/v1/tasks/{task_id}/reassign` | P08（human_review_failed）管理员操作 |

### 9.3 任务状态与路由的权威来源

前端路由守卫所使用的任务状态，**必须来自 `GET /api/v1/tasks/{task_id}` 的 API 响应**，不得依赖：
- 本地存储的缓存状态
- WebSocket 推送的中间态数据（仅用于进度更新，不可用于路由决策）
- URL 参数或查询字符串中的状态标记

### 9.4 SLA 倒计时的展示约束

- SLA 倒计时（P07 中展示）**仅为视觉提示**，前端本地计算剩余时间
- SLA 超期后的催办通知由后端执行，前端不得模拟或发送催办
- 前端仅展示 `sla_deadline` 换算后的"剩余 X 分钟"，不参与任何 SLA 业务逻辑

---

*本文档由前端架构规划 Teammate 1 输出，仅描述页面结构与路由规范，不包含具体的前端技术框架选型、组件代码实现或样式细节（由后续实施阶段输出）。*
