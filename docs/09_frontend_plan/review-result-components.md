# 审核结果页和HITL页组件规范 v1.0

**阶段**：09_frontend_plan  
**角色**：前端规划 Teammate 2  
**日期**：2026-04-15  
**版本**：v1.0  
**依据文档**：
- `docs/06_system_architecture/frontend-design-spec-v1.0.md`（P04/P05 详细结构）
- `docs/06_system_architecture/data-model-spec-v1.0.md`（数据模型）
- `docs/08_api_spec/fastapi-spec-v1.0.md`（API接口规范）
- `docs/06_system_architecture/frontend-backend-boundary-spec.md`（前后端边界）

---

## 一、组件总体清单

本文档覆盖法律文档审核系统中，**审核结果总览页（P04）** 和 **人工审核HITL页（P05）** 右侧面板中展示的6个核心组件，用于展示审核规则命中项（RiskItem）、解释性字段、审核结果统计等内容。

| 组件名 | 所在页面 | 功能域 | 依赖数据模型 |
|-------|---------|--------|-----------|
| `RiskScorePanel` | P04、P05 | 整体风险评分仪表盘 | `ReviewResult` |
| `RiskCategoryBoard` | P04、P05 | 分类风险看板（按等级统计） | `ReviewResult` |
| `RiskItemList` | P04、P05 | 可过滤/排序的风险条目列表 | `RiskItem[]` |
| `RiskItemDetail` | P04、P05 | 单条风险项详情展开区 | `RiskItem` + `SourceReference[]` |
| `FactExtractionPanel` | P04、P05（侧边栏） | 结构化事实字段展示 | `ClauseExtraction` |
| `SourceReferencePanel` | P04、P05（RiskItemDetail内） | 法规来源引用折叠面板 | `SourceReference[]` |

---

## 二、RiskScorePanel（整体风险评分组件）

### 2.1 组件定位与页面位置

- **所在页面**：P04（审核结果页）Level 1，P05（HITL页）顶部工具栏
- **功能**：展示任务整体风险评分（0–100）和风险等级文字标签
- **交互**：只读，无点击操作

### 2.2 展示字段映射

| 展示内容 | 数据来源字段 | 数据模型 | 说明 |
|---------|-----------|--------|------|
| 风险仪表盘数值（0–100） | `overall_risk_score` | `ReviewResult` | 浮点数，前端需要格式化整数展示 |
| 风险等级标签 | `risk_level_summary` | `ReviewResult` | 枚举值：`critical`/`high`/`medium`/`low` |
| AI辅助提示文案 | 常量 | — | 固定文案："本报告为 AI 辅助初审结果，不构成法律建议" |

### 2.3 色彩规则（5色阶）

**风险等级 → 仪表盘颜色 → 等级标签颜色** 的对应规则：

| `risk_level_summary` 值 | 仪表盘颜色 | 标签背景色 | 标签文字色 | 分数区间 |
|------------------------|-----------|-----------|-----------|---------|
| `critical` | 深红色 (RGB: 220, 53, 69) | 深红色 | 白色 | 75–100 |
| `high` | 橙色 (RGB: 253, 126, 20) | 橙色 | 白色 | 50–74 |
| `medium` | 黄色 (RGB: 255, 193, 7) | 黄色 | 深灰色 | 25–49 |
| `low` | 蓝色 (RGB: 0, 123, 255) | 蓝色 | 白色 | 0–24 |

> **重要约束**：色彩规则由 `risk_level_summary` 字段决定，前端不自行计算分数等级。

### 2.4 数据来源接口

**API**：`GET /api/v1/tasks/{task_id}`

**必须返回字段**：
```json
{
  "review_result": {
    "overall_risk_score": 72.5,
    "risk_level_summary": "high"
  }
}
```

### 2.5 关键约束

- 数据只读，不可编辑
- `overall_risk_score` 来自后端计算，前端不自行计算
- 色彩由 `risk_level_summary` 值决定，不依赖分数阈值

---

## 三、RiskCategoryBoard（分类风险看板）

### 3.1 组件定位与页面位置

