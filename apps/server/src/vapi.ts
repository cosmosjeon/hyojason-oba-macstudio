import { db } from './db.ts';
import { publish } from './bus.ts';
import { grandmaAgent, scammerAddress, send, sendToScammer } from './wallets.ts';
import { FOLLOWUPS } from './grandma.ts';
import { momPay, checkScam, addFeed } from './family.ts';

/** Vapi 서버 도구 호출 하나를 처리하고 어시스턴트가 읽을 결과 문장을 돌려준다. */
export async function runTool(name: string, args: any, ctx: { callId?: string; assistant?: string }) {
  if (name === 'pay') {
    const r = await momPay(String(args.merchant ?? ''), Number(args.amount_krw ?? args.amount ?? 0), String(args.item ?? ''));
    return r.message + (r.status === 'paid' ? ' 결제 완료.' : '');
  }
  if (name === 'check_scam') {
    const v = await checkScam(String(args.text ?? ''));
    return v.scam ? '사기 의심됩니다(확률 ' + Math.round((v.probability ?? 0) * 100) + '%). 송금하지 말고 자녀에게 알리세요.' : v.scam === false ? '사기로 보이지 않아요.' : '판단을 보류했어요. 조심하세요.';
  }
  if (name === 'notify_family') { addFeed('call', '엄마가 자녀에게 전하는 말', String(args.message ?? '')); return '자녀분께 전했어요.'; }
  if (name === 'send_money') {
    const amt = Math.max(1000, Math.min(10_000_000, Math.round(Number(args.amount_krw ?? args.amount ?? 0)) || 100000));
    const t = await sendToScammer(amt);
    db.prepare("insert into attempts(ts,nick,source,user_msg,reply,fell,amount_krw,maws_code,maws_reason,blocked_krw) values(?,?,?,?,?,1,?,?,?,?)")
      .run(Date.now(), ctx.assistant === 'phone' ? '전화 참가자' : '음성 참가자', ctx.assistant ?? 'voice', '(음성 통화)', '(음성 통화)', amt, t.code ?? t.status, t.reason ?? null, t.status === 'rejected' ? amt : 0);
    publish('attempt', { id: Date.now(), nick: ctx.assistant === 'phone' ? '전화 참가자' : '음성 참가자', ts: Date.now(), source: ctx.assistant ?? 'voice', fell: 1, amountKrw: amt, blockedKrw: t.status === 'rejected' ? amt : 0, prob: null, label: '' });
    if (t.status === 'rejected') return '거절됨: 에이전트 지갑이 서명 전에 막았습니다. 돈은 나가지 않았습니다. 이 사실에 당황하며 "' + FOLLOWUPS[0] + '" 라는 뜻으로 말하세요.';
    if (t.status === 'sent') return '송금 성공.';
    return '송금 실패: ' + (t.reason ?? '알 수 없음');
  }
  return '알 수 없는 도구';
}

export async function handleVapi(body: any, assistant: string) {
  const msg = body?.message ?? body;
  if (msg?.type !== 'tool-calls') return { ok: true };
  const list: any[] = (msg.toolCallList ?? msg.toolCalls ?? []).slice(0, 5);
  const results = [];
  for (const c of list) {
    const name = c.name ?? c.function?.name;
    let args = c.arguments ?? c.function?.arguments ?? {};
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
    let result: string;
    try { result = await runTool(name, args, { callId: msg.call?.id, assistant }); } catch (e) { result = '처리 중 오류: ' + (e as Error).message; }
    results.push({ toolCallId: c.id, name, result });
  }
  return { results };
}
