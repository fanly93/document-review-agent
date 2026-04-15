/**
 * Mock 数据层 — 用于前端原型演示
 * 所有数据结构严格遵循 fastapi-spec-v1.0.md 定义的响应格式
 * 后端接入后删除此文件，切换到真实 API 即可
 */

import type { RiskItem, SourceReference, WsMessage } from './client';

// ============ 基础 ID ============
const TASK_IDS = [
  'task-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'task-b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'task-c3d4e5f6-a7b8-9012-cdef-123456789012',
  'task-d4e5f6a7-b8c9-0123-defa-234567890123',
  'task-e5f6a7b8-c9d0-1234-efab-345678901234',
  'task-f6a7b8c9-d0e1-2345-fabc-456789012345',
  'task-11223344-5566-7788-99aa-bbccddeeff00',
  'task-aabbccdd-eeff-1122-3344-556677889900',
];

const DOC_IDS = TASK_IDS.map((_, i) => `doc-${String(i + 1).padStart(4, '0')}-uuid-xxxx`);

// ============ 文档列表 Mock (GET /api/v1/documents) ============
export const MOCK_DOCUMENTS = [
  {
    document_id: DOC_IDS[0],
    task_id: TASK_IDS[0],
    original_filename: '采购合同-华东区域-2026-Q2.pdf',
    file_size_bytes: 15728640,
    ocr_quality_level: 'high',
    ocr_quality_score: 92.5,
    document_type: 'procurement_contract',
    block_reason: null,
    task_status: 'completed',
    created_at: '2026-04-14T09:30:00+08:00',
  },
  {
    document_id: DOC_IDS[1],
    task_id: TASK_IDS[1],
    original_filename: '技术服务协议-ABC科技有限公司.docx',
    file_size_bytes: 8340210,
    ocr_quality_level: 'high',
    ocr_quality_score: 95.1,
    document_type: 'service_agreement',
    block_reason: null,
    task_status: 'human_reviewing',
    created_at: '2026-04-14T14:20:00+08:00',
  },
  {
    document_id: DOC_IDS[2],
    task_id: TASK_IDS[2],
    original_filename: '保密协议-NDA-甲乙方-v3.pdf',
    file_size_bytes: 3215400,
    ocr_quality_level: 'high',
    ocr_quality_score: 88.3,
    document_type: 'nda',
    block_reason: null,
    task_status: 'auto_reviewing',
    created_at: '2026-04-15T08:10:00+08:00',
  },
  {
    document_id: DOC_IDS[3],
    task_id: TASK_IDS[3],
    original_filename: '租赁合同-办公楼B栋-2026.pdf',
    file_size_bytes: 22450100,
    ocr_quality_level: 'medium',
    ocr_quality_score: 78.2,
    document_type: 'lease_contract',
    block_reason: null,
    task_status: 'parse_failed',
    created_at: '2026-04-15T10:45:00+08:00',
  },
  {
    document_id: DOC_IDS[4],
    task_id: TASK_IDS[4],
    original_filename: '劳动合同-批量模板-2026版.doc',
    file_size_bytes: 5672300,
    ocr_quality_level: 'high',
    ocr_quality_score: 91.0,
    document_type: 'employment_contract',
    block_reason: null,
    task_status: 'completed',
    created_at: '2026-04-13T16:00:00+08:00',
  },
  {
    document_id: DOC_IDS[5],
    task_id: TASK_IDS[5],
    original_filename: '供应商框架协议-XYZ集团.pdf',
    file_size_bytes: 18923400,
    ocr_quality_level: 'high',
    ocr_quality_score: 89.7,
    document_type: 'framework_agreement',
    block_reason: null,
    task_status: 'auto_review_failed',
    created_at: '2026-04-12T11:30:00+08:00',
  },
  {
    document_id: DOC_IDS[6],
    task_id: TASK_IDS[6],
    original_filename: '知识产权许可协议-软件著作权.pdf',
    file_size_bytes: 7821500,
    ocr_quality_level: 'high',
    ocr_quality_score: 94.2,
    document_type: 'ip_license',
    block_reason: null,
    task_status: 'rejected',
    created_at: '2026-04-11T09:15:00+08:00',
  },
  {
    document_id: DOC_IDS[7],
    task_id: TASK_IDS[7],
    original_filename: '合资经营合同-中外合资-草案.docx',
    file_size_bytes: 12450000,
    ocr_quality_level: 'medium',
    ocr_quality_score: 82.1,
    document_type: 'joint_venture',
    block_reason: null,
    task_status: 'parsing',
    created_at: '2026-04-15T11:00:00+08:00',
  },
];