- **所在页面**：P04（审核结果页）Level 2，P05（HITL页）右侧面板顶部
- **功能**：展示各风险等级的数量统计卡片（Critical、High、Medium、Low）
- **交互**：点击卡片跳转至对应过滤视图（RiskItemList），过滤条件为 `risk_level=xxx`

### 3.2 卡片结构与数据映射

| 卡片类型 | 数据来源字段 | 展示格式 | 点击行为 |
|---------|-----------|--------|---------|
| Critical 卡片 | `ReviewResult.critical_count` | 数字 + 标签 | 过滤 RiskItemList：`risk_level=critical` |
| High 卡片 | `ReviewResult.high_count` | 数字 + 标签 | 过滤 RiskItemList：`risk_level=high` |
| Medium 卡片 | `ReviewResult.medium_count` | 数字 + 标签 | 过滤 RiskItemList：`risk_level=medium` |
| Low 卡片 | `ReviewResult.low_count` | 数字 + 标签 | 过滤 RiskItemList：`risk_level=low` |

### 3.3 卡片视觉设计

每张卡片包含：
- **图标**：与风险等级对应的颜色圆形背景
- **数字**：风险项数量（整数）
- **标签**：风险等级中文名称（严重/高/中/低）
- **鼠标悬停状态**：轻微阴影/背景变暗，指示可点击

### 3.4 数据来源接口

**API**：`GET /api/v1/tasks/{task_id}`

**必须返回字段**：
```json
{
  "review_result": {
    "critical_count": 0,
    "high_count": 3,
    "medium_count": 5,
    "low_count": 8
  }
}
```

### 3.5 关键约束

- 4个卡片分别独立，无相互依赖
- 数据统计来自后端，前端不自行计算
- 数为0的卡片仍需展示（展示"0"，可设置为禁用样式）
- 点击操作不修改URL导航方式（由前端实现侧面板内的RiskItemList过滤）

---

## 四、RiskItemList（风险条目列表）

### 4.1 组件定位与页面位置

- **所在页面**：P04（审核结果页）Level 3，P05（HITL页）右侧面板中部
- **功能**：可过滤、可排序的风险条目卡片列表
- **交互**：
  - 点击条目展开详情（进入 Level 4：RiskItemDetail）
  - 使用过滤栏按风险等级、风险类型、审核状态筛选
  - 支持排序（风险等级降序为默认）

### 4.2 列表项字段映射

| 列表项显示元素 | 数据字段 | 数据类型 | 说明 |
|-------------|--------|--------|------|
| 风险等级色标 | `risk_level` | enum | 左侧竖条色标，颜色见§4.3 |
| 风险描述摘要 | `risk_description` | string | 截断显示前 80–100 字符，尾部加省略号 |
| 置信度徽章 | `confidence_category` + `confidence_score` | enum + float | 颜色+数值，详见§4.4 |
| 审核状态标记 | `reviewer_status` | enum | 条目右侧小标签，详见§4.5 |
| 展开按钮 | — | — | 条目右端的展开箭头，点击进入RiskItemDetail |

### 4.3 风险等级色标规则

| `risk_level` 值 | 色标颜色 | RGB值 |
|---------------|--------|------|
| `critical` | 深红 | (220, 53, 69) |
| `high` | 橙 | (253, 126, 20) |
| `medium` | 黄 | (255, 193, 7) |
| `low` | 蓝 | (0, 123, 255) |

### 4.4 置信度徽章渲染规则

**关键约束**：置信度颜色由后端 `confidence_category` 字段决定，**前端禁止根据 `confidence_score` 数值自行计算类别**。

| `confidence_category` | 徽章颜色 | 显示格式 | 必显说明 |
|---------------------|--------|--------|--------|
| `fact`（≥90%） | 绿色 | "绿色圆 + 数值（如85.5%）" | — |
| `clause`（70-89%） | 黄色 | "黄色圆 + 数值（如75.2%）" | — |
| `legal`（<70%） | 橙色 | "橙色圆 + 数值（如65.8%）" | **低置信必须展示 `reasoning` 字段**（见§五.5） |

> 当 `confidence_category = legal` 时，即使在列表摘要视图，也必须在展开详情后显示 AI 推理说明（`reasoning` 字段），不可缺失。

### 4.5 审核状态（reviewer_status）渲染规则

