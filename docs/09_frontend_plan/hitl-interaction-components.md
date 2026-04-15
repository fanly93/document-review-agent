# P05 HITL 人工审核交互组件规范 v1.0

**阶段**：09_frontend_plan  
**输出方**：Teammate 3 — 前端规划  
**日期**：2026-04-15  
**版本**：v1.0  
**依据文档**：
- `docs/06_system_architecture/frontend-design-spec-v1.0.md`（P05 页面结构）
- `docs/04_interaction_design/langchain-hitl-arch-spec-v1.0.md`（HITL 工作流）
- `docs/06_system_architecture/data-model-spec-v1.0.md`（数据模型）
- `docs/08_api_spec/fastapi-spec-v1.0.md`（API 规范）
- `docs/06_system_architecture/frontend-backend-boundary-spec.md`（前后端边界）

---

## 一、组件全景概览

### 1.1 P05 页面组件清单

| 组件ID | 组件名 | 所在页面 | 功能定位 | 状态机/乐观更新 |
|--------|--------|---------|---------|----------------|
| C1 | `HumanReviewToolbar` | P05 顶部 | 文档信息、进度计数、完成/驳回操作 | 进度数字由组件内部维护 |
| C2 | `PDFViewer` | P05 左侧（60%） | PDF 渲染、叠加高亮、翻页缩放 | 视图状态（缩放、页码） |
| C3 | `OperationButtonGroup` | P05 右侧风险条目内 | approve/edit/reject/annotate 四类操作 | `reviewer_status` 乐观更新 |
| C4 | `RejectTaskModal` | P05 弹窗层 | 整体任务驳回确认 | 提交后关闭，跳转 P07 |
| C5 | `EditFormModal` | P05 弹窗层 | 编辑风险等级、描述、推理说明 | 提交后关闭，更新列表 |
| C6 | `AuditLogPanel` | P07 任务详情页 | 展示全量操作历史（只读） | 分页加载，无状态变更 |

---

## 二、C1：HumanReviewToolbar（顶部工具栏）

### 2.1 所在页面与定位

- **页面**：P05（人工审核 HITL 页）
- **位置**：页面顶部，`ReviewPanel` 上方
- **高度**：约 60–80px，包含文档名、风险评分、进度计数、操作按钮

### 2.2 功能描述

HumanReviewToolbar 展示审核过程的关键信息和操作入口：
1. **文档名称**（只读）：当前审核的文档文件名
2. **整体风险评分**（只读）：来自 `ReviewResult.overall_risk_score`，0–100 数字 + 等级标签
3. **处理进度计数**：显示"已处理 N / 总 M 条"，其中 M 为 Critical 和 High 风险条目总数，N 为已处理数
4. **完成审核按钮**：启用条件为所有 Critical/High 条目均已处理（详见 §四）
5. **整体任务驳回按钮**：触发 RejectTaskModal

### 2.3 数据来源

| 字段 | 数据来源 | 说明 |
|------|---------|------|
| `filename` | `Document.original_filename` | `GET /api/v1/tasks/{taskId}` 响应中 |
| `overall_risk_score` | `ReviewResult.overall_risk_score` | P05 初始加载时获取 |
| `critical_count` | `ReviewResult.critical_count` | 初始加载 |
| `high_count` | `ReviewResult.high_count` | 初始加载 |
| `reviewed_count` | 前端本地维护 | 统计 `reviewer_status != pending` 的 Critical+High 条目数 |

### 2.4 交互规则

#### 进度计数逻辑

```
初始化时：
  1. 获取全量 RiskItem 列表 → GET /api/v1/tasks/{taskId}/risk-items
  2. 统计 risk_level IN (critical, high) 的条目总数 → total_critical_high
  3. 统计其中 reviewer_status != pending 的条目数 → processed_count
  4. 展示"已处理 {processed_count} / 总 {total_critical_high} 条"

每次操作后（approve/edit/reject_item）：
  1. 前端接收后端响应中的 reviewer_status 更新
  2. 若该条目为 Critical 或 High，processed_count += 1（或 -= 1 if 状态变为 pending）
  3. 重新计算进度数字并刷新显示
  4. 检测 processed_count == total_critical_high → 解锁"完成审核"按钮
```

#### 完成审核按钮启用条件

按钮启用的**充要条件**：
- `processed_count == total_critical_high && total_critical_high > 0`

**启用流程**：
1. 初始化 RiskItem 列表时，计算上述两个变量
2. 每次风险条目操作返回后，更新计数
3. 若条件满足，将按钮从 `disabled` 切换为 `enabled` 状态
4. 用户点击"完成审核"时，前端**必须**再次向后端发送 `POST /api/v1/tasks/{taskId}/complete`
5. 后端进行最终校验（Critical/High 全处理），前端**不可绕过后端校验**

> **重点约束**：完成审核按钮的启用是**前端快速反馈**，最终的完成权限控制由后端执行。前端本地计数可能与后端状态不一致（如并发操作场景），后端返回 422 错误时前端应展示"存在未处理的高风险条目"提示。

#### 整体任务驳回按钮

点击后触发 RejectTaskModal（见 §四）。

### 2.5 UI 状态定义

```typescript
// 按钮状态枚举
enum CompleteButtonState {
  DISABLED = "disabled",     // 仍有 Critical/High 条目未处理
  ENABLED = "enabled",       // 全部已处理，可点击
  LOADING = "loading",       // 提交中
  ERROR = "error"            // 后端返回 422（未处理条目清单）
}

// 工具栏数据状态
interface ToolbarState {
  filename: string;
  overall_risk_score: number;
  risk_level_label: "critical" | "high" | "medium" | "low";
  total_critical_high: number;
  processed_count: number;
  complete_button_state: CompleteButtonState;
  reject_button_loading: boolean;
}
```

### 2.6 关键约束

1. **文档名称和风险评分为只读**，不可编辑
2. **进度计数必须同步**：每次操作返回后立即更新，保持与右侧列表状态一致
3. **完成审核按钮禁止硬编码启用逻辑**：必须基于动态计数，不能依赖固定时间或操作次数
4. **后端二次校验**：即使前端计数满足条件，后端仍会再次校验，前端需处理 422 错误响应

---

## 三、C2：PDFViewer（PDF 渲染与高亮定位组件）