// ============ 任务详情 Mock (GET /api/v1/tasks/{task_id}) ============
export function getMockTaskDetail(taskId: string) {
  const idx = TASK_IDS.indexOf(taskId);
  const doc = idx >= 0 ? MOCK_DOCUMENTS[idx] : MOCK_DOCUMENTS[0];

  const reviewResult = ['completed', 'human_reviewing', 'auto_reviewed', 'rejected'].includes(doc.task_status)
    ? {
        overall_risk_score: [72.5, 68.0, 45.2, 55.0, 38.5, 61.0, 72.0, 50.0][idx] ?? 65,
        risk_level_summary: (['high', 'high', 'medium', 'medium', 'low', 'high', 'high', 'medium'] as const)[idx] ?? 'medium',
        critical_count: [0, 1, 0, 0, 0, 0, 1, 0][idx] ?? 0,
        high_count: [3, 2, 1, 2, 0, 3, 2, 1][idx] ?? 2,
        medium_count: [5, 4, 3, 3, 2, 4, 3, 3][idx] ?? 3,
        low_count: [8, 7, 5, 4, 6, 5, 6, 4][idx] ?? 5,
        generated_at: '2026-04-15T10:05:00+08:00',
      }
    : null;

  return {
    task: {
      id: taskId,
      status: doc.task_status,
      assigned_reviewer_id: doc.task_status === 'human_reviewing' ? 'user-reviewer-001' : null,
      sla_deadline: doc.task_status === 'human_reviewing' ? '2026-04-15T15:30:00+08:00' : null,
      completed_at: doc.task_status === 'completed' ? '2026-04-15T11:20:00+08:00' : null,
      created_at: doc.created_at,
    },
    document: {
      id: doc.document_id,
      original_filename: doc.original_filename,
      file_size_bytes: doc.file_size_bytes,
      ocr_quality_level: doc.ocr_quality_level,
      ocr_quality_score: doc.ocr_quality_score,
      document_type: doc.document_type,
      block_reason: doc.block_reason,
    },
    review_result: reviewResult,
  };
}

// ============ 风险项 Mock (GET /api/v1/tasks/{task_id}/risk-items) ============
const MOCK_SOURCE_REFS: SourceReference[][] = [
  [
    {
      source_type: 'law',
      source_name: '中华人民共和国民法典',
      article_number: '第585条',
      reference_text: '当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金，也可以约定因违约产生的损失赔偿额的计算方法。',
    },
  ],
  [
    {
      source_type: 'law',
      source_name: '中华人民共和国民法典',
      article_number: '第496条',
      reference_text: '格式条款是当事人为了重复使用而预先拟定，并在订立合同时未与对方协商的条款。',
    },
  ],
  [
    {
      source_type: 'regulation',
      source_name: '最高人民法院关于适用《中华人民共和国合同法》若干问题的解释(二)',
      article_number: '第6条',
      reference_text: '提供格式条款的一方对格式条款中免除或者限制其责任的内容，在合同订立时采用足以引起对方注意的文字、符号、字体等特别标识，并按照对方的要求对该格式条款予以说明的，人民法院应当认定符合合同法第三十九条所称"采取合理的方式"。',
    },
  ],
  [
    {
      source_type: 'law',
      source_name: '中华人民共和国民法典',
      article_number: '第577条',
      reference_text: '当事人一方不履行合同义务或者履行合同义务不符合约定的，应当承担继续履行、采取补救措施或者赔偿损失等违约责任。',
    },
  ],
  [],
  [
    {
      source_type: 'standard',
      source_name: '企业知识产权管理规范（GB/T 29490-2013）',
      article_number: '第7.5条',
      reference_text: null,
    },
  ],
];