| `reviewer_status` | 视觉样式 | 说明 |
|-----------------|--------|------|
| `pending` | 无标记（默认） | 条目为待处理状态，背景可设浅灰色 |
| `approved` | 绿色勾选标记 + "已同意"文字 | 用户已同意 AI 评定 |
| `edited` | 蓝色编辑标记 + "已编辑"文字 | 用户修改过风险等级/描述/推理 |
| `reviewer_rejected` | 红色✕标记 + "已驳回"文字 | 用户认为误报，驳回此条目 |

### 4.6 过滤栏设计

过滤栏包含以下维度（独立选择，支持多选）：

#### 按风险等级过滤
- 选项：Critical / High / Medium / Low（复选框或标签式选择）
- 后端Query参数：`risk_level=critical,high`（逗号分隔多值）

#### 按审核状态过滤
- 选项：Pending / Approved / Edited / Rejected（复选框）
- 后端Query参数：`reviewer_status=pending,approved`

#### 清除过滤
- "重置"按钮：清空所有过滤条件

### 4.7 排序规则

| 排序维度 | 默认排序 | 支持双向 |
|--------|--------|--------|
| 风险等级 | Critical → High → Medium → Low（降序） | ✓ 支持升序 |
| 审核状态 | Pending → Edited → Approved → Rejected | ✓ 支持反向 |

> **默认排序**：风险等级降序（Critical优先展示）。前端实现排序时，后端不提供专门的 `sort` 参数，由前端在内存中对返回的 `RiskItem[]` 进行排序。

### 4.8 分页与加载

- **默认分页大小**：50（最大200）
- **分页参数**：`page=1&page_size=50`
- **加载方式**：初始加载全量或首页 → 用户滚动触发加载下一页（虚拟滚动或传统分页）

### 4.9 数据来源接口

**API**：`GET /api/v1/tasks/{task_id}/risk-items`

**Query参数**：
```
GET /api/v1/tasks/{task_id}/risk-items?risk_level=critical,high&reviewer_status=pending&page=1&page_size=50
```

**必须返回字段**：
```json
{
  "data": {
    "items": [
      {
        "id": "risk-uuid-xxxx",
        "task_id": "task-uuid-xxxx",
        "risk_type": "liability_asymmetry",
        "risk_level": "high",
        "risk_description": "第8条对乙方违约责任约定明显重于甲方……",
        "confidence_score": 85.2,
        "confidence_category": "clause",
        "reasoning": null,
        "location_page": 3,
        "location_paragraph": 12,
        "reviewer_status": "pending"
      }
    ],
    "total": 16,
    "page": 1,
    "page_size": 50
  }
}
```

### 4.10 关键约束

- 置信度颜色 **不可前端自行计算**，必须使用后端 `confidence_category` 字段
- `legal` 类别的条目在 RiskItemDetail 展开时必须显示 `reasoning` 字段
- 排序由前端内存执行（不依赖后端排序参数）
- 过滤操作应即时在前端响应（无需等待后端重新查询，除非数据量超大）

---

## 五、RiskItemDetail（单条款详情展开区）

### 5.1 组件定位与页面位置

- **所在页面**：P04（审核结果页）Level 4（行内展开或右侧抽屉），P05（HITL页）右侧面板下部
- **功能**：展示单条风险项的完整信息，包括推理说明、原文定位、来源引用等
- **交互**：
  - P04：点击RiskItemList条目展开详情，可折叠收起
  - P05：点击RiskItemList条目展开，同时左侧PDF自动定位至原文位置

### 5.2 展示字段与可编辑性

| 字段名 | 数据来源 | 数据类型 | P04展示 | P05编辑 | 说明 |
|-------|--------|--------|--------|--------|------|
| 完整风险描述 | `risk_description` | string | ✓ | ✓ | 全文展示，P05可编辑 |
| 置信度类别标题 | `confidence_category` | enum | ✓ | ✗ | "事实提取"/"条款检查"/"风险评估"标题标签 |
| 置信度数值百分比 | `confidence_score` | float | ✓ | ✗ | 格式化显示，如"85.2%" |
| 风险等级 | `risk_level` | enum | ✓ | ✓ | P05可下拉选择修改为 critical/high/medium/low |
| 风险类型 | `risk_type` | string | ✓ | ✗ | **只读，不可编辑**（AI原始字段） |
| 原文定位 | `location_page` + `location_paragraph` | int + int | ✓ | ✓ 链接 | P05可点击跳转PDF |
| AI推理说明 | `reasoning` | string\|null | ✓（法律类必显） | ✓ | **`confidence_category=legal`时必显，可编辑** |
| 来源引用折叠面板 | `source_references` | array | ✓ | ✓ | 子组件SourceReferencePanel |