### 3.1 所在页面与定位

- **页面**：P05（人工审核 HITL 页）
- **位置**：左侧面板（占总宽度 60%）
- **技术基础**：PDF.js 库（Mozilla 官方，支持 npm 集成）

### 3.2 功能描述

PDFViewer 负责：
1. 加载并渲染 PDF 文件内容
2. 在 Canvas 叠加层上绘制高亮矩形（不修改 PDF 原始内容）
3. 提供缩放和翻页控件
4. 响应右侧风险条目点击，自动定位到对应页码和段落

### 3.3 数据来源

| 字段 | 来源 API | 说明 |
|------|---------|------|
| PDF 文件二进制 | `GET /api/v1/tasks/{taskId}/document` | 返回 PDF 文件（Content-Type: application/pdf） |
| 高亮坐标（页码+段落） | `GET /api/v1/tasks/{taskId}/risk-items` 响应中的 `location_page`、`location_paragraph` | 后端提供的定位信息 |
| 高亮颜色映射 | 根据 `risk_level` 字段 | 由前端规定的颜色常数 |

### 3.4 高亮颜色与风险等级映射

| `risk_level` | 高亮颜色 | RGB / Hex | 透明度 |
|------------|---------|-----------|--------|
| `critical` | 红色 | `#FF4444` 或 `rgb(255, 68, 68)` | 0.3 |
| `high` | 橙色 | `#FF9944` 或 `rgb(255, 153, 68)` | 0.3 |
| `medium` | 黄色 | `#FFCC44` 或 `rgb(255, 204, 68)` | 0.3 |
| `low` | 蓝色 | `#4488FF` 或 `rgb(68, 136, 255)` | 0.3 |
| `info` | 灰色 | `#AAAAAA` 或 `rgb(170, 170, 170)` | 0.3 |

> 透明度 0.3 是为了保持 PDF 原文本可读性。

### 3.5 交互规则

#### 初始化流程

```
1. P05 页面加载时：
   - 调用 GET /api/v1/tasks/{taskId}/document → 获取 PDF 二进制
   - 调用 GET /api/v1/tasks/{taskId}/risk-items → 获取高亮坐标列表
   
2. PDF.js 初始化：
   - 加载 PDF 文件到内存
   - 渲染第 1 页到 Canvas
   - 在高亮层上绘制所有该页的风险条目高亮矩形
   
3. 事件监听：
   - 监听右侧 ReviewPanel 的"条目点击"事件
   - 监听用户翻页和缩放操作
```

#### 定位与高亮交互

```
当用户在右侧风险列表点击某条目时：
  1. 前端获取该条目的 location_page 和 location_paragraph
  2. 调用 PDF.js API 跳转至该页：pdf.pdfViewer.currentPageNumber = location_page
  3. 在高亮层上根据 location_paragraph 计算像素坐标
  4. 绘制与 risk_level 对应颜色的高亮矩形
  5. （可选）在该矩形旁标注"第 N 条"标记
```

> **坐标说明**：`location_paragraph` 是段落索引（从 0 开始），前端需将其映射为像素坐标。  
> **MVP 精度**：段落级精度（整个段落高亮），不是句子级；`location_sentence_id` 字段留作 V1+ 预留。

#### 缩放和翻页控件

```
UI 元素：
- 缩放按钮：[放大 +] [缩小 -] [适应宽度] [适应页面]
- 翻页控件：[上一页 <] [当前页码显示] [下一页 >]
  或配合 PDF.js 自带的翻页手势

交互规则：
- 缩放改变不影响高亮位置（需要重新计算像素坐标）
- 翻页时检查目标页是否有高亮条目，有则自动渲染高亮
- 页码显示支持输入框快速跳转：用户输入页码 → 回车跳转
```

### 3.6 关键约束

1. **高亮为叠加层，不修改 PDF**：使用 Canvas 叠加，PDF 原始内容保持不变
2. **坐标由后端提供**：前端严格按照 `location_page` 和 `location_paragraph` 定位，不自行推算
3. **颜色映射静态化**：颜色常数定义在前端，不从后端动态读取
4. **异步加载处理**：PDF 大文件加载期间需展示加载态（Loading Spinner）
5. **错误处理**：PDF 加载失败时展示友好错误信息和重试按钮

---

## 四、C3：OperationButtonGroup（审核操作按钮组）

### 4.1 所在页面与定位

- **页面**：P05（人工审核 HITL 页）
- **位置**：右侧 ReviewPanel 中每条风险条目卡片的底部
- **按钮数量**：4 个独立操作，可排列为水平行或折叠菜单

### 4.2 四类操作详细规范

#### 4.2.1 操作 A：approve（同意）

**定义**：人工审核人同意 AI 的风险评定结论，不做任何修改。

**UI 状态**：
```
当 reviewer_status = "pending" 时：
  - 按钮文案："同意"
  - 按钮状态：enabled
  - 按钮样式：主色调（蓝色或品牌色）

当 reviewer_status = "approved" 时：
  - 按钮文案："已同意" 或 显示 ✓ 符号
  - 按钮状态：disabled（灰显）
  - 按钮样式：禁用样式，展示成功态
```

**操作流程**：
```
1. 用户点击"同意"按钮
2. 前端【乐观更新】：
   - 修改该条目的 reviewer_status 为 "approved"
   - 立即切换按钮为"已同意"（灰显）
   - 通知 HumanReviewToolbar 更新进度计数
3. 前端异步发送 API 请求：
   POST /api/v1/tasks/{taskId}/operations
   {
     "risk_item_id": "xxx",
     "action": "approve",
     "operated_at": "ISO 8601 时间戳"
   }
4. 后端处理：
   - 校验任务状态为 human_reviewing
   - 校验请求人为 assigned_reviewer_id
   - 更新 RiskItem.reviewer_status = "approved"
   - 写入 HumanReviewOperation 记录
   - 写入 AuditLog
   - 返回 200 + updated reviewer_status
5. 前端收到响应：
   - 若状态与本地乐观更新一致，保持显示无变化
   - 若不一致，以后端返回为准，重新渲染
```

**关键约束**：
- approve 操作不弹窗，直接执行
- 后端需做权限校验（当前用户 = assigned_reviewer_id）