export function getMockRiskItems(taskId: string): RiskItem[] {
  const items: RiskItem[] = [
    {
      id: 'risk-001-uuid',
      task_id: taskId,
      risk_type: 'liability_asymmetry',
      risk_level: 'high',
      risk_description: '第8条对乙方违约责任约定明显重于甲方，违约金比例为合同总金额的30%，而甲方仅为5%，存在显著不对等风险。',
      confidence_score: 85.2,
      confidence_category: 'clause',
      reasoning: null,
      location_page: 3,
      location_paragraph: 12,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: MOCK_SOURCE_REFS[0],
    },
    {
      id: 'risk-002-uuid',
      task_id: taskId,
      risk_type: 'unfair_clause',
      risk_level: 'critical',
      risk_description: '第12条免责条款约定"甲方在任何情况下均不承担间接损失赔偿责任"，该条款可能因排除主要权利而被认定无效。',
      confidence_score: 62.8,
      confidence_category: 'legal',
      reasoning: '该免责条款的法律有效性存在争议。根据《民法典》第497条，免除己方主要责任的格式条款可能被认定为无效。结合合同整体语境和交易双方的地位差异，建议进行人工评估。AI 模型对此类"一切间接损失"的笼统免责条款的法律后果推断置信度较低，需法律专家确认。',
      location_page: 5,
      location_paragraph: 3,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: MOCK_SOURCE_REFS[1],
    },
    {
      id: 'risk-003-uuid',
      task_id: taskId,
      risk_type: 'termination_clause',
      risk_level: 'high',
      risk_description: '第15条终止条款仅赋予甲方单方面无条件解除权（提前30天书面通知即可），但乙方解除需满足甲方连续违约超过90天的前置条件。',
      confidence_score: 78.5,
      confidence_category: 'clause',
      reasoning: null,
      location_page: 7,
      location_paragraph: 8,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: MOCK_SOURCE_REFS[3],
    },
    {
      id: 'risk-004-uuid',
      task_id: taskId,
      risk_type: 'payment_terms',
      risk_level: 'medium',
      risk_description: '第5条付款条件约定"验收合格后60个工作日内付款"，付款周期过长，可能影响乙方现金流。行业惯例一般为30个工作日。',
      confidence_score: 91.3,
      confidence_category: 'fact',
      reasoning: null,
      location_page: 2,
      location_paragraph: 15,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: [],
    },
    {
      id: 'risk-005-uuid',
      task_id: taskId,
      risk_type: 'ip_ownership',
      risk_level: 'high',
      risk_description: '第18条知识产权条款约定"合作期间产生的所有知识产权归甲方所有"，未区分前景IP与背景IP，可能导致乙方原有技术权益受损。',
      confidence_score: 55.0,
      confidence_category: 'legal',
      reasoning: '知识产权归属条款的合理性取决于双方的具体贡献比例和商业安排。当前条款采用"一刀切"方式将所有IP归甲方，在司法实践中可能被质疑公平性。特别是当乙方投入核心技术时，该约定可能与《民法典》关于公平原则的规定产生冲突。AI 模型对此类复合条款的法律后果评估置信度偏低。',
      location_page: 8,
      location_paragraph: 5,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: MOCK_SOURCE_REFS[5],
    },
    {
      id: 'risk-006-uuid',
      task_id: taskId,
      risk_type: 'confidentiality',
      risk_level: 'medium',
      risk_description: '第20条保密期限约定为"合同终止后5年"，保密范围定义模糊，未明确排除公开信息和独立开发成果。',
      confidence_score: 82.7,
      confidence_category: 'clause',
      reasoning: null,
      location_page: 9,
      location_paragraph: 2,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: [],
    },
    {
      id: 'risk-007-uuid',
      task_id: taskId,
      risk_type: 'dispute_resolution',
      risk_level: 'medium',
      risk_description: '第25条争议解决条款约定由甲方所在地法院管辖，未提供仲裁选项。对于跨区域交易，仲裁可能更具执行力。',
      confidence_score: 88.0,
      confidence_category: 'clause',
      reasoning: null,
      location_page: 11,
      location_paragraph: 6,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: [],
    },
    {
      id: 'risk-008-uuid',
      task_id: taskId,
      risk_type: 'warranty',
      risk_level: 'low',
      risk_description: '第10条质保期约定为12个月，与行业标准一致，质保范围明确覆盖材料缺陷和工艺问题。',
      confidence_score: 95.1,
      confidence_category: 'fact',
      reasoning: null,
      location_page: 4,
      location_paragraph: 9,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: [],
    },
    {
      id: 'risk-009-uuid',
      task_id: taskId,
      risk_type: 'force_majeure',
      risk_level: 'low',
      risk_description: '第22条不可抗力条款定义较为完整，包含自然灾害、政府行为、疫情等常见情形，通知期限为7个工作日。',
      confidence_score: 93.8,
      confidence_category: 'fact',
      reasoning: null,
      location_page: 10,
      location_paragraph: 3,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: [],
    },
    {
      id: 'risk-010-uuid',
      task_id: taskId,
      risk_type: 'delivery_terms',
      risk_level: 'medium',
      risk_description: '第6条交付验收标准仅引用甲方内部标准（编号JN-QC-2025），未附具体内容，乙方可能难以预判验收要求。',
      confidence_score: 74.5,
      confidence_category: 'clause',
      reasoning: null,
      location_page: 2,
      location_paragraph: 22,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: MOCK_SOURCE_REFS[2],
    },
    {
      id: 'risk-011-uuid',
      task_id: taskId,
      risk_type: 'penalty_clause',
      risk_level: 'medium',
      risk_description: '第9条逾期交付违约金按日计算（合同总额的0.5%/天），无上限约定，累计可能超过合同总额，存在过高违约金风险。',
      confidence_score: 80.3,
      confidence_category: 'clause',
      reasoning: null,
      location_page: 4,
      location_paragraph: 1,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: MOCK_SOURCE_REFS[0],
    },
    {
      id: 'risk-012-uuid',
      task_id: taskId,
      risk_type: 'subcontracting',
      risk_level: 'low',
      risk_description: '第14条分包条款允许乙方将非核心工作分包，但需事先取得甲方书面同意，约定合理。',
      confidence_score: 92.0,
      confidence_category: 'fact',
      reasoning: null,
      location_page: 6,
      location_paragraph: 14,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: [],
    },
    {
      id: 'risk-013-uuid',
      task_id: taskId,
      risk_type: 'amendment_clause',
      risk_level: 'low',
      risk_description: '第23条变更条款要求双方书面签署变更协议，程序规范，符合通常商业惯例。',
      confidence_score: 96.2,
      confidence_category: 'fact',
      reasoning: null,
      location_page: 10,
      location_paragraph: 11,
      location_sentence_id: null,
      reviewer_status: 'pending',
      source_references: [],
    },
  ];

  return items;
}