### 5.3 字段分组展示

#### 第一组：基本信息
```
┌─ 风险等级: [Critical/High/Medium/Low 标签] (P05可编辑)
├─ 风险类型: [类型名称] (只读)
├─ 置信度: [颜色徽章] [数值]% 类别说明
└─ AI推理说明: [文本内容] (legal类必显，P05可编辑)
```

#### 第二组：完整描述
```
┌─ 完整风险描述
└─ [多行文本，P05可编辑]
```

#### 第三组：原文定位
```
┌─ 原文定位
├─ 页码: [N]
├─ 段落: [M]
└─ [P05可点击跳转PDF的链接样式]
```

#### 第四组：来源引用（折叠面板）
```
┌─ 法规来源 [展开/折叠箭头]
└─ [SourceReferencePanel 详见§六]
```

### 5.4 置信度类别说明文案

| `confidence_category` | 标题文案 | 解释文案 |
|---------------------|--------|--------|
| `fact` | 事实提取（高置信） | 通过直接文本匹配或OCR识别，高度确信此信息准确 |
| `clause` | 条款检查（中置信） | 基于条款模板和规则匹配，中等程度确信此项符合风险特征 |
| `legal` | 法律评估（低置信） | 涉及复杂法律推断，AI置信度较低，建议律师复核 |

### 5.5 低置信度约束（confidence_category = legal）

**强制规则**：
- 当 `confidence_category = legal` 时（`confidence_score < 70%`），**必须展示** `reasoning` 字段
- 如果后端返回 `reasoning = null` 或空字符串，前端应：
  1. 展示占位提示："AI暂未生成详细推理说明，请根据上述条款描述自行评估"
  2. 在P05 HITL页面，允许律师在此处手动填写推理说明（可编辑）

### 5.6 P05编辑表单设计（HITL页）

在P05人工审核页面中，RiskItemDetail的以下字段可编辑：

#### 可编辑字段
| 字段 | 编辑方式 | 约束 |
|------|--------|------|
| `risk_level` | 下拉选择框 | 4选1（critical/high/medium/low） |
| `risk_description` | 多行文本框 | 可自由编辑，无字符数限制 |
| `reasoning` | 多行文本框 | `legal`类别时必填；其他类别可选 |

#### 只读字段（展示，不可编辑）
- `risk_type`
- `confidence_score` 和 `confidence_category`
- `location_page` 和 `location_paragraph`

### 5.7 编辑操作UI布局（P05）

RiskItemDetail下方包含操作按钮组：

```
┌──────────────────────────────────────────────┐
│ 完整风险描述、置信度、推理、来源引用等        │
├──────────────────────────────────────────────┤
│ [同意按钮] [编辑按钮] [单条驳回] [批注按钮]  │
└──────────────────────────────────────────────┘
```

- **同意按钮**：确认AI评定，reviewer_status → `approved`
- **编辑按钮**：弹出编辑对话框（或行内展开编辑表单），修改后提交，reviewer_status → `edited`
- **单条驳回**：认为此条为误报，弹出确认对话框，输入≥10字符的驳回理由，reviewer_status → `reviewer_rejected`
- **批注按钮**：添加批注（独立操作，不影响reviewer_status），弹出批注输入框

### 5.8 数据来源接口

**API**：`GET /api/v1/tasks/{task_id}/risk-items`

**必须返回字段**（单个 RiskItem 对象）：
```json
{
  "id": "risk-uuid-xxxx",
  "task_id": "task-uuid-xxxx",
  "risk_type": "liability_asymmetry",
  "risk_level": "high",
  "risk_description": "第8条对乙方违约责任约定明显重于甲方，存在不对等风险。",
  "confidence_score": 85.2,
  "confidence_category": "clause",
  "reasoning": null,
  "location_page": 3,
  "location_paragraph": 12,
  "location_sentence_id": null,
  "reviewer_status": "pending",
  "source_references": [
    {
      "source_type": "law",
      "source_name": "中华人民共和国民法典",
      "article_number": "第585条",
      "reference_text": "当事人可以约定一方违约时应当根据违约情况向对方支付……"
    }
  ]
}
```

### 5.9 关键约束

- **legal类别必显reasoning**：当 `confidence_category = legal` 时，无论 `reasoning` 是否为null，都必须在UI中展示此字段（null时显示占位提示）
- **AI原始字段只读**：`risk_type`、`confidence_score`、`location_page`、`location_paragraph` 仅展示，不可编辑
- **P05编辑权限**：仅当用户为当前任务的 `assigned_reviewer_id` 时，才能在P05中编辑这些字段
- **编辑后的字段映射**：编辑提交时，前端向后端发送 `edited_fields` 对象（含 `risk_level`、`risk_description`、`reasoning` 等修改的字段）

---

## 六、SourceReferencePanel（法规来源引用面板）

### 6.1 组件定位与页面位置

- **所在页面**：P04（审核结果页）RiskItemDetail 内，P05（HITL页）RiskItemDetail 内
- **功能**：展示该风险项关联的法规来源和条文引用
- **交互**：
  - 默认折叠，点击展开/折叠
  - 支持多个来源项并列展示

### 6.2 展示结构

```
┌─ 法规来源 [折叠/展开箭头]
├─ [来源项 1]
│  ├─ 来源类型图标 | 法规名称 | 条文编号
│  └─ 引用原文（可选折叠）
├─ [来源项 2]
│  ├─ 来源类型图标 | 法规名称 | 条文编号
│  └─ 引用原文
└─ [来源项 N]
```

### 6.3 字段映射表

| 展示位置 | 字段名 | 数据类型 | 说明 |
|---------|-------|--------|------|
| 来源类型图标 | `source_type` | enum | 5种类型对应不同图标 |
| 法规名称 | `source_name` | string | 完整名称，如"中华人民共和国民法典" |
| 条文编号 | `article_number` | string\|null | 如"第585条"或"第585条第3款"；可为null |
| 引用原文 | `reference_text` | string\|null | 法规条文全文或摘录；可为null |

### 6.4 来源类型图标规则

| `source_type` | 中文标签 | 图标建议 | 说明 |
|--------------|--------|--------|------|
| `law` | 法律 | ⚖️ | 国家法律（民法典、合同法等） |
| `regulation` | 行政法规 | 📋 | 国务院、部门规章 |
| `standard` | 行业标准 | 📐 | 国家标准、行业标准 |
| `internal_policy` | 内部政策 | 🏢 | 企业自有政策（仅HITL审核时可见） |
| `case_law` | 判例法 | 🔨 | 法院判例、仲裁案例 |

### 6.5 来源项展示格式

每个来源项的完整渲染格式：

```
[图标] 法规名称 | 条文编号
├─ 法规URL（可选，超链接）
└─ 引用原文（行内显示或点击展开）
```

**示例**：
```
⚖️ 中华人民共和国民法典 | 第585条
└─ "当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金……"
```

### 6.6 多来源处理

若一个RiskItem关联多个来源引用（`source_references` 是数组），则：
- 所有来源项在同一折叠面板内并列显示
- 无单独排序（按后端返回顺序）
- 每个来源项之间用分隔线（横线或空行）分隔

### 6.7 空值处理

| 字段为null时 | 处理方案 |
|-------------|--------|
| `article_number = null` | 不显示条文编号部分，仅显示"法规名称" |
| `reference_text = null` | 不显示引用原文，仅显示"法规名称 \| 条文编号" |
| `source_references = []` | 折叠面板灰显或隐藏，或显示"暂无法规来源" |

### 6.8 数据来源接口

**API**：`GET /api/v1/tasks/{task_id}/risk-items`

