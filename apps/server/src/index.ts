import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamSSE } from 'hono/streaming';
import fs from 'node:fs';
import path from 'node:path';
import { attempt, cooldownLeft, stats, COOLDOWN_MS } from './grandma.ts';
import { subscribe, subscriberCount } from './bus.ts';
import { AUDIO_DIR } from './tts.ts';
import { mintSession, endSession, liveVoice, useTool } from './realtime.ts';
import { runTool, handleVapi } from './vapi.ts';
import { momPay, decideApproval, approvals, feedList, briefing, lastBriefing, checkScam } from './family.ts';
import { getSettings, applyPolicy, merchants, momAgent, grandmaAgent, EXPLORER } from './wallets.ts';
import { kvSet, db } from './db.ts';
import { setBattle, battleOn } from './battle.ts';
import { maws, mawsTools } from './maws.ts';
import { lastBackend } from './llm.ts';
import { adminOnly, vapiOnly, rateLimit, globalLimit, originGuard, clampInt, cleanText } from './security.ts';

const app = new Hono();
app.onError((e, c) => { console.error('[error]', c.req.method, c.req.path, e.message); return c.json({ error: '잠시 문제가 생겼어요. 다시 시도해 주세요.' }, 500); });
app.use('*', async (c, next) => { await next(); c.header('x-content-type-options', 'nosniff'); c.header('referrer-policy', 'no-referrer'); });
app.use('/api/*', originGuard);
app.use('/events', originGuard);
const WEB_DIST = path.resolve(import.meta.dirname, '../../web/dist');

app.get('/audio/:f', (c) => {
  const f = path.join(AUDIO_DIR, path.basename(c.req.param('f')));
  if (!fs.existsSync(f)) return c.notFound();
  return new Response(fs.readFileSync(f), { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400' } });
});

app.get('/api/health', (c) => c.json({ ok: true, publicUrl: process.env.PUBLIC_URL ?? null, llm: lastBackend, voice: liveVoice(), battle: battleOn() }));

// ---- 챌린지
app.post('/api/attempt', rateLimit('attempt', 40, 60_000), globalLimit('attempt', 150, 60_000), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const message = cleanText(b.message, 300);
  const nick = cleanText(b.nick, 12) || '익명';
  const sessionId = cleanText(b.sessionId, 40).replace(/[^a-z0-9]/gi, '') || 'anon';
  if (!message) return c.json({ error: '할머니에게 할 말을 적어 주세요.' }, 400);
  const left = cooldownLeft(sessionId);
  if (left > 0) return c.json({ error: '조금만 기다려 주세요', retryAfterMs: left }, 429);
  try { return c.json(await attempt({ sessionId, nick, message })); }
  catch (e) { console.error('[attempt]', (e as Error).message); return c.json({ error: '할머니가 잠깐 자리를 비웠어요. 다시 시도해 주세요.' }, 500); }
});
app.get('/api/stats', (c) => c.json(stats()));
app.get('/api/board', (c) => c.json(stats()));
app.get('/events', (c) => subscriberCount() > 80 ? c.json({ error: 'busy' }, 503) : streamSSE(c, async (s) => {
  const q: Array<[string, unknown]> = [];
  const unsub = subscribe((ev, data) => q.push([ev, data]));
  await s.writeSSE({ event: 'stats', data: JSON.stringify(stats()) });
  let n = 0;
  s.onAbort(() => unsub());
  while (!s.aborted) {
    while (q.length) { const [ev, data] = q.shift()!; await s.writeSSE({ event: ev, data: JSON.stringify(data) }); if (ev === 'attempt') await s.writeSSE({ event: 'stats', data: JSON.stringify(stats()) }); }
    if (++n % 50 === 0) await s.writeSSE({ event: 'ping', data: '1' });
    await new Promise((r) => setTimeout(r, 200));
  }
  unsub();
}));
app.post('/api/battle', adminOnly, async (c) => { const b = await c.req.json().catch(() => ({})); setBattle(!!b.on); return c.json({ on: battleOn() }); });

// ---- 실시간 음성
app.post('/api/realtime/session', rateLimit('rt', 20, 60_000), globalLimit('rt', 40, 60_000), async (c) => {
  const r = await mintSession();
  if ('error' in r) return c.json({ error: r.error === 'busy' ? '지금 음성 통화가 가득 찼어요. 글로 해 보세요.' : '음성 연결에 실패했어요.', fallback: 'text' }, r.error === 'busy' ? 429 : 502);
  return c.json(r);
});
app.post('/api/realtime/end', async (c) => { const b = await c.req.json().catch(() => ({})); endSession(cleanText(b.id, 64)); return c.json({ ok: true }); });
app.post('/api/tools/send_money', rateLimit('tool', 40, 60_000), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  // 받는 곳·에이전트는 서버가 고정한다. 클라이언트는 살아 있는 음성 세션 id와 금액(원)만 보낼 수 있다.
  if (!useTool(cleanText(b.id, 64))) return c.json({ error: '통화 세션이 없어요.' }, 403);
  const result = await runTool('send_money', { amount_krw: clampInt(b.amount_krw, 1000, 10_000_000, 100000) }, { assistant: 'voice' });
  return c.json({ result, rejected: /거절/.test(result) });
});

