/**
 * 认证模块 — 预置账号自动登录（联调阶段）
 * 账号来源：frontend/.env.local（不提交）
 * 变量：VITE_DEV_EMAIL / VITE_DEV_PASSWORD
 * 默认值：test_legal@example.com / test123456
 */

const TOKEN_KEY = 'dev_access_token';
const BASE_URL = '/api/v1';

export interface AuthInfo {
  access_token: string;
  user_id: string;
  role: string;
}

/** 从 localStorage 读取当前 token */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** 存储 token */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** 清除 token */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** 自动登录（预置账号）— 失败则抛出错误 */
export async function autoLogin(): Promise<AuthInfo> {
  const email = import.meta.env.VITE_DEV_EMAIL || 'test_legal@example.com';
  const password = import.meta.env.VITE_DEV_PASSWORD || 'test123456';

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    // 登录失败则尝试注册后重新登录
    await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: '联调测试账号', role: 'legal_staff' }),
    });
    const retry = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!retry.ok) throw new Error('自动登录失败，请检查后端服务是否启动');
    const retryJson = await retry.json();
    setToken(retryJson.data.access_token);
    return retryJson.data as AuthInfo;
  }

  const json = await res.json();
  setToken(json.data.access_token);
  return json.data as AuthInfo;
}

/** 确保已登录，返回有效 token；无 token 时触发自动登录 */
export async function ensureAuth(): Promise<string> {
  const token = getToken();
  if (token) return token;
  const info = await autoLogin();
  return info.access_token;
}