---

#### 4.2.2 操作 B：edit（编辑）

**定义**：人工审核人修改风险等级、风险描述或 AI 推理说明，记录完整 diff。

**可编辑字段**：
```
✓ risk_level：从 5 档选择（critical → high → medium → low → info）
✓ risk_description：自由文本，可修改 AI 生成的描述
✓ reasoning：自由文本，当 confidence_category="legal" 时必填
```

**只读字段**（弹窗中展示但禁用）：
```
✗ risk_type：不可修改（由 AI 识别）
✗ confidence_score：不可修改（由 AI 计算）
✗ location_page / location_paragraph：不可修改（文档定位）
```

**UI 状态**：
```
当 reviewer_status IN ("pending", "approved") 时：
  - 按钮文案："编辑"
  - 按钮状态：enabled
  - 按钮样式：次要色（灰色或中性色）

当 reviewer_status = "edited" 时：
  - 按钮文案："已编辑"
  - 按钮状态：enabled（仍可再次编辑）
  - 按钮样式：信息态
```

**操作流程**：
```
1. 用户点击"编辑"按钮
2. 弹出 EditFormModal（见 §五）
3. 用户修改字段 → 点击保存
4. 前端【乐观更新】：
   - 修改 reviewer_status 为 "edited"
   - 保存编辑内容到本地
5. 前端异步发送 API 请求：
   POST /api/v1/tasks/{taskId}/operations
   {
     "risk_item_id": "xxx",
     "action": "edit",
     "edited_fields": {
       "risk_level": "medium",
       "risk_description": "修改后的描述",
       "reasoning": "修改后的推理"
     },
     "operated_at": "ISO 8601 时间戳"
   }
6. 后端处理：
   - 校验 edited_fields 中仅包含三个允许字段
   - 更新 RiskItem 对应字段
   - 写入 EditRecord 记录（记录 original_value 和 new_value）
   - 更新 reviewer_status = "edited"
   - 返回 200 + updated RiskItem
7. 前端收到响应：
   - 若返回成功，关闭 EditFormModal，刷新条目显示（展示编辑后内容 + "已编辑"徽章）
   - 若后端返回冲突（如字段不合法），展示错误提示
```

**关键约束**：
- 编辑操作可进行多次（reviewer_status 为 "edited" 后仍可再次编辑）
- 编辑后的 diff 需在操作历史中展示（AuditLogPanel 中显示 before → after）
- 必须记录 5 个审计字段：edited_field、original_value、new_value、operator_id、operated_at

---

#### 4.2.3 操作 C：reject_item（单条驳回）

**定义**：人工审核人认为该风险项为 AI 误报，提交驳回理由后该条目标记为已处理。

**UI 状态**：
```
当 reviewer_status = "pending" 时：
  - 按钮文案："驳回"
  - 按钮状态：enabled
  - 按钮样式：危险色（红色或警告色）

当 reviewer_status = "reviewer_rejected" 时：
  - 按钮文案："已驳回"
  - 按钮状态：disabled（灰显）
  - 按钮样式：禁用样式，展示驳回态
```

**操作流程**：
```
1. 用户点击"驳回"按钮
2. 弹出驳回理由输入框：
   - 占位符文本："请输入驳回理由（至少 10 个字符）"
   - 字数计数器：显示"当前 X / 最少 10 字符"
   - 当字数 < 10 时，"确认驳回"按钮为 disabled
   - 当字数 ≥ 10 时，"确认驳回"按钮变为 enabled
3. 用户输入理由 + 点击"确认驳回"
4. 前端【乐观更新】：
   - 修改 reviewer_status 为 "reviewer_rejected"
   - 切换按钮为"已驳回"（灰显）
5. 前端异步发送 API 请求：
   POST /api/v1/tasks/{taskId}/operations
   {
     "risk_item_id": "xxx",
     "action": "reject_item",
     "reject_reason": "此条款……",
     "operated_at": "ISO 8601 时间戳"
   }
6. 后端处理：
   - 校验 reject_reason.length() >= 10（前端校验不可替代）
   - 更新 RiskItem.reviewer_status = "reviewer_rejected"
   - 写入 HumanReviewOperation（action=reject_item, reject_reason）
   - 写入 AuditLog
   - 返回 200
7. 前端收到响应：
   - 若返回成功，关闭驳回弹窗，刷新条目显示
   - 若返回 400（理由不足），展示"驳回理由至少 10 个字符"提示
```

**关键约束**：
- 前端本地校验字数（≥10），禁用提交按钮
- 后端仍需二次校验，前端不可绕过
- 驳回理由必须持久化到数据库（用于审计）

---

#### 4.2.4 操作 D：annotate（批注）

**定义**：人工审核人添加批注（备注），**不改变条目的 reviewer_status**。批注是独立的补充意见，可多次添加。

**UI 状态**：
```
无论 reviewer_status 为何值，按钮状态始终 enabled：
  - 按钮文案："批注"
  - 按钮样式：普通按钮（灰色或中性色）
```

**操作流程**：
```
1. 用户点击"批注"按钮
2. 弹出批注输入框弹窗（AnnotationModal）：
   - 文本域，占位符："此条款需要与总协议核对……"
   - "保存"和"取消"按钮
3. 用户输入批注内容 → 点击"保存"
4. 前端【乐观更新】：
   - 在条目下方或侧边展示"批注：xxx"
   - 但【不改变】reviewer_status 或其他审核状态
5. 前端异步发送 API 请求：
   POST /api/v1/tasks/{taskId}/annotations
   {
     "risk_item_id": "xxx",
     "content": "批注文本内容"
   }
6. 后端处理：
   - 写入 Annotation 表（包含 operator_id, created_at）
   - 返回 201（创建成功）
7. 前端收到响应：
   - 关闭弹窗，刷新条目显示，在批注区域显示新批注 + 创建时间 + 操作人名字
```

**关键约束**：
- 批注操作与其他 approve/edit/reject 操作独立，互不影响
- 批注**不计入**"完成审核"的处理条件（不影响进度计数）
- 可多次添加批注（MVP 版本支持，但单条目单人单次逻辑后续明确）
- 批注不消耗审核时间（SLA 计算不受影响）

---

### 4.3 数据来源