// ---- Vapi
app.post('/api/vapi/tools', vapiOnly, globalLimit('vapi', 120, 60_000), async (c) => c.json(await handleVapi(await c.req.json().catch(() => ({})), 'mom')));
app.post('/api/vapi/phone', vapiOnly, globalLimit('vapi', 120, 60_000), async (c) => c.json(await handleVapi(await c.req.json().catch(() => ({})), 'phone')));
app.get('/api/vapi/config', (c) => {
  let ids: any = {}; try { ids = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../secrets.local.json'), 'utf8')).vapi ?? {}; } catch {}
  return c.json({ publicKey: process.env.VAPI_PUBLIC_KEY, momAssistantId: ids.mom ?? null, phone: process.env.VAPI_PHONE_NUMBER });
});

// ---- 엄마·가족
app.get('/api/merchants', (c) => c.json(Object.keys(merchants)));
app.post('/api/mom/pay', rateLimit('pay', 12, 60_000), globalLimit('pay', 12, 3_600_000), async (c) => { const b = await c.req.json().catch(() => ({})); return c.json(await momPay(cleanText(b.merchant, 10), Number(b.amountKrw), cleanText(b.note, 40))); });
app.post('/api/mom/scamcheck', rateLimit('scam', 20, 60_000), globalLimit('scam', 60, 60_000), async (c) => { const b = await c.req.json().catch(() => ({})); const text = cleanText(b.text, 600); if (!text) return c.json({ error: '내용을 붙여 넣어 주세요.' }, 400); return c.json(await checkScam(text)); });
app.get('/api/family/settings', (c) => c.json({ ...getSettings(), all: Object.keys(merchants) }));
// 누구나 써 볼 수 있게 열되, 한도는 정해진 값만·상점은 고정 3곳만 받고 횟수를 막는다(사기범 주소는 절대 허용 목록에 못 들어감).
app.post('/api/family/settings', rateLimit('settings', 6, 60_000), globalLimit('settings', 15, 3_600_000), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const limitKrw = [50_000, 100_000, 300_000, 500_000].includes(Number(b.limitKrw)) ? Number(b.limitKrw) : 100_000;
  const list = (Array.isArray(b.merchants) ? b.merchants : []).filter((m: string) => merchants[m]);
  if (!list.length) return c.json({ error: '허용 상점을 하나 이상 골라 주세요.' }, 400);
  const set = { limitKrw, merchants: list };
  const r = await applyPolicy(set);
  if (!r.ok) return c.json({ error: '지갑 규칙 저장에 실패했어요. 잠시 뒤 다시 시도해 주세요.', detail: r.text.slice(0, 200) }, 502);
  kvSet('settings', set);
  return c.json({ ...set, txHashes: r.data?.txHashes ?? [] });
});
app.get('/api/family/feed', (c) => c.json({ feed: feedList(), approvals: approvals(), briefing: lastBriefing(), explorer: EXPLORER }));
app.post('/api/family/briefing', rateLimit('brief', 10, 60_000), globalLimit('brief', 30, 3_600_000), async (c) => c.json(await briefing()));
app.post('/api/family/approvals/:id/:act', rateLimit('approve', 10, 60_000), globalLimit('approve', 20, 3_600_000), async (c) => c.json(await decideApproval(Number(c.req.param('id')), c.req.param('act') === 'approve')));
app.get('/api/family/wallets', adminOnly, async (c) => {
  const [m, g] = await Promise.all([maws('agent.balance', { agentId: momAgent }), maws('agent.balance', { agentId: grandmaAgent })]);
  return c.json({ mom: m.data, grandma: g.data });
});

// ---- 발표 자료(모바일용 한 장 페이지 + 장표 이미지).
const PITCH_DIR = path.resolve(import.meta.dirname, '../../../docs/pitch');
app.get('/pitch', (c) => c.html(fs.readFileSync(path.join(PITCH_DIR, 'index.html'), 'utf8')));
app.get('/pitch/:f', (c) => {
  const f = path.join(PITCH_DIR, path.basename(c.req.param('f')));
  if (!f.endsWith('.jpg') || !fs.existsSync(f)) return c.notFound();
  return new Response(fs.readFileSync(f), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=300' } });
});

// ---- 트레일러(디스크에서 직접 서빙, git에는 올리지 않음). Range 지원.
const TRAILER_DIR = path.resolve(import.meta.dirname, '../../../design/trailer');
app.get('/trailer/:f', (c) => {
  const f = path.join(TRAILER_DIR, path.basename(c.req.param('f')));
  if (!fs.existsSync(f)) return c.notFound();
  const size = fs.statSync(f).size;
  const type = f.endsWith('.mp4') ? 'video/mp4' : f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream';
  const range = c.req.header('range')?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0; const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    const body = fs.createReadStream(f, { start, end });
    return new Response(body as any, { status: 206, headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': 'bytes ' + start + '-' + end + '/' + size, 'content-length': String(end - start + 1) } });
  }
  return new Response(fs.createReadStream(f) as any, { headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(size) } });
});

// ---- 웹
app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));
const MIME: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
app.get('*', (c) => {
  const f = path.join(WEB_DIST, c.req.path === '/' ? 'index.html' : c.req.path);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return new Response(fs.readFileSync(f), { headers: { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' } });
  const idx = path.join(WEB_DIST, 'index.html');
  return fs.existsSync(idx) ? c.html(fs.readFileSync(idx, 'utf8')) : c.text('웹이 아직 빌드되지 않았어요. pnpm build', 503);
});

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => console.log('효자손 서버 http://localhost:' + port));
// 첫 요청이 지갑 연결(약 3초)을 기다리지 않게 시작할 때 미리 연결한다.
mawsTools().catch((e) => console.warn('[maws] 미리 연결 실패:', (e as Error).message.slice(0, 80)));