// ============ 审核结果 Mock (GET /api/v1/tasks/{task_id}/result) ============
export function getMockTaskResult(taskId: string) {
  return {
    task_id: taskId,
    overall_risk_score: 72.5,
    risk_level_summary: 'high',
    critical_count: 1,
    high_count: 3,
    medium_count: 5,
    low_count: 4,
    hitl_triggered: true,
    generated_at: '2026-04-15T10:05:00+08:00',
    completed_at: '2026-04-15T11:10:00+08:00',
    risk_items_summary: [
      { risk_level: 'critical', count: 1, approved_count: 0, edited_count: 1, rejected_count: 0 },
      { risk_level: 'high', count: 3, approved_count: 2, edited_count: 1, rejected_count: 0 },
      { risk_level: 'medium', count: 5, approved_count: 3, edited_count: 1, rejected_count: 1 },
      { risk_level: 'low', count: 4, approved_count: 4, edited_count: 0, rejected_count: 0 },
    ],
  };
}

// ============ 操作历史 Mock (GET /api/v1/tasks/{task_id}/operations) ============
export function getMockOperations(taskId: string) {
  return {
    items: [
      {
        id: 'op-001-uuid',
        risk_item_id: 'risk-002-uuid',
        operator_id: 'user-reviewer-001',
        action: 'edit',
        reject_reason: null,
        operated_at: '2026-04-15T11:05:00+08:00',
        edit_records: [
          {
            edited_field: 'risk_level',
            original_value: 'critical',
            new_value: 'high',
            operated_at: '2026-04-15T11:05:00+08:00',
          },
          {
            edited_field: 'risk_description',
            original_value: '第12条免责条款约定"甲方在任何情况下均不承担间接损失赔偿责任"，该条款可能因排除主要权利而被认定无效。',
            new_value: '第12条免责条款存在一定风险，但考虑到交易背景和双方协商记录，风险等级调整为High。',
            operated_at: '2026-04-15T11:05:00+08:00',
          },
        ],
      },
      {
        id: 'op-002-uuid',
        risk_item_id: 'risk-001-uuid',
        operator_id: 'user-reviewer-001',
        action: 'approve',
        reject_reason: null,
        operated_at: '2026-04-15T11:08:00+08:00',
        edit_records: [],
      },
      {
        id: 'op-003-uuid',
        risk_item_id: 'risk-004-uuid',
        operator_id: 'user-reviewer-001',
        action: 'reject_item',
        reject_reason: '经核实，该付款条件已在补充协议中修改为30个工作日，此项不再构成风险。',
        operated_at: '2026-04-15T11:12:00+08:00',
        edit_records: [],
      },
    ],
    total: 3,
    page: 1,
    page_size: 20,
  };
}