| 字段 | 来源 | 说明 |
|------|------|------|
| `risk_item_id` | RiskItem 列表 | GET /api/v1/tasks/{taskId}/risk-items |
| `reviewer_status` | RiskItem.reviewer_status | 初始加载 + 每次操作后的响应 |
| `risk_level` | RiskItem.risk_level | 用于编辑时的下拉选项 |
| `risk_description` | RiskItem.risk_description | 用于编辑时的文本域 |
| `reasoning` | RiskItem.reasoning | 用于编辑时的文本域 |
| `confidence_category` | RiskItem.confidence_category | 在 EditFormModal 中作为只读展示 |

### 4.4 关键约束

1. **状态转换规则**（reviewer_status 字段）：
   - `pending` → `approved`（点击同意）
   - `pending` → `edited`（点击编辑 → 保存）
   - `pending` → `reviewer_rejected`（点击驳回）
   - `approved` → `edited`（从已同意状态再次编辑）
   - **不可逆向**：一旦转为 approved/edited/rejected，不可变回 pending

2. **乐观更新策略**：
   - 操作点击后立即更新 UI（不等待后端响应），给用户快速反馈
   - 后端响应失败时恢复原状态，展示错误提示
   - 避免闪烁：若后端响应与乐观更新一致，UI 保持不变

3. **并发操作**：
   - 同一条目在多个窗口/标签页修改时，后端以最后一次提交为准
   - 前端应显示"该条目已被其他人修改"的警告

4. **完成审核进度计算**：
   - 进度计数仅包含 `risk_level IN (critical, high)` 的条目
   - 条目转换为 `approved`、`edited`、`reviewer_rejected` 任意一个，即认为已处理
   - 条目保持 `pending` 则认为未处理

---

## 五、C4：RejectTaskModal（整体任务驳回确认弹窗）

### 5.1 所在页面与定位

- **页面**：P05（人工审核 HITL 页）
- **触发方式**：点击 HumanReviewToolbar 中的"整体任务驳回"按钮
- **弹窗类型**：模态弹窗（覆盖背景，无法关闭背景点击）

### 5.2 功能描述

整体任务驳回弹窗用于收集审核人对整个任务的驳回理由。驳回是**终态操作**，任务一旦驳回不可恢复，因此需要二次确认机制。

### 5.3 UI 结构

```
┌─────────────────────────────────────────┐
│ 整体驳回任务                          [×] │
├─────────────────────────────────────────┤
│                                         │
│ 您确认要驳回此任务吗？                  │
│ 驳回后该任务进入终态（rejected），     │
│ 无法继续审核，需要重新上传文档。       │
│                                         │
│ 驳回理由（必填，至少 20 字符）：       │
│ ┌─────────────────────────────────────┐ │
│ │ 文档内容与……                        │ │
│ │ （当前 47 / 最少 20 字符）          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│         [取消]  [确认驳回]（disabled）   │
└─────────────────────────────────────────┘
```

### 5.4 交互规则

**输入验证**：
```
用户输入理由时：
  1. 实时检测字数：current_length = input.value.length
  2. 显示字数计数器："当前 X / 最少 20 字符"
  3. 若 current_length < 20：
     - "确认驳回"按钮为 disabled（灰显）
     - 按钮文案提示"请输入至少 20 个字符的驳回理由"
  4. 若 current_length >= 20：
     - "确认驳回"按钮变为 enabled（可点击）
     - 按钮样式：危险色（红色），表示确认后不可恢复
```

**提交流程**：
```
1. 用户输入足够的理由 + 点击"确认驳回"
2. 弹窗进入提交状态：
   - "确认驳回"按钮变为 loading 态（显示 spinner，禁止再次点击）
   - 文本域禁用，不可再编辑
3. 前端异步发送 API 请求：
   POST /api/v1/tasks/{taskId}/reject
   {
     "reject_reason": "文档内容与……（不少于 20 字符）"
   }
4. 后端处理：
   - 校验状态非终态（若已是终态则返回 409）
   - 校验 reject_reason.length() >= 20（前端校验不可替代）
   - 写入 HumanReviewOperation（action=reject_task）
   - 更新 ReviewTask.status = "rejected"
   - 写入 AuditLog
   - 通过 WebSocket 推送 task_rejected 事件
   - 返回 200
5. 前端收到响应：
   - 若返回 200：
     * 关闭弹窗
     * 显示成功提示："任务已驳回"（Toast）
     * 立即跳转至 P07（任务详情页），展示 `rejected` 终态标签
   - 若返回 400/422（理由不足或状态冲突）：
     * 弹窗保持打开，恢复"确认驳回"按钮为 enabled
     * 显示错误提示（Toast 或弹窗内提示）
```

**关键约束**：
- 驳回理由最少 20 字符（前端本地校验 + 后端二次校验）
- 驳回为终态操作，任务不可恢复，必须有二次确认
- 用户可以点击"取消"关闭弹窗，返回 P05 页面
- 不允许空白或纯空格的理由

### 5.5 数据来源

| 字段 | 来源 | 说明 |
|------|------|------|
| `taskId` | URL 路由参数 | 从 P05 页面 URL：/tasks/{taskId}/human-review |

---

## 六、C5：EditFormModal（风险条目编辑表单弹窗）

### 6.1 所在页面与定位

- **页面**：P05（人工审核 HITL 页）
- **触发方式**：点击风险条目中的"编辑"按钮（OperationButtonGroup）
- **弹窗类型**：模态弹窗，包含表单和 diff 展示

### 6.2 功能描述

编辑表单弹窗为审核人提供修改 AI 自动审核结果的界面。用户可修改风险等级、风险描述和推理说明，并在提交前预览修改内容（diff）。

### 6.3 UI 结构