**SourceReference字段列表**（嵌入RiskItem.source_references）：
```json
{
  "source_references": [
    {
      "source_type": "law",
      "source_name": "中华人民共和国民法典",
      "article_number": "第585条",
      "reference_text": "当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金……"
    }
  ]
}
```

### 6.9 关键约束

- 来源引用数据来自后端，前端仅做展示和折叠交互
- 不支持来源编辑（不可添加/删除来源，只能展示AI生成的内容）
- `source_type` 枚举必须与后端定义一致

---

## 七、FactExtractionPanel（结构化事实字段展示）

### 7.1 组件定位与页面位置

- **所在页面**：P04（审核结果页）右侧侧边栏，P05（HITL页）右侧面板侧边栏
- **功能**：展示从合同中自动提取的结构化事实字段（合同主体、金额、期限、关键日期）
- **交互**：只读，无编辑操作

### 7.2 展示字段与数据映射

| 显示名称 | 数据字段 | 数据类型 | 说明 |
|--------|---------|--------|------|
| 合同主体 | `party_a_name` / `party_b_name` | string | 甲、乙方名称 |
| 合同金额 | `contract_amount` | float | 数值 + 货币单位（¥） |
| 合同期限 | `contract_duration` | string | "XX年XX个月"或"YYYY-MM-DD 至 YYYY-MM-DD" |
| 签署日期 | `signature_date` | date | ISO 8601 格式，前端格式化为"YYYY年MM月DD日" |
| 生效日期 | `effective_date` | date | 同上 |
| 终止日期 | `expiration_date` | date | 同上（如果有） |

### 7.3 展示布局

```
┌────────────────────────┐
│ 事实字段                │
├────────────────────────┤
│ 合同主体:               │
│ ├─ 甲方: [名称]         │
│ └─ 乙方: [名称]         │
│                        │
│ 合同金额:               │
│ └─ ¥ [数值]             │
│                        │
│ 合同期限:               │
│ └─ [时长] / [日期范围]  │
│                        │
│ 关键日期:               │
│ ├─ 签署: [日期]         │
│ ├─ 生效: [日期]         │
│ └─ 终止: [日期]         │
└────────────────────────┘
```

### 7.4 数据来源接口

**⚠️ 【后端未开发】**

根据前后端边界规范，应存在接口：
```
GET /api/v1/tasks/{task_id}/extractions
```

但此接口**未在API规范（docs/08_api_spec/fastapi-spec-v1.0.md）中定义**。

**临时解决方案**（需与后端确认）：
1. **方案A**：后端补充定义此接口，返回 `ClauseExtraction` 实体数据
2. **方案B**：事实字段暂由P04结果页中的 `review_result` 对象包含（修改API设计）
3. **方案C**：MVP阶段暂时隐藏此面板，后续迭代补充

**建议**：在联调规范（docs/11_integration）中补充此接口的具体定义或标记为"V2功能"。

### 7.5 空值处理

若字段为null或API未返回某字段：
- 该行整体隐藏（不显示"未知"或占位符）
- 或显示灰色文案"未提取"

### 7.6 可编辑性

- **P04审核结果页**：完全只读，仅展示
- **P05 HITL页**：也为只读（事实字段不在人工审核编辑范围内，只有风险条目本身可编辑）

---

## 八、核心约束汇总

### 8.1 数据只读约束

| 字段 | 所在组件 | 可编辑性 |
|------|--------|--------|
| `overall_risk_score` | RiskScorePanel | ✗ 只读 |
| `risk_level_summary` | RiskScorePanel | ✗ 只读 |
| `critical_count` 等计数 | RiskCategoryBoard | ✗ 只读 |
| `risk_type` | RiskItemList/RiskItemDetail | ✗ 只读（AI原始） |
| `confidence_score` | RiskItemList/RiskItemDetail | ✗ 只读（AI原始） |
| `confidence_category` | RiskItemList/RiskItemDetail | ✗ 只读（后端计算） |
| `location_page` / `location_paragraph` | RiskItemDetail | ✗ 只读（AI原始） |
| `source_references` | SourceReferencePanel | ✗ 只读 |
| `fact` 提取字段 | FactExtractionPanel | ✗ 只读 |

### 8.2 可编辑字段约束（P05 HITL页）