// ============ 批注 Mock (GET /api/v1/tasks/{task_id}/annotations) ============
export function getMockAnnotations(taskId: string) {
  return {
    items: [
      {
        id: 'ann-001-uuid',
        review_task_id: taskId,
        risk_item_id: 'risk-005-uuid',
        operator_id: 'user-reviewer-001',
        content: '此条款需要与甲方总协议第3章核对，建议线下沟通确认IP归属的具体范围。',
        created_at: '2026-04-15T11:08:00+08:00',
      },
      {
        id: 'ann-002-uuid',
        review_task_id: taskId,
        risk_item_id: 'risk-003-uuid',
        operator_id: 'user-reviewer-001',
        content: '终止条款的不对等性在行业内较为常见，但本合同金额较大，建议增加乙方的提前终止权。',
        created_at: '2026-04-15T11:15:00+08:00',
      },
    ],
    total: 2,
    page: 1,
    page_size: 20,
  };
}

// ============ 审计日志 Mock (GET /api/v1/tasks/{task_id}/audit-logs) ============
export function getMockAuditLogs(taskId: string) {
  return {
    items: [
      {
        id: 'log-001',
        event_type: 'vector_db_bind',
        review_task_id: taskId,
        operator_id: null,
        detail: { vector_db_version: 'v2.1.0', task_id: taskId },
        occurred_at: '2026-04-15T10:00:00+08:00',
      },
      {
        id: 'log-002',
        event_type: 'task_status_change',
        review_task_id: taskId,
        operator_id: null,
        detail: { old_status: 'uploaded', new_status: 'parsing', trigger: 'system' },
        occurred_at: '2026-04-15T10:00:05+08:00',
      },
      {
        id: 'log-003',
        event_type: 'task_status_change',
        review_task_id: taskId,
        operator_id: null,
        detail: { old_status: 'parsing', new_status: 'parsed', trigger: 'system' },
        occurred_at: '2026-04-15T10:02:30+08:00',
      },
      {
        id: 'log-004',
        event_type: 'task_status_change',
        review_task_id: taskId,
        operator_id: null,
        detail: { old_status: 'parsed', new_status: 'auto_reviewing', trigger: 'system' },
        occurred_at: '2026-04-15T10:02:31+08:00',
      },
      {
        id: 'log-005',
        event_type: 'task_status_change',
        review_task_id: taskId,
        operator_id: null,
        detail: { old_status: 'auto_reviewing', new_status: 'auto_reviewed', trigger: 'system' },
        occurred_at: '2026-04-15T10:05:00+08:00',
      },
      {
        id: 'log-006',
        event_type: 'task_status_change',
        review_task_id: taskId,
        operator_id: null,
        detail: { old_status: 'auto_reviewed', new_status: 'human_reviewing', trigger: 'system' },
        occurred_at: '2026-04-15T10:06:00+08:00',
      },
      {
        id: 'log-007',
        event_type: 'human_action',
        review_task_id: taskId,
        operator_id: 'user-reviewer-001',
        detail: { action: 'edit', risk_item_id: 'risk-002-uuid', operated_at: '2026-04-15T11:05:00+08:00' },
        occurred_at: '2026-04-15T11:05:00+08:00',
      },
      {
        id: 'log-008',
        event_type: 'human_action',
        review_task_id: taskId,
        operator_id: 'user-reviewer-001',
        detail: { action: 'approve', risk_item_id: 'risk-001-uuid', operated_at: '2026-04-15T11:08:00+08:00' },
        occurred_at: '2026-04-15T11:08:00+08:00',
      },
    ],
    total: 8,
    page: 1,
    page_size: 20,
  };
}