```
┌──────────────────────────────────────────────────┐
│ 编辑风险条目                                  [×] │
├──────────────────────────────────────────────────┤
│ 【只读信息区】                                   │
│                                                  │
│ 风险类型：法律合规风险                          │
│ 置信度：75%（clause 类别）                      │
│ 源文本定位：第 3 页，第 12 段                   │
│                                                  │
├──────────────────────────────────────────────────┤
│ 【可编辑区域】                                   │
│                                                  │
│ 风险等级：┌─────────────────────────┐          │
│          │ ▼ critical ▼            │ (下拉)   │
│          └─────────────────────────┘          │
│                                                  │
│ 风险描述：┌──────────────────────────────────┐ │
│          │ AI 生成的风险描述文本……     │ │
│          │                            │ │
│          └──────────────────────────────────┘ │
│ （可编辑）                                       │
│                                                  │
│ 推理说明（若 legal 类别）：                     │
│          ┌──────────────────────────────────┐ │
│          │ 该条款风险等级……        │ │
│          │                            │ │
│          └──────────────────────────────────┘ │
│ （可编辑，legal 类别时必填）                     │
│                                                  │
├──────────────────────────────────────────────────┤
│ 【预览修改】（可选，提交前展示 diff）            │
│                                                  │
│ 风险等级：critical → high                       │
│ 风险描述：[原] 文本1 → [新] 文本2               │
│                                                  │
├──────────────────────────────────────────────────┤
│              [取消]  [保存修改]（enabled）       │
└──────────────────────────────────────────────────┘
```

### 6.4 字段定义

#### 可编辑字段

| 字段名 | 类型 | 输入控件 | 验证规则 | 说明 |
|--------|------|---------|---------|------|
| `risk_level` | ENUM | 下拉选择 | 必选 | 5 档选择：critical / high / medium / low / info |
| `risk_description` | TEXT | 多行文本域 | 可选（留空则使用 AI 原描述） | 自由编辑，用户可修改 AI 生成的描述 |
| `reasoning` | TEXT | 多行文本域 | `confidence_category="legal"` 时必填 | 低置信度风险必须提供推理说明 |

#### 只读字段（禁用样式）

| 字段名 | 类型 | 显示方式 | 说明 |
|--------|------|---------|------|
| `risk_type` | STRING | 纯文本（禁用） | 不允许修改，由 AI 识别 |
| `confidence_score` | FLOAT | 纯文本（禁用） | 显示为"XX%"，不允许修改 |
| `confidence_category` | ENUM | 纯文本（禁用） | 显示为 fact / clause / legal，不允许修改 |
| `location_page` | INT | 纯文本（禁用） | 显示为"第 X 页"，不允许修改 |
| `location_paragraph` | INT | 纯文本（禁用） | 显示为"第 Y 段"，不允许修改 |

### 6.5 交互规则

#### 初始化与加载

```
1. 用户在 P05 点击某条目的"编辑"按钮
2. 弹窗打开，异步加载该 RiskItem 的完整数据：
   - 若数据已在列表中，直接使用
   - 否则发送 GET /api/v1/tasks/{taskId}/risk-items?risk_item_id=xxx
3. 弹窗填充字段：
   - 可编辑区域：risk_level、risk_description、reasoning 取当前值
   - 只读区域：risk_type、confidence_score、location_page 等取当前值
   - 若 confidence_category != "legal"，reasoning 字段隐藏或显示为不适用
```

#### 编辑与验证

```
用户修改字段时：
  1. 实时校验：
     - risk_level：必须选择（下拉自动有默认值）
     - reasoning：若 confidence_category="legal" 且文本域有焦点离开时，检查是否为空
       * 为空 → 提示"推理说明必填"，但不禁用保存
     
  2. diff 预览（可选）：
     - 用户修改任何字段后，弹窗下方自动出现"修改预览"面板
     - 展示原值 → 新值的对比
     - 格式：字段名：[原] xxx → [新] yyy
```

#### 提交与保存

```
1. 用户点击"保存修改"按钮
2. 前端本地校验：
   - 若 confidence_category="legal" 且 reasoning 为空 → 提示"推理说明必填"，禁止提交
   - 否则通过校验
3. 弹窗进入提交状态：
   - "保存修改"按钮变为 loading 态
   - 所有输入框禁用
4. 前端异步发送 API 请求：
   POST /api/v1/tasks/{taskId}/operations
   {
     "risk_item_id": "xxx",
     "action": "edit",
     "edited_fields": {
       "risk_level": "high",
       "risk_description": "修改后的描述（如果有修改）",
       "reasoning": "修改后的推理（如果有修改）"
     },
     "operated_at": "ISO 8601 时间戳"
   }
5. 后端处理：
   - 校验 edited_fields 中仅包含允许的三个字段
   - 记录原值（从数据库读取）和新值（请求中的值）
   - 写入 EditRecord 表：
     * edited_field：字段名（risk_level / risk_description / reasoning）
     * original_value：修改前的值
     * new_value：修改后的值
     * operator_id：操作人 ID
     * operated_at：操作时间（从前端请求中取）
   - 更新 RiskItem 对应字段
   - 更新 reviewer_status = "edited"
   - 返回 200
6. 前端收到响应：
   - 关闭弹窗
   - 刷新右侧 ReviewPanel 中该条目的显示，展示编辑后内容 + "已编辑"徽章
   - 通知 HumanReviewToolbar 更新进度计数
```

**取消编辑**：
```
用户点击"取消"按钮：
  - 关闭弹窗，不保存任何修改
  - 条目 reviewer_status 保持不变
```

### 6.6 关键约束

1. **不可编辑 AI 原始字段**：risk_type、confidence_score、location_* 严禁修改
2. **推理说明（reasoning）二级必填规则**：
   - 仅当 confidence_category="legal" 时，reasoning 为必填
   - 其他类别可选
3. **Diff 审计记录**：
   - 后端必须记录 EditRecord，包含所有 5 个审计字段
   - 前端在操作历史中展示 original_value → new_value 对比
4. **可多次编辑**：reviewer_status 为 "edited" 后仍可再次点击"编辑"按钮进行修改

---

## 七、C6：AuditLogPanel（审计日志折叠区）

### 7.1 所在页面与定位

- **页面**：P07（任务详情页）
- **位置**：页面底部，状态流转时间线下方
- **展示方式**：折叠面板（Accordion），点击展开查看全量日志

### 7.2 功能描述

AuditLogPanel 以只读方式展示整个审核任务从上传到完成（或驳回）的完整操作历史和状态变更记录，支持分页加载。

### 7.3 数据来源

| 字段 | 数据来源 | 说明 |
|------|---------|------|
| 审计日志列表 | `GET /api/v1/tasks/{taskId}/audit-logs` | 后端返回分页数据 |
| 分页参数 | 前端控制 | page=1, page_size=20（可配置） |