| 字段 | 编辑方式 | 约束 |
|------|--------|------|
| `risk_level` | 下拉选择 | 4选1（critical/high/medium/low） |
| `risk_description` | 多行文本框 | 自由编辑，无字符限制 |
| `reasoning` | 多行文本框 | `legal`类别时必填；其他可选 |

### 8.3 置信度色彩全局规则

**一级规则**：置信度颜色由后端 `confidence_category` 字段决定，前端**禁止根据`confidence_score`数值自行计算类别**。

| `confidence_category` | 颜色 | RGB | confidence_score范围 | UI要求 |
|---------------------|------|-----|-------------------|----|
| `fact` | 绿 | (76, 175, 80) | ≥ 90% | 直接展示数值 |
| `clause` | 黄 | (255, 193, 7) | 70–89% | 直接展示数值 |
| `legal` | 橙 | (255, 152, 0) | < 70% | **必须展示 reasoning 字段** |

### 8.4 低置信度（legal类别）强制规则

**场景**：当 `confidence_category = legal` 时（`confidence_score < 70%`）

**强制要求**：
1. RiskItemList中，置信度徽章必须用橙色突出显示
2. RiskItemDetail展开后，**必须显示** `reasoning` 字段（内容或占位）
3. 若后端返回 `reasoning = null`，前端显示占位提示文案
4. 在P05编辑表单中，此字段为必填项（不可留空提交）

### 8.5 字段映射完整性约束

所有展示在UI中的字段，必须在后端对应的API响应中返回：

| UI组件 | 必须返回的API | 必须包含的字段 |
|-------|------------|------------|
| RiskScorePanel | `GET /tasks/{id}` | `overall_risk_score`, `risk_level_summary` |
| RiskCategoryBoard | `GET /tasks/{id}` | `critical_count`, `high_count`, `medium_count`, `low_count` |
| RiskItemList | `GET /tasks/{id}/risk-items` | `id`, `risk_level`, `risk_description`, `confidence_category`, `confidence_score`, `reviewer_status` |
| RiskItemDetail | `GET /tasks/{id}/risk-items` | 所有 RiskItem 字段 + `reasoning` |
| SourceReferencePanel | `GET /tasks/{id}/risk-items` | `source_references[]` 完整对象 |
| FactExtractionPanel | `GET /tasks/{id}/extractions` | **【后端未开发】** |

---

## 九、与其他文档的映射关系

### 9.1 与前端设计规范的对应关系

| 本文档组件 | 前端设计规范(§二) | 对应章节 |
|----------|------------|--------|
| RiskScorePanel | Level 1 | §P04.Level 1：整体风险评分区 |
| RiskCategoryBoard | Level 2 | §P04.Level 2：分类风险看板 |
| RiskItemList | Level 3 | §P04.Level 3：风险列表 |
| RiskItemDetail | Level 4 | §P04.Level 4：单条款详情 |
| FactExtractionPanel | 侧边栏 | §P04.侧边栏：事实字段结构化区 |
| SourceReferencePanel | Level 4 内 | §P04.Level 4：来源引用折叠面板 |

### 9.2 与数据模型规范的对应关系

| 本文档组件 | 数据模型实体 | 关键字段 |
|----------|-----------|--------|
| RiskScorePanel | `ReviewResult` | `overall_risk_score`, `risk_level_summary` |
| RiskCategoryBoard | `ReviewResult` | `critical_count`, `high_count`, `medium_count`, `low_count` |
| RiskItemList | `RiskItem[]` | `id`, `task_id`, `risk_level`, `risk_description`, `confidence_category`, `reviewer_status` |
| RiskItemDetail | `RiskItem` + `SourceReference[]` | 所有 RiskItem 字段 + `source_references` |
| FactExtractionPanel | `ClauseExtraction` | `party_a_name`, `party_b_name`, `contract_amount`, `contract_duration`, `signature_date` 等 |
| SourceReferencePanel | `SourceReference` | `source_type`, `source_name`, `article_number`, `reference_text` |

### 9.3 与API规范的对应关系

| 本文档组件 | API端点 | 规范位置 |
|----------|--------|--------|
| RiskScorePanel | `GET /api/v1/tasks/{task_id}` | API规范 §五.1 |
| RiskCategoryBoard | `GET /api/v1/tasks/{task_id}` | API规范 §五.1 |
| RiskItemList | `GET /api/v1/tasks/{task_id}/risk-items` | API规范 §五.2 |
| RiskItemDetail | `GET /api/v1/tasks/{task_id}/risk-items` | API规范 §五.2 |
| FactExtractionPanel | `GET /api/v1/tasks/{task_id}/extractions` | **未定义，【后端未开发】** |
| SourceReferencePanel | `GET /api/v1/tasks/{task_id}/risk-items` | API规范 §五.2（嵌入 source_references） |

### 9.4 与前后端边界规范的对应关系

| 约束项 | 本文档对应位置 | 边界规范位置 |
|-------|------------|----------|
| 置信度颜色由后端决定 | §四.4、§八.3 | 边界规范 §四.1、§二.2 |
| `legal`类别必显reasoning | §五.5、§八.4 | 边界规范 §四.3 |
| 风险等级色标规则 | §四.3、§三.3 | 前端设计规范 §四.2 |
| 无法编辑源引用 | §六.7 | 边界规范 §三.3 |

---

## 十、实现注意事项

### 10.1 前后端协作检查清单

- [ ] 后端确认`GET /tasks/{id}/extractions`接口定义（或明确为后续版本）
- [ ] 后端确认所有API返回字段完整度（特别是`legal`类别的`reasoning`字段）
- [ ] 前端确认`confidence_category`的枚举值与后端一致（fact/clause/legal）
- [ ] 前端确认色彩值与UI设计规范一致（RGB值）
- [ ] 前后端联调时验证低置信度条目的完整展示（含reasoning占位处理）

### 10.2 浏览器兼容性

- 折叠展开：使用原生 HTML `<details>` 标签或自定义组件
- 虚拟滚动（大列表）：如风险条目超过100条，建议使用虚拟滚动库（如 react-window）
- PDF高亮叠加层（P05）：使用PDF.js官方库或社区方案

### 10.3 性能优化建议

- RiskItemList分页加载（初始50条，滚动加载）
- 避免一次性渲染数百个RiskItem（虚拟滚动）
- SourceReferencePanel默认折叠（延迟渲染引用原文）
- 编辑表单可使用debounce减少前端验证频率

### 10.4 无障碍（A11y）

- 所有交互元素（按钮、链接）需tab键可导航
- 颜色不应作为唯一的信息传递方式（配合图标或文字）
- 折叠面板应支持键盘操作（↑/↓展开/折叠）
- `aria-label` 标注图标按钮的作用

---

## 十一、FAQ与常见问题

### Q1：置信度为什么不能在前端计算？

**A**：置信度分级涉及法律语义解释，`confidence_category` 的定义可能随模型版本或规则库更新而改变。由后端统一计算和管理可以确保前端展示的分级始终与业务规则保持一致，避免前后端不同步导致的混淆。

### Q2：FactExtractionPanel现在怎么办？

**A**：根据API规范检查结果，此接口尚未定义。建议：
1. 短期（MVP）：此功能暂时隐藏或显示"数据加载中"
2. 中期（v1.1）：后端实现接口，前端接入
3. 或标记为"后续版本功能"在UI中说明

### Q3：P04和P05中，同一条组件的交互是否不同？

**A**：基本展示相同，但交互不同：
- **P04**：完全只读，展示AI审核结果
- **P05**：右侧面板支持编辑（风险等级/描述/推理），左侧PDF联动定位

### Q4：如果一个RiskItem的reasoning为null，但confidence_category=legal，前端该显示什么？

**A**：显示占位文案："AI暂未生成详细推理说明，请根据上述条款描述自行评估。"在P05编辑时，此字段为必填项，律师需要手动补充推理说明后才能提交。

### Q5：风险列表默认排序是什么？

**A**：风险等级降序（Critical → High → Medium → Low），由前端在内存中实现，不依赖后端排序参数。

---

*本文档详细规范了审核结果页（P04）和人工审核页（P05）右侧面板中6个核心组件的展示内容、数据来源、交互行为和约束规则。前端implementer 按本规范进行编码实现，确保与架构设计文档和API规范的一致性。*

