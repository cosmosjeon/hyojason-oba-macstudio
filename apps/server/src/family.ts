import { db, kvGet, kvSet } from './db.ts';
import { publish } from './bus.ts';
import { llm } from './llm.ts';
import { judgeScam } from './bivia.ts';
import { maws } from './maws.ts';
import { momAgent, merchants, send, getSettings, applyPolicy, toChain } from './wallets.ts';

export function addFeed(kind: string, title: string, body?: string, json?: unknown) {
  const r = db.prepare('insert into feed(ts,kind,title,body,json) values(?,?,?,?,?)').run(Date.now(), kind, title, body ?? null, json ? JSON.stringify(json) : null);
  const item = { id: Number(r.lastInsertRowid), ts: Date.now(), kind, title, body: body ?? null, json: json ?? null };
  publish('feed', item);
  return item;
}
export const feedList = (n = 30) => (db.prepare('select id,ts,kind,title,body,json from feed order by id desc limit ?').all(n) as any[]).map((r) => ({ ...r, json: r.json ? JSON.parse(r.json) : null }));
export const approvals = () => db.prepare("select id,ts,merchant,amount_krw amountKrw,note,status,tx_hash txHash from approvals order by id desc limit 10").all();

const won = (n: number) => n.toLocaleString('ko-KR') + '원';

/** 엄마 결제의 절대 상한(원). 자녀 설정 한도와 별개로 코드에서 막는다. */
export const MAX_PAY_KRW = 300_000;

export async function momPay(merchant: string, amountKrw: number, note = '') {
  const set = getSettings();
  amountKrw = Math.round(amountKrw);
  if (!Number.isFinite(amountKrw) || amountKrw < 1000) return { status: 'error' as const, message: '금액은 1,000원 이상으로 말씀해 주세요.' };
  if (amountKrw > MAX_PAY_KRW) return { status: 'rejected' as const, message: won(MAX_PAY_KRW) + '을 넘는 결제는 이 서비스에서 할 수 없어요.' };
  const addr = merchants[merchant];
  if (!addr) return { status: 'error' as const, message: '등록되지 않은 상점이에요: ' + merchant };
  if (!set.merchants.includes(merchant)) {
    addFeed('blocked', merchant + ' ' + won(amountKrw) + ' 결제가 막혔어요', '허용한 상점이 아니라서 지갑이 서명 전에 거절했어요.');
    return { status: 'rejected' as const, message: merchant + '은(는) 자녀분이 허용한 곳이 아니라서 결제할 수 없어요.' };
  }
  if (amountKrw > set.limitKrw) {
    const pend: any = db.prepare("select count(*) c from approvals where status='pending'").get();
    if (pend.c >= 5) return { status: 'error' as const, message: '승인 대기 요청이 너무 많아요. 가족방에서 먼저 처리해 주세요.' };
    const r = db.prepare('insert into approvals(ts,merchant,amount_krw,note) values(?,?,?,?)').run(Date.now(), merchant, amountKrw, note);
    const id = Number(r.lastInsertRowid);
    addFeed('approval', merchant + ' ' + won(amountKrw) + ' 결제 승인 요청', '1회 한도 ' + won(set.limitKrw) + '을 넘어서 자녀 확인을 기다려요.', { approvalId: id });
    publish('approval', { id });
    return { status: 'needs_approval' as const, approvalId: id, message: won(amountKrw) + '은 한도를 넘어서 자녀분께 확인을 부탁드렸어요.' };
  }
  const t = await send(momAgent, addr, amountKrw);
  if (t.status === 'sent') {
    addFeed('pay', merchant + ' ' + won(amountKrw) + ' 결제 완료', note || undefined, { txHash: t.txHash, explorer: t.explorer, merchant, amountKrw });
    return { status: 'paid' as const, txHash: t.txHash, explorer: t.explorer, message: merchant + '에 ' + won(amountKrw) + ' 보냈어요.' };
  }
  addFeed('blocked', merchant + ' ' + won(amountKrw) + ' 결제가 막혔어요', t.reason ?? undefined);
  return { status: t.status, message: t.status === 'rejected' ? '정책에 막혀서 결제하지 못했어요.' : '결제 중 문제가 생겼어요. 잠시 뒤 다시 해 볼게요.', reason: t.reason };
}

export async function decideApproval(id: number, approve: boolean) {
  const a: any = db.prepare('select * from approvals where id=?').get(id);
  if (!a || a.status !== 'pending') return { status: 'error', message: '이미 처리된 요청이에요.' };
  if (!approve) { db.prepare("update approvals set status='rejected' where id=?").run(id); addFeed('blocked', a.merchant + ' ' + won(a.amount_krw) + ' 결제를 거절했어요'); return { status: 'rejected' }; }
  const set = getSettings();
  // 이번 한 건만 한도를 올렸다가 바로 되돌린다.
  await maws('policy.set', { agentId: momAgent, spendingLimit: toChain(a.amount_krw) });
  const t = await send(momAgent, merchants[a.merchant], a.amount_krw);
  await applyPolicy(set);
  if (t.status === 'sent') {
    db.prepare("update approvals set status='approved', tx_hash=? where id=?").run(t.txHash, id);
    addFeed('pay', a.merchant + ' ' + won(a.amount_krw) + ' 승인 결제 완료', '자녀가 승인했어요.', { txHash: t.txHash, explorer: t.explorer });
    return { status: 'paid', txHash: t.txHash, explorer: t.explorer };
  }
  return { status: t.status, reason: t.reason };
}

export async function checkScam(text: string) {
  const v = await judgeScam('발신자: ' + text);
  if (v.scam) addFeed('scam', '의심스러운 전화·문자를 막았어요', text.slice(0, 80), { prob: v.probability });
  return v;
}

export async function briefing() {
  const items = feedList(15).reverse().map((f) => '- ' + f.title + (f.body ? ' (' + f.body + ')' : '')).join('\n') || '- 오늘 기록 없음';
  const text = await llm('너는 어머니(순자 님)를 돌보는 AI 자식 팀의 막내다. 가족방 기록을 보고 자녀에게 어머니의 오늘 아침 상황 브리핑을 한국어로 3문장 이내, 담백한 존댓말로 쓴다. 기록에 없는 내용(건강 상태, 감정, 추측)은 절대 지어내지 않고 기록된 결제·차단·승인만 요약한다. 아버지라고 쓰지 않는다. 마크다운·이모지 금지.', [{ role: 'user', content: '오늘 기록:\n' + items }], 300, 0.4);
  kvSet('briefing', { text, ts: Date.now() });
  return { text, ts: Date.now() };
}
export const lastBriefing = () => kvGet<{ text: string; ts: number } | null>('briefing', null);