### 7.4 日志条目结构

每条审计日志记录包含以下信息：

```json
{
  "event_id": "event-uuid-xxxx",
  "task_id": "task-uuid-xxxx",
  "event_type": "task_status_change | human_action | vector_db_bind",
  "actor_id": "user-uuid-xxxx",
  "actor_name": "李律师",
  "actor_role": "reviewer",
  "detail": {
    "action": "approve",
    "risk_item_id": "risk-uuid-xxxx",
    "old_value": null,
    "new_value": "approved",
    "fields_changed": { }
  },
  "occurred_at": "2026-04-15T11:05:00+08:00"
}
```

### 7.5 事件类型分类与展示

| 事件类型 | 触发时机 | 展示格式 | 示例 |
|---------|---------|---------|------|
| `task_status_change` | 任务状态转移 | **[状态变更]** 旧状态 → 新状态（系统操作） | **[状态变更]** auto_reviewing → human_reviewing（系统操作）于 11:05 |
| `human_action` | 人工操作 | **[人工操作]** 操作类型 by 操作人 at 时间 | **[人工操作]** approve（同意） by 李律师 at 11:05 |
| `human_action` (edit) | 编辑操作 | 展示 diff（original → new） | **[人工操作]** 编辑风险条目 by 李律师 at 11:05<br/>  • risk_level: critical → high<br/>  • risk_description: [原文] → [新文] |
| `human_action` (reject) | 驳回操作 | 显示驳回理由 | **[人工操作]** 驳回风险项 by 李律师 at 11:05<br/>  驳回理由：此条款……（不少于 10 字符） |
| `vector_db_bind` | 向量库版本绑定 | **[系统操作]** 绑定向量库版本 | **[系统操作]** 绑定向量库版本 v1.2.3 于 10:30 |

### 7.6 UI 结构

```
┌────────────────────────────────────────────────────────┐
│ ▼ 审计日志（共 47 条）                                 │
├────────────────────────────────────────────────────────┤
│                                                        │
│ 【第 1 页，共 3 页】                                    │
│                                                        │
│ • [状态变更] auto_reviewed → human_reviewing           │
│   系统操作，2026-04-15 11:00:00                        │
│                                                        │
│ • [人工操作] approve（同意风险项 1）                   │
│   李律师，2026-04-15 11:05:00                          │
│                                                        │
│ • [人工操作] 编辑风险项 2                               │
│   王律师，2026-04-15 11:10:00                          │
│   修改内容：                                           │
│     • risk_level: critical → high                      │
│     • reasoning: [原] → [新]                          │
│                                                        │
│ • [人工操作] reject_item（驳回风险项 3）               │
│   李律师，2026-04-15 11:15:00                          │
│   驳回理由：此条款的约束力与……                        │
│                                                        │
│ • [人工操作] annotate（添加批注）                      │
│   李律师，2026-04-15 11:20:00                          │
│   批注内容：需要与甲方……                              │
│                                                        │
│ ...（更多日志）...                                    │
│                                                        │
│ ◄ 上一页  [1] [2] [3]  下一页 ►                       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 7.7 交互规则

#### 初始化与加载

```
P07 页面加载时：
  1. 如果用户展开审计日志面板，异步加载：
     GET /api/v1/tasks/{taskId}/audit-logs?page=1&page_size=20
  2. 后端返回分页数据：
     {
       "code": 0,
       "data": {
         "items": [...],
         "total": 47,
         "page": 1,
         "page_size": 20
       }
     }
  3. 前端渲染日志列表，展示分页控件
```

#### 分页加载

```
用户点击"下一页"或点击页码 [2]：
  1. 发送新请求：GET /api/v1/tasks/{taskId}/audit-logs?page=2&page_size=20
  2. 列表滚动到顶部，加载新页面的日志
  3. 分页控件更新，当前页高亮

点击"上一页"或具体页码的逻辑类似。
```

#### 日志详情展开

```
某些日志条目支持展开详情（如编辑操作的 diff）：
  - 默认折叠，显示摘要
  - 点击日志行可展开详细信息
  - 再次点击收起详情
```

### 7.8 关键约束

1. **只读展示**：AuditLogPanel 不支持任何编辑、删除操作
2. **不可变性**：审计日志由后端保证只追加，前端不可修改
3. **时间戳显示**：ISO 8601 格式，并支持本地时区转换（如显示"XX 分钟前"）
4. **敏感信息脱敏**（可选）：驳回理由和批注内容可完整展示，无脱敏需求
5. **分页默认大小**：每页 20 条，可配置（最大 100）

---

## 八、完成审核按钮启用逻辑（深度规范）

本章对 C1 组件中最复杂的"完成审核按钮启用条件"进行详细展开。

### 8.1 业务规则回顾

**法律要求**：所有 Critical 和 High 风险条目都必须由人工审核人做出明确的处理决策（approve/edit/reject_item），才允许审核流程结束。

**前后端职责划分**：
- **前端**：维护本地计数器，快速反馈按钮启用状态
- **后端**：最终权威校验，前端计数错误时返回 422 错误

### 8.2 前端本地计数器维护流程

#### 8.2.1 初始化

```
P05 页面加载时：
  1. 调用 GET /api/v1/tasks/{taskId}/risk-items
  2. 接收风险条目数组，逐条检查：
     
     total_critical_high_count = 0
     processed_critical_high_count = 0
     
     for each risk_item in response.data.items {
       if (risk_item.risk_level in ["critical", "high"]) {
         total_critical_high_count += 1
         if (risk_item.reviewer_status != "pending") {
           processed_critical_high_count += 1
         }
       }
     }
     
  3. 若 processed_critical_high_count == total_critical_high_count：
     - 启用"完成审核"按钮（enabled = true）
     - 按钮变为可点击态（主色调，无禁用样式）
  4. 否则：
     - 禁用"完成审核"按钮（enabled = false）
     - 按钮灰显，显示"完成审核（还需处理 N 条高风险项）"提示