// ============ 上传 Mock ============
export function getMockUploadInit(filename: string, fileSize: number, totalParts: number) {
  const chunkUploadId = 'chunk-' + crypto.randomUUID();
  const parts = Array.from({ length: totalParts }, (_, i) => ({
    part_number: i + 1,
    presigned_url: `mock://s3-upload/${chunkUploadId}/part-${i + 1}`,
    expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
  }));
  return {
    chunk_upload_id: chunkUploadId,
    upload_parts: parts,
    session_expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
  };
}

export function getMockUploadComplete(chunkUploadId: string, filename: string, fileSize: number) {
  const newTaskId = 'task-new-' + crypto.randomUUID().slice(0, 8);
  return {
    document_id: 'doc-new-' + crypto.randomUUID().slice(0, 8),
    task_id: newTaskId,
    original_filename: filename,
    file_size_bytes: fileSize,
    status: 'uploaded',
  };
}

// ============ WebSocket Mock 模拟 ============
export function simulateWebSocketMessages(taskId: string, onMessage: (msg: WsMessage) => void): { close: () => void } {
  const timers: ReturnType<typeof setTimeout>[] = [];

  // 模拟解析进度
  const messages: { delay: number; msg: WsMessage }[] = [
    { delay: 500, msg: { event: 'upload_progress', task_id: taskId, progress: 20, message: '文件上传中...' } },
    { delay: 1500, msg: { event: 'upload_progress', task_id: taskId, progress: 40, message: '文件上传完成' } },
    { delay: 2500, msg: { event: 'parse_progress', task_id: taskId, stage: 'ocr', progress: 50, message: '文本提取中...' } },
    { delay: 4000, msg: { event: 'parse_progress', task_id: taskId, stage: 'ocr', progress: 65, message: 'OCR 识别中...' } },
    { delay: 5500, msg: { event: 'quality_check', task_id: taskId, progress: 78, message: '质量检测中...', data: { ocr_quality_score: 92.5, ocr_quality_level: 'high' } } },
    { delay: 7000, msg: { event: 'parse_complete', task_id: taskId, progress: 100, message: '解析完成', data: { document_type: 'procurement_contract' } } },
  ];

  messages.forEach(({ delay, msg }) => {
    timers.push(setTimeout(() => onMessage(msg), delay));
  });

  return {
    close: () => timers.forEach(clearTimeout),
  };
}

export function simulateAutoReviewMessages(taskId: string, onMessage: (msg: WsMessage) => void): { close: () => void } {
  const timers: ReturnType<typeof setTimeout>[] = [];

  const messages: { delay: number; msg: WsMessage }[] = [
    { delay: 1000, msg: { event: 'auto_review_layer1', task_id: taskId, message: 'Layer 1 完成：文档分类 — 采购合同', data: { document_type: 'procurement_contract' } } },
    { delay: 3000, msg: { event: 'auto_review_layer2', task_id: taskId, message: 'Layer 2 完成：识别 12 条规则匹配', data: { rule_matched_count: 12 } } },
    { delay: 6000, msg: { event: 'auto_review_layer3', task_id: taskId, message: 'Layer 3 完成：LLM 深度分析', data: {} } },
    { delay: 7500, msg: { event: 'auto_review_complete', task_id: taskId, message: '自动审核完成', data: { risk_level_summary: 'high', critical_count: 1, high_count: 3 } } },
    { delay: 8000, msg: { event: 'hitl_required', task_id: taskId, message: '需要人工审核', data: { assigned_reviewer_id: 'user-reviewer-001', sla_deadline: '2026-04-15T15:30:00+08:00' } } },
  ];

  messages.forEach(({ delay, msg }) => {
    timers.push(setTimeout(() => onMessage(msg), delay));
  });

  return { close: () => timers.forEach(clearTimeout) };
}