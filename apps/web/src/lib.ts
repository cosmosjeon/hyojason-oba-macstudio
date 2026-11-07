import * as React from 'react';
export const won = (n: number) => (n || 0).toLocaleString('ko-KR') + '원';
export async function api<T = any>(path: string, body?: unknown, retried = false): Promise<T & { error?: string; retryAfterMs?: number }> {
  const headers: Record<string, string> = {};
  const key = localStorage.getItem('hjs-admin');
  if (key) headers['x-admin-token'] = key;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(path, body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) });
  // 자녀 설정·승인·AI 대결은 관리자 키가 있어야 한다. 한 번 묻고 이 기기에 저장한다.
  if (r.status === 401 && !retried) {
    const k = window.prompt('관리자 키를 입력해 주세요');
    if (k) { localStorage.setItem('hjs-admin', k.trim()); return api<T>(path, body, true); }
    return { error: '관리자 키가 필요해요.' } as any;
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { localStorage.removeItem('hjs-admin'); return { error: '관리자 키가 맞지 않아요.' } as any; }
  return j;
}
export function useStoredState(key: string, init: string): [string, (v: string) => void] {
  const [v, setV] = React.useState(() => localStorage.getItem(key) ?? init);
  return [v, (n: string) => { localStorage.setItem(key, n); setV(n); }];
}
export const sessionId = () => { let s = localStorage.getItem('hjs-session'); if (!s) { s = Math.random().toString(36).slice(2, 12); localStorage.setItem('hjs-session', s); } return s; };
export const pct = (p: number | null | undefined) => (p == null ? null : Math.round(p * 100));
export const timeAgo = (ts: number) => { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 60 ? '방금' : s < 3600 ? Math.floor(s / 60) + '분 전' : Math.floor(s / 3600) + '시간 전'; };
export const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