```

#### 8.2.2 运行时更新

```
每次用户点击 approve / edit / reject_item 操作后：
  
  1. 前端【乐观更新】：
     - 修改本地风险条目的 reviewer_status
     - 根据新状态重新计算 processed_critical_high_count：
       
       if (risk_item.risk_level in ["critical", "high"]) {
         old_status = risk_item.reviewer_status  // 操作前的状态
         new_status = action_response.reviewer_status  // 操作后的状态
         
         if (old_status == "pending" && new_status != "pending") {
           processed_critical_high_count += 1
         } else if (old_status != "pending" && new_status == "pending") {
           processed_critical_high_count -= 1  // 理论上不会发生，但保险起见处理
         }
       }
     
  2. 检查启用条件：
     if (processed_critical_high_count == total_critical_high_count) {
       complete_button.enabled = true
       complete_button.style = "primary"  // 蓝色、可点击
       complete_button.tooltip = "所有高风险项已处理，点击以完成审核"
     } else {
       complete_button.enabled = false
       complete_button.style = "disabled"  // 灰显
       remaining = total_critical_high_count - processed_critical_high_count
       complete_button.tooltip = `还需处理 ${remaining} 条高风险项`
     }
```

### 8.3 点击完成审核按钮流程

#### 8.3.1 前端检查

```
用户点击"完成审核"按钮时：
  
  1. 前端再次检查本地计数器：
     if (processed_critical_high_count != total_critical_high_count) {
       // 本地计数错误（可能因为并发操作等原因）
       alert("发现计数不一致，请刷新页面重试");
       return;
     }
  
  2. 若本地检查通过，按钮进入 loading 态：
     complete_button.loading = true
     complete_button.disabled = true
```

#### 8.3.2 后端最终校验

```
后端接收 POST /api/v1/tasks/{taskId}/complete：
  
  1. 校验任务状态为 human_reviewing
  2. 校验请求人为 assigned_reviewer_id
  3. 【关键步骤】再次查询数据库：
     
     pending_count = SELECT COUNT(*) FROM risk_items
                     WHERE task_id = :task_id
                     AND risk_level IN ('critical', 'high')
                     AND reviewer_status = 'pending'
     
     if (pending_count > 0) {
       return 422 {
         "code": "CRITICAL_HIGH_NOT_ALL_HANDLED",
         "message": "仍有 N 条 Critical/High 风险项未处理",
         "data": {
           "pending_items": [...],  // 列表未处理项详情
           "pending_count": pending_count
         }
       }
     }
  
  4. 校验通过，触发 LangGraph Command(resume=...) 进入 finalize_node
  5. 返回 200 + completed_at
```

#### 8.3.3 前端处理后端响应

```
若后端返回 200：
  1. 关闭按钮 loading 态
  2. 显示成功提示："审核已完成"（Toast）
  3. 触发 WebSocket 连接，监听 task_completed 事件
  4. 收到事件后自动跳转 P04（审核结果页）

若后端返回 422（CRITICAL_HIGH_NOT_ALL_HANDLED）：
  1. 关闭按钮 loading 态
  2. 恢复按钮为 disabled 状态
  3. 重新计算本地计数器（可能有并发修改）
  4. 显示错误提示（模态弹窗）：
     "存在 N 条高风险项未处理，无法完成审核。
      请检查以下项目：
      - 风险项 1：xxxxx
      - 风险项 2：xxxxx
      ..."
  5. 列表自动滚动至未处理项，高亮显示
```

### 8.4 并发场景处理

```
场景：用户在 Tab 1 和 Tab 2 分别打开相同的 P05 页面，同时修改不同条目

解决方案：
  1. 前端计数器仅用于本地快速反馈，不与后端保持同步
  2. 用户点击"完成审核"时，后端执行最终校验
  3. 若后端返回 422，前端弹窗提示，用户可：
     a) 刷新页面，重新加载最新数据
     b) 关闭弹窗继续操作，处理剩余未处理项
```

### 8.5 防护措施总结

| 防护点 | 实施方式 | 说明 |
|--------|---------|------|
| 前端快速反馈 | 本地计数器维护按钮状态 | 提供即时 UX 反馈 |
| 后端最终权威 | 接收请求时再次查询数据库 | 确保不遗漏任何未处理项 |
| 并发冲突处理 | 返回 422 + 详细未处理项清单 | 用户可见冲突，手动解决 |
| 状态一致性 | 乐观更新 + 后端响应对账 | 本地状态与服务端保持一致 |

---

## 九、API 接口清单与对应关系

本章汇总所有 HITL 交互涉及的后端接口，以及各组件与 API 的对应关系。

### 9.1 HITL 核心接口

| 接口 | 方法 | 路径 | 对应组件 | 功能 | 状态 |
|------|------|------|---------|------|------|
| GetTask | GET | `/api/v1/tasks/{taskId}` | C1, ReviewPanel | 获取任务状态和概览信息 | ✓ 已定义 |
| GetRiskItems | GET | `/api/v1/tasks/{taskId}/risk-items` | C1, C3, ReviewPanel | 获取风险条目列表（含 reviewer_status） | ✓ 已定义 |
| GetDocument | GET | `/api/v1/tasks/{taskId}/document` | C2 | 获取 PDF 文件用于渲染 | **后端未开发** |
| ReviewOperation | POST | `/api/v1/tasks/{taskId}/operations` | C3, C5 | 提交 approve/edit/reject_item/annotate 操作 | ✓ 已定义 |
| CreateAnnotation | POST | `/api/v1/tasks/{taskId}/annotations` | C3 | 添加批注 | ✓ 已定义 |
| CompleteTask | POST | `/api/v1/tasks/{taskId}/complete` | C1 | 完成审核任务 | ✓ 已定义 |
| RejectTask | POST | `/api/v1/tasks/{taskId}/reject` | C4 | 整体驳回任务 | ✓ 已定义 |
| GetAuditLogs | GET | `/api/v1/tasks/{taskId}/audit-logs` | C6 | 获取审计日志（分页） | ✓ 已定义 |
| GetAnnotations | GET | `/api/v1/tasks/{taskId}/annotations` | C3 + 列表展示 | 获取批注列表 | ✓ 已定义 |

### 9.2 补充说明：后端未开发的接口

#### GetDocument 接口

**现状**：API 规范（fastapi-spec-v1.0.md）中未明确定义 PDF 文件获取接口。

**前端需求**：
```
GET /api/v1/tasks/{taskId}/document

