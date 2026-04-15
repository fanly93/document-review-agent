/**
 * API Client - 基于 FastAPI 接口规范 v1.0
 * Base URL: /api/v1
 * 所有接口均需 Bearer Token (JWT) 认证
 *
 * 当前模式：真实后端（USE_MOCK = false）
 * 未开发接口保留 mock 数据并在 console 中标注
 */

import {
  getMockTaskResult,
  getMockOperations,
  getMockAnnotations,
  simulateAutoReviewMessages,
} from './mock-data';
import { getToken, ensureAuth } from './auth';

const USE_MOCK = false;

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
  // 确保登录（无 token 时自动登录）
  await ensureAuth();

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: { ...getHeaders(), ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ code: 'UNKNOWN', message: res.statusText }));
    throw err;
  }
  const json = await res.json();
  return json.data;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// 用于存储上传过程中的文件信息
const uploadSessions: Record<string, { filename: string; fileSize: number }> = {};

// ============ 四、文档上传接口 ============

export async function uploadInit(body: {
  original_filename: string;
  file_size_bytes: number;
  total_parts: number;
  content_type: string;
}) {
  if (USE_MOCK) {
    await delay(300);
    const result = getMockUploadInit(body.original_filename, body.file_size_bytes, body.total_parts);
    uploadSessions[result.chunk_upload_id] = {
      filename: body.original_filename,
      fileSize: body.file_size_bytes,
    };
    return result;
  }
  return request<{
    chunk_upload_id: string;
    upload_parts: { part_number: number; presigned_url: string; expires_at: string }[];
    session_expires_at: string;
  }>('/upload/init', { method: 'POST', body: JSON.stringify(body) });
}

export async function uploadChunk(presignedUrl: string, chunk: Blob): Promise<string> {
  if (USE_MOCK) {
    await delay(200 + Math.random() * 300);
    return `"mock-etag-${Date.now()}"`;
  }
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
  if (USE_MOCK) {
    await delay(500);
    const session = uploadSessions[body.chunk_upload_id];
    return getMockUploadComplete(
      body.chunk_upload_id,
      session?.filename || '未知文件.pdf',
      session?.fileSize || 0
    );
  }
  return request<{
    document_id: string;
    task_id: string;
    original_filename: string;
    file_size_bytes: number;
    status: string;
  }>('/upload/complete', { method: 'POST', body: JSON.stringify(body) });
}

export async function getDocuments(params?: {
  page?: number;
  page_size?: number;
  status?: string;
}) {
  // 【后端未开发】GET /api/v1/documents 文档列表接口后端尚未实现，使用 mock 数据
  console.warn('【后端未开发】GET /api/v1/documents — 返回 mock 数据');
  await delay(200);
  const { MOCK_DOCUMENTS } = await import('./mock-data');
  let items = [...MOCK_DOCUMENTS];
  if (params?.status) {
    const statuses = params.status.split(',');
    items = items.filter((i) => statuses.includes(i.task_status));
  }
  const page = params?.page || 1;
  const pageSize = params?.page_size || 20;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    page_size: pageSize,
  };
}

// ============ 五、审核查询接口 ============

export async function getTaskDetail(taskId: string) {
  if (USE_MOCK) {
    await delay(200);
    return getMockTaskDetail(taskId);
  }
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
  if (USE_MOCK) {
    await delay(200);
    let items = getMockRiskItems(taskId);
    if (params?.risk_level) {
      const levels = params.risk_level.split(',');
      items = items.filter((i) => levels.includes(i.risk_level));
    }
    if (params?.reviewer_status) {
      items = items.filter((i) => i.reviewer_status === params.reviewer_status);
    }
    return { items, total: items.length, page: 1, page_size: 50 };
  }
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
  // 【后端未开发】GET /api/v1/tasks/{task_id}/result 接口后端尚未实现，使用 mock 数据
  console.warn('【后端未开发】GET /tasks/{task_id}/result — 返回 mock 数据');
  await delay(200);
  return getMockTaskResult(taskId);
}

export async function getOperations(taskId: string, params?: { page?: number; page_size?: number }) {
  // 【后端未开发】GET /api/v1/tasks/{task_id}/operations 接口后端尚未实现，使用 mock 数据
  console.warn('【后端未开发】GET /tasks/{task_id}/operations — 返回 mock 数据');
  await delay(150);
  return getMockOperations(taskId);
}

export async function getAnnotations(taskId: string, riskItemId?: string) {
  // 【后端未开发】GET /api/v1/tasks/{task_id}/annotations 接口后端尚未实现，使用 mock 数据
  console.warn('【后端未开发】GET /tasks/{task_id}/annotations — 返回 mock 数据');
  await delay(150);
  return getMockAnnotations(taskId);
}

export async function getAuditLogs(taskId: string, params?: {
  event_type?: string;
  page?: number;
  page_size?: number;
}) {
  if (USE_MOCK) {
    await delay(200);
    return getMockAuditLogs(taskId);
  }
  const qs = new URLSearchParams();
  if (params?.event_type) qs.set('event_type', params.event_type);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  return request<{ items: any[]; total: number; page: number; page_size: number }>(`/tasks/${taskId}/audit-logs?${qs}`);
}

// ============ 六、人工审核接口 ============

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
  // 后端接口契约：POST /tasks/{task_id}/operations
  // 请求体为 { decisions: [{ risk_item_id, action, comment, edited_content, operated_at }] }
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
  // 后端返回批量结果，取第一条适配前端单条格式
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
  // 【后端未开发】POST /api/v1/tasks/{task_id}/annotations 接口后端尚未实现
  console.warn('【后端未开发】POST /tasks/{task_id}/annotations — 返回 mock 响应');
  await delay(200);
  return {
    annotation_id: 'ann-' + crypto.randomUUID().slice(0, 8),
    review_task_id: taskId,
    risk_item_id: body.risk_item_id,
    operator_id: 'mock-reviewer',
    content: body.content,
    created_at: new Date().toISOString(),
  };
}

export async function completeReview(taskId: string) {
  // 【后端未开发】POST /api/v1/tasks/{task_id}/complete 接口后端尚未实现
  console.warn('【后端未开发】POST /tasks/{task_id}/complete — 返回 mock 响应');
  await delay(400);
  return {
    task_id: taskId,
    status: 'completed',
    completed_at: new Date().toISOString(),
  };
}

export async function rejectTask(taskId: string, rejectReason: string) {
  // 后端字段名为 reason（非 reject_reason）
  return request<{
    task_id: string;
    status: string;
  }>(`/tasks/${taskId}/reject`, { method: 'POST', body: JSON.stringify({ reason: rejectReason }) });
}

// ============ 七、WebSocket ============

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