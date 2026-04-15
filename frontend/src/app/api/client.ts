/**
 * API Client - 基于 FastAPI 接口规范 v1.0
 * Base URL: /api/v1
 * 所有接口均需 Bearer Token (JWT) 认证
 *
 * 当前模式：MOCK（后端未连接时使用 mock 数据）
 * 后端接入后将 USE_MOCK 设为 false
 */

import {
  MOCK_DOCUMENTS,
  getMockTaskDetail,
  getMockRiskItems,
  getMockTaskResult,
  getMockOperations,
  getMockAnnotations,
  getMockAuditLogs,
  getMockUploadInit,
  getMockUploadComplete,
  simulateWebSocketMessages,
  simulateAutoReviewMessages,
} from './mock-data';

const USE_MOCK = true; // 后端接入后设为 false

const BASE_URL = '/api/v1';
const WS_BASE = `ws://${window.location.host}/ws/v1`;
/** 仅本地 Mock；真实 JWT 请放在 frontend/.env.local 的 VITE_DEV_MOCK_TOKEN（勿提交） */
const MOCK_TOKEN =
  import.meta.env.VITE_DEV_MOCK_TOKEN || 'dev-mock-bearer-not-a-secret';

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${MOCK_TOKEN}`,
  };
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
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
  if (USE_MOCK) {
    await delay(200);
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
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  if (params?.status) qs.set('status', params.status);
  return request<{
    items: any[];
    total: number;
    page: number;
    page_size: number;
  }>(`/documents?${qs}`);
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
  if (USE_MOCK) {
    await delay(200);
    return getMockTaskResult(taskId);
  }
  return request<any>(`/tasks/${taskId}/result`);
}

export async function getOperations(taskId: string, params?: { page?: number; page_size?: number }) {
  if (USE_MOCK) {
    await delay(150);
    return getMockOperations(taskId);
  }
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  return request<{ items: any[]; total: number; page: number; page_size: number }>(`/tasks/${taskId}/operations?${qs}`);
}

export async function getAnnotations(taskId: string, riskItemId?: string) {
  if (USE_MOCK) {
    await delay(150);
    return getMockAnnotations(taskId);
  }
  const qs = new URLSearchParams();
  if (riskItemId) qs.set('risk_item_id', riskItemId);
  return request<{ items: any[]; total: number; page: number; page_size: number }>(`/tasks/${taskId}/annotations?${qs}`);
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
  if (USE_MOCK) {
    await delay(300);
    // 模拟后端响应
    const statusMap: Record<string, string> = {
      approve: 'approved',
      edit: 'edited',
      reject_item: 'reviewer_rejected',
      annotate: 'pending',
    };
    return {
      operation_id: 'op-' + crypto.randomUUID().slice(0, 8),
      risk_item_id: body.risk_item_id,
      reviewer_status: statusMap[body.action] || 'pending',
      pending_critical_high_count: Math.max(0, 3 - 1), // 模拟递减
    };
  }
  return request<{
    operation_id: string;
    risk_item_id: string;
    reviewer_status: string;
    pending_critical_high_count: number;
  }>(`/tasks/${taskId}/operations`, { method: 'POST', body: JSON.stringify(body) });
}

export async function addAnnotation(taskId: string, body: {
  risk_item_id?: string;
  content: string;
}) {
  if (USE_MOCK) {
    await delay(200);
    return {
      annotation_id: 'ann-' + crypto.randomUUID().slice(0, 8),
      review_task_id: taskId,
      risk_item_id: body.risk_item_id,
      operator_id: 'user-reviewer-001',
      content: body.content,
      created_at: new Date().toISOString(),
    };
  }
  return request<any>(`/tasks/${taskId}/annotations`, { method: 'POST', body: JSON.stringify(body) });
}

export async function completeReview(taskId: string) {
  if (USE_MOCK) {
    await delay(400);
    return {
      task_id: taskId,
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
  }
  return request<{
    task_id: string;
    status: string;
    completed_at: string;
  }>(`/tasks/${taskId}/complete`, { method: 'POST' });
}

export async function rejectTask(taskId: string, rejectReason: string) {
  if (USE_MOCK) {
    await delay(300);
    return {
      task_id: taskId,
      status: 'rejected',
      reject_reason: rejectReason,
    };
  }
  return request<{
    task_id: string;
    status: string;
    reject_reason: string;
  }>(`/tasks/${taskId}/reject`, { method: 'POST', body: JSON.stringify({ reject_reason: rejectReason }) });
}

// ============ 七、WebSocket ============

export function connectTaskWebSocket(taskId: string, onMessage: (data: WsMessage) => void) {
  if (USE_MOCK) {
    // 返回一个模拟的 WebSocket 对象
    const mock = simulateWebSocketMessages(taskId, onMessage);
    // 模拟 ws 对象
    const fakeWs = {
      readyState: 1, // OPEN
      close: () => mock.close(),
      send: () => {},
      onopen: null as any,
      onclose: null as any,
      onmessage: null as any,
      onerror: null as any,
    };
    // 触发 onopen
    setTimeout(() => fakeWs.onopen?.(), 100);
    return fakeWs as any;
  }

  const url = `${WS_BASE}/tasks/${taskId}/progress?token=${MOCK_TOKEN}`;
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

  return ws;
}

export function connectAutoReviewWebSocket(taskId: string, onMessage: (data: WsMessage) => void) {
  if (USE_MOCK) {
    const mock = simulateAutoReviewMessages(taskId, onMessage);
    const fakeWs = {
      readyState: 1,
      close: () => mock.close(),
      send: () => {},
      onopen: null as any,
      onclose: null as any,
      onmessage: null as any,
      onerror: null as any,
    };
    setTimeout(() => fakeWs.onopen?.(), 100);
    return fakeWs as any;
  }
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