响应：
  Content-Type: application/pdf
  Body: PDF 文件二进制内容
```

**建议后端实现方案**：
1. 返回 PDF 文件本身（Content-Type: application/pdf）
2. 或返回预签名 URL（前端通过 iframe 或 fetch 加载）

**前端暂行方案**：
- 若后端尚未实现，前端可使用 `GET /api/v1/tasks/{taskId}` 响应中的 `document_path` / `document_url` 字段
- 或在上传阶段已获取的 S3 预签名 URL 缓存使用

---

## 十、错误处理与提示规范

### 10.1 常见错误场景与前端处理

| 错误场景 | 后端返回 | 前端展示 | 用户操作 |
|---------|--------|---------|---------|
| 任务已完成（终态） | 409（TASK_STATUS_CONFLICT） | "该任务已完成，无法继续操作" | 返回 P07 |
| 权限不足（非 assigned_reviewer） | 403（FORBIDDEN） | "您无权操作此任务" | 跳转任务列表 |
| 驳回理由过短 | 422（REJECT_REASON_TOO_SHORT） | "驳回理由至少 N 个字符" | 返回弹窗，用户补充 |
| 高风险项未全处理 | 422（CRITICAL_HIGH_NOT_ALL_HANDLED） | "仍有 N 条高风险项未处理"（含列表） | 关闭弹窗，继续操作 |
| 编辑字段非法 | 422（INVALID_EDIT_FIELD） | "不支持修改该字段" | 关闭弹窗，重新编辑 |
| 服务器错误 | 500（INTERNAL_ERROR） | "系统异常，请稍后重试" | 重试或联系支持 |

### 10.2 Toast 和 Modal 的使用原则

**Toast**（右上角，3 秒自动消失）：
- 操作成功提示："已同意"、"批注已保存"
- 轻微错误提示："网络连接超时，请重试"

**Modal 弹窗**（阻断性，需用户确认）：
- 整体驳回确认（二次确认）
- 完成审核失败，高风险项清单展示
- 权限验证失败（无法继续）

---

## 十一、关键实现约束总结

### 11.1 必须遵守的约束

| 约束项 | 强制级别 | 说明 |
|--------|---------|------|
| 前端不执行 HITL 触发判断 | **强制** | HITL 触发只能由后端执行 |
| 完成审核必须后端校验 | **强制** | 前端计数仅为 UI 反馈，最终权限由后端执行 |
| PDF 坐标由后端提供 | **强制** | 前端不自行推算，严格按 location_page/location_paragraph 定位 |
| 编辑操作记录 5 个审计字段 | **强制** | EditRecord 必须包含 edited_field、original_value、new_value、operator_id、operated_at |
| 驳回理由长度后端二次校验 | **强制** | 前端校验不可替代后端校验 |
| 乐观更新 + 后端对账 | **推荐** | 提供快速 UX，同时保证数据一致性 |

### 11.2 禁止事项

- ❌ 前端自动填充"完成审核"按钮（按钮启用由后端规则驱动）
- ❌ 修改 AI 原始字段（risk_type、confidence_score、location_*）
- ❌ 跳过后端校验直接允许用户完成审核
- ❌ 在 P03 自动审核页展示部分审核结论
- ❌ 前端计数器与后端状态机强同步（可不一致，后端为权威）

---

## 十二、与其他文档的对应关系

| 本文档内容 | 上游文档 | 章节 |
|-----------|--------|------|
| P05 页面整体结构 | frontend-design-spec-v1.0.md | §P05 — 人工审核（HITL）页 |
| HITL 工作流与中断恢复 | langchain-hitl-arch-spec-v1.0.md | §三、§四、§五 |
| 数据模型：RiskItem、HumanReviewOperation、EditRecord、Annotation | data-model-spec-v1.0.md | §四（实体字段速查表） |
| 完成审核按钮启用条件 | frontend-design-spec-v1.0.md | §4.4（完成审核按钮的启用条件） |
| API 接口定义 | fastapi-spec-v1.0.md | §六（人工审核接口） |
| 前后端职责划分 | frontend-backend-boundary-spec.md | §二 / §三（前后端负责的功能） |

---

## 十三、附录：数据字段映射与转换

### 13.1 RiskItem 字段在各组件中的用途

| 字段 | C1 | C2 | C3 | C4 | C5 | C6 | 用途 |
|------|----|----|----|----|----|----|------|
| `id` | | | ✓ | | ✓ | | 操作目标识别 |
| `risk_level` | | ✓ | ✓ | | ✓ | ✓ | 颜色映射、编辑 |
| `risk_description` | | | ✓ | | ✓ | ✓ | 展示与编辑 |
| `risk_type` | | | | | ✓ | | 只读展示 |
| `confidence_score` | | | | | ✓ | | 只读展示 |
| `confidence_category` | | | | | ✓ | | 条件渲染（reasoning 必填） |
| `reasoning` | | | | | ✓ | | 编辑与展示 |
| `location_page` | | ✓ | ✓ | | | | PDF 定位 |
| `location_paragraph` | | ✓ | ✓ | | | | PDF 定位 |
| `reviewer_status` | ✓ | | ✓ | | | ✓ | 进度计数、按钮启用、状态渲染 |

### 13.2 风险等级到颜色的映射常数

```typescript
const RISK_LEVEL_COLOR_MAP = {
  "critical": { hex: "#FF4444", rgb: "rgb(255, 68, 68)", label: "严重", order: 1 },
  "high": { hex: "#FF9944", rgb: "rgb(255, 153, 68)", label: "高", order: 2 },
  "medium": { hex: "#FFCC44", rgb: "rgb(255, 204, 68)", label: "中等", order: 3 },
  "low": { hex: "#4488FF", rgb: "rgb(68, 136, 255)", label: "低", order: 4 },
  "info": { hex: "#AAAAAA", rgb: "rgb(170, 170, 170)", label: "信息", order: 5 }
};

const HIGHLIGHT_OPACITY = 0.3;  // 高亮透明度
```

---

*本文档规范了 P05 HITL 人工审核页面的 6 个核心 UI 组件的设计与交互规则，作为前端实现（React / Vue 等框架）的直接输入。所有组件实现须严格遵守前后端边界约束，确保业务规则执行安全性和审计完整性。*
