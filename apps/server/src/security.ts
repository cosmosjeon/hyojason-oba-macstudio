import type { Context, MiddlewareHandler } from 'hono';
import crypto from 'node:crypto';

const buckets = new Map<string, { n: number; reset: number }>();
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60_000).unref();

export function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return xff || c.req.header('cf-connecting-ip') || 'local';
}

/** IP당 윈도우 안에서 max번까지만 허용한다. */
export function rateLimit(name: string, max: number, windowMs: number): MiddlewareHandler {
  return async (c, next) => {
    const key = name + ':' + clientIp(c);
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.reset < now) buckets.set(key, { n: 1, reset: now + windowMs });
    else if (++b.n > max) {
      c.header('retry-after', String(Math.ceil((b.reset - now) / 1000)));
      return c.json({ error: '요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.', retryAfterMs: b.reset - now }, 429);
    }
    await next();
  };
}

/** 모든 IP를 합친 전역 한도(유료 API 보호). */
export function globalLimit(name: string, max: number, windowMs: number): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now(); const b = buckets.get('g:' + name);
    if (!b || b.reset < now) buckets.set('g:' + name, { n: 1, reset: now + windowMs });
    else if (++b.n > max) return c.json({ error: '지금 요청이 몰렸어요. 잠시 뒤 다시 시도해 주세요.' }, 429);
    await next();
  };
}

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** ADMIN_TOKEN을 x-admin-token 헤더로 보낸 요청만 통과. 토큰이 설정되지 않았으면 전부 막는다. */
export const adminOnly: MiddlewareHandler = async (c, next) => {
  const want = process.env.ADMIN_TOKEN;
  const got = c.req.header('x-admin-token') ?? '';
  if (!want || !safeEq(got, want)) return c.json({ error: 'admin' }, 401);
  await next();
};

/** Vapi가 서버 URL 호출에 붙이는 비밀 헤더를 확인한다. */
export const vapiOnly: MiddlewareHandler = async (c, next) => {
  const want = process.env.VAPI_WEBHOOK_SECRET;
  const got = c.req.header('x-vapi-secret') ?? (c.req.header('authorization')?.replace(/^Bearer /i, '') ?? '');
  if (!want || !safeEq(got, want)) return c.json({ error: 'forbidden' }, 403);
  await next();
};

export function allowedOrigins(): Set<string> {
  const s = new Set<string>();
  const port = process.env.PORT || '8787';
  for (const o of [process.env.PUBLIC_URL, 'http://localhost:' + port, 'http://127.0.0.1:' + port, 'http://localhost:5173', ...(process.env.ALLOWED_ORIGINS ?? '').split(',')]) {
    const t = o?.trim().replace(/\/$/, ''); if (t) s.add(t);
  }
  return s;
}

/** 브라우저의 교차 출처 요청은 허용 목록 밖이면 거절하고, 허용 출처에만 CORS 헤더를 붙인다. */
export const originGuard: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('origin');
  if (origin) {
    if (!allowedOrigins().has(origin)) {
      if (c.req.method === 'OPTIONS') return c.body(null, 403);
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return c.json({ error: 'forbidden origin' }, 403);
    } else {
      c.header('access-control-allow-origin', origin); c.header('vary', 'Origin');
      c.header('access-control-allow-headers', 'content-type, x-admin-token'); c.header('access-control-allow-methods', 'GET, POST, OPTIONS');
      if (c.req.method === 'OPTIONS') return c.body(null, 204);
    }
  }
  await next();
};

export const clampInt = (v: unknown, min: number, max: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
export const cleanText = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
