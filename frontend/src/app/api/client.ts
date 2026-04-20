/**
 * API Client - 基于 FastAPI 接口规范 v1.0
 * Base URL: /api/v1
 * 所有接口均需 Bearer Token (JWT) 认证
 */

import { getToken, ensureAuth } from './auth';

const BASE_URL = '/api/v1';
// WebSocket 通过 Vite proxy 转发，使用相对路径
const WS_BASE = `ws://${window.location.host}/ws/v1`;

function getHeaders(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  await ensureAuth();

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: { ...getHeaders(), ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    const message = (typeof detail === 'object' ? detail?.message : detail) || body?.message || res.statusText || '请求失败';
    const code = (typeof detail === 'object' ? detail?.code : null) || 'UNKNOWN';
    throw { code, message, status: res.status };
  }
  const json = await res.json();
  return json.data;
}

// ============ 文档上传接口 ============

export async function uploadInit(body: {
  original_filename: string;
  file_size_bytes: number;
  total_parts: number;
  content_type: string;
}) {
  return request<{
    chunk_upload_id: string;
    upload_parts: { part_number: number; presigned_url: string; expires_at: string }[];
    session_expires_at: string;
  }>('/upload/init', { method: 'POST', body: JSON.stringify(body) });
}

export async function uploadChunk(presignedUrl: string, chunk: Blob): Promise<string> {
  // MVP：后端返回的 presigned_url 为本地占位地址，PUT 会返回 404，但 complete_upload 不校验 ETag
  const res = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: chunk,
  });
  return res.headers.get('ETag') || '';
}

export async function uploadComplete(body: {
  chunk_upload_id: string;
  parts: { part_number: number; etag: string }[];
}) {
  return request<{
    document_id: string;
    task_id: string;
    original_filename: string;
    file_size_bytes: number;
    status: string;
  }>('/upload/complete', { method: 'POST', body: JSON.stringify(body) });
}

// ============ 文档列表接口 ============

export async function getDocuments(params?: {
  page?: number;
  page_size?: number;
  status?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  if (params?.status) qs.set('status', params.status);
  return request<{
    items: {
      document_id: string;
      task_id: string;
      original_filename: string;
      file_size_bytes: number;
      ocr_quality_level: string | null;
      ocr_quality_score: number | null;
      document_type: string | null;
      block_reason: string | null;
      task_status: string;
      created_at: string;
    }[];
    total: number;
    page: number;
    page_size: number;
  }>(`/documents?${qs}`);
}

// ============ 审核查询接口 ============

export async function getTaskDetail(taskId: string) {
  return request<{
    task: {
      id: string;
      status: string;
      assigned_reviewer_id: string | null;
      sla_deadline: string | null;
      completed_at: string | null;
      created_at: string;
    };
    document: {
      id: string;
      original_filename: string;
      file_size_bytes: number;
      ocr_quality_level: string;
      ocr_quality_score: number;
      document_type: string;
      block_reason: string | null;
    };
    review_result: {
      overall_risk_score: number;
      risk_level_summary: string;
      critical_count: number;
      high_count: number;
      medium_count: number;
      low_count: number;
      generated_at: string;
    } | null;
  }>(`/tasks/${taskId}`);
}

export async function getRiskItems(taskId: string, params?: {
  risk_level?: string;
  reviewer_status?: string;
  page?: number;
  page_size?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.risk_level) qs.set('risk_level', params.risk_level);
  if (params?.reviewer_status) qs.set('reviewer_status', params.reviewer_status);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  return request<{
    items: RiskItem[];
    total: number;
    page: number;
    page_size: number;
  }>(`/tasks/${taskId}/risk-items?${qs}`);
}

export async function getTaskResult(taskId: string) {
  return request<{
    task_id: string;
    overall_risk_score: number;
    risk_level_summary: string;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
    hitl_triggered: boolean;
    generated_at: string | null;
    completed_at: string | null;
    risk_items_summary: {
      risk_level: string;
      count: number;
      approved_count: number;
      edited_count: number;
      rejected_count: number;
    }[];
  }>(`/tasks/${taskId}/result`);
}

export async function getOperations(taskId: string, params?: { page?: number; page_size?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  return request<{
    items: {
      id: string;
      risk_item_id: string;
      operator_id: string;
      action: string;
      reject_reason: string | null;
      operated_at: string | null;
      edit_records: { original_value: any; new_value: any }[];
    }[];
    total: number;
    page: number;
    page_size: number;
  }>(`/tasks/${taskId}/operations?${qs}`);
}

export async function getAnnotations(taskId: string, riskItemId?: string) {
  const qs = new URLSearchParams();
  if (riskItemId) qs.set('risk_item_id', riskItemId);
  return request<{
    items: {
      id: string;
      review_task_id: string;
      risk_item_id: string | null;
      operator_id: string;
      content: string;
      created_at: string;
    }[];
    total: number;
  }>(`/tasks/${taskId}/annotations?${qs}`);
}

export async function getAuditLogs(taskId: string, params?: {
  event_type?: string;
  page?: number;
  page_size?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.event_type) qs.set('event_type', params.event_type);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  return request<{ items: any[]; total: number; page: number; page_size: number }>(`/tasks/${taskId}/audit-logs?${qs}`);
}

// ============ 人工审核接口 ============

export async function submitOperation(taskId: string, body: {
  risk_item_id: string;
  action: 'approve' | 'edit' | 'reject_item' | 'annotate';
  reject_reason?: string | null;
  edited_fields?: {
    risk_level?: string;
    risk_description?: string;
    reasoning?: string;
  } | null;
  operated_at: string;
}) {
  // 字段映射：reject_reason → comment，edited_fields → edited_content
  const backendBody = {
    decisions: [{
      risk_item_id: body.risk_item_id,
      action: body.action,
      comment: body.reject_reason ?? null,
      edited_content: body.edited_fields ?? null,
      operated_at: body.operated_at,
    }],
  };
  const result = await request<any>(`/tasks/${taskId}/operations`, {
    method: 'POST',
    body: JSON.stringify(backendBody),
  });
  const first = Array.isArray(result) ? result[0] : result;
  return {
    operation_id: first?.operation_id ?? ('op-' + crypto.randomUUID().slice(0, 8)),
    risk_item_id: body.risk_item_id,
    reviewer_status: first?.reviewer_status ?? 'pending',
    pending_critical_high_count: first?.pending_critical_high_count ?? 0,
  };
}

export async function addAnnotation(taskId: string, body: {
  risk_item_id?: string;
  content: string;
}) {
  return request<{
    annotation_id: string;
    review_task_id: string;
    risk_item_id: string | null;
    operator_id: string;
    content: string;
    created_at: string;
  }>(`/tasks/${taskId}/annotations`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function completeReview(taskId: string) {
  return request<{
    task_id: string;
    status: string;
    completed_at: string | null;
  }>(`/tasks/${taskId}/complete`, { method: 'POST', body: JSON.stringify({}) });
}

export async function rejectTask(taskId: string, rejectReason: string) {
  return request<{
    task_id: string;
    status: string;
  }>(`/tasks/${taskId}/reject`, { method: 'POST', body: JSON.stringify({ reason: rejectReason }) });
}

// ============ WebSocket ============

export function connectTaskWebSocket(taskId: string, onMessage: (data: WsMessage) => void) {
  const token = getToken() ?? '';
  const url = `${WS_BASE}/tasks/${taskId}/progress?token=${token}`;
  const ws = new WebSocket(url);
  let pingInterval: ReturnType<typeof setInterval>;

  ws.onopen = () => {
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'pong') return;
    onMessage(data as WsMessage);
  };

  ws.onclose = () => {
    clearInterval(pingInterval);
  };

  ws.onerror = (err) => {
    console.error('[WebSocket] 连接错误:', err);
  };

  return ws;
}

export function connectAutoReviewWebSocket(taskId: string, onMessage: (data: WsMessage) => void) {
  return connectTaskWebSocket(taskId, onMessage);
}

// ============ 后端未开发接口 ============

export async function getExtractions(_taskId: string): Promise<never> {
  throw new Error('【后端未开发】GET /api/v1/tasks/{task_id}/extractions 接口尚未实现');
}

export async function getDocument(_taskId: string): Promise<never> {
  throw new Error('【后端未开发】GET /api/v1/tasks/{task_id}/document 接口尚未实现');
}

export async function retryAutoReview(_taskId: string): Promise<never> {
  throw new Error('【后端未开发】POST /api/v1/tasks/{task_id}/retry 接口尚未实现');
}

export async function escalateToHuman(_taskId: string): Promise<never> {
  throw new Error('【后端未开发】POST /api/v1/tasks/{task_id}/escalate-to-human 接口尚未实现');
}

export async function reassign(_taskId: string): Promise<never> {
  throw new Error('【后端未开发】POST /api/v1/tasks/{task_id}/reassign 接口尚未实现');
}

// ============ Types ============

export interface RiskItem {
  id: string;
  task_id: string;
  risk_type: string;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  risk_description: string;
  confidence_score: number;
  confidence_category: 'fact' | 'clause' | 'legal';
  reasoning: string | null;
  location_page: number;
  location_paragraph: number;
  location_sentence_id: string | null;
  reviewer_status: 'pending' | 'approved' | 'edited' | 'reviewer_rejected';
  source_references: SourceReference[];
}

export interface SourceReference {
  source_type: 'law' | 'regulation' | 'standard' | 'internal_policy' | 'case_law';
  source_name: string;
  article_number: string | null;
  reference_text: string | null;
}

export interface WsMessage {
  event: string;
  task_id: string;
  stage?: string;
  progress?: number;
  message?: string;
  data?: Record<string, any>;
}
