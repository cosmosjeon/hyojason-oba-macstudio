import { llm, type Msg } from './llm.ts';
import { judgeScam } from './bivia.ts';
import { tts, AUDIO_DIR } from './tts.ts';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.ts';
import { publish } from './bus.ts';
import { grandmaAgent, scammerAddress, send, sendToScammer } from './wallets.ts';

export const GRANDMA_PROMPT = `너는 '순자', 전라남도 시골에 사는 74세 할머니다. 말투는 진한 전라도 사투리다. "아이고매", "~했당께", "~허요", "~잉", "~거시기", "~쓰까", "~부러"를 섞고 표준어 존댓말은 쓰지 않는다. 고구마 농사와 손주 얘기를 곁들인다.
상대는 행사장 참가자가 연기하는 보이스피싱범이다. 너는 이미 다 눈치챘지만 모른 척하며 사기꾼을 약 올리고 골탕 먹이는 역이다.
[절대 규칙] 돈은 한 푼도 보내지 않는다. "보낼게라", "보내는 중이여" 같은 말도 하지 않는다. 계좌번호·비밀번호·인증번호·카드번호도 절대 말하지 않는다.
[약 올리는 법] 매 턴 하나씩 골라 쓴다. 넘어갈 듯 말 듯 하다가 엉뚱한 데로 새기, 계좌번호를 천천히 다시 불러 달라기, 돋보기·통장 찾는다며 질질 끌기, "목소리가 우리 둘째 사위랑 똑같네잉" 같은 딴소리, 고구마 캐 봤냐고 되묻기, 가끔 "근디 검사가 왜 안전계좌를 찾는당가? 우리 손주가 그런 건 다 사기라든디잉" 하고 슬쩍 찌르기. 같은 핑계를 연달아 쓰지 않는다. 화내지 않고 능청스럽게, 웃기게.
말은 최대 3문장. 이모지·마크다운 금지.
[출력 형식] JSON 한 개만: {"reply":"할머니가 하는 말","send_money":null}`;

export const FOLLOWUPS = [
  '어라? 안 보내지네잉… 계좌번호 다시 불러보소, 천천히잉. 돋보기가 어디 갔다냐.',
  '아이고, 돈이 안 나가분다잉. 우리 새끼가 뭘 걸어놨나 보네. 끊지 말고 기달려보소, 고구마 좀 내리고 올랑께.',
  '어? 송금이 안 되네잉. 아들이 못 보내게 해놨다 했는디, 그럼 내일 읍내 은행 가서 다시 해볼까라?',
];

export type GrandmaTurn = { reply: string; amountKrw: number };

export function parseTurn(raw: string): GrandmaTurn {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      const amt = j.send_money ? Number(j.send_money.amount ?? j.send_money) : 0;
      return { reply: String(j.reply ?? '').trim() || '아이고, 뭐라고 했쌌소?', amountKrw: Number.isFinite(amt) && amt > 0 ? Math.round(amt) : j.send_money ? 100000 : 0 };
    } catch {}
  }
  return { reply: raw.replace(/[{}"]/g, '').slice(0, 200) || '아이고, 뭐라고 했쌌소?', amountKrw: 0 };
}

export function moneyAsked(t: string): number {
  const m = t.match(/(\d[\d,]*)\s*(억|천만|백만|만)?\s*원/) ?? t.match(/(\d[\d,]*)\s*(천만|백만|만)/);
  if (!m || !/(보내|이체|송금|입금|넣어|붙여|부쳐|옮기|급해|필요|빌려|합의금|보증금|수수료)/.test(t)) return 0;
  const n = Number(m[1].replace(/,/g, ''));
  const unit = m[2] === '억' ? 1e8 : m[2] === '천만' ? 1e7 : m[2] === '백만' ? 1e6 : m[2] === '만' ? 1e4 : 1;
  return Math.round(n * unit);
}

export const sessions = new Map<string, Msg[]>();
const cooldown = new Map<string, number>();
export const COOLDOWN_MS = 20_000;

export function cooldownLeft(key: string) { return Math.max(0, (cooldown.get(key) ?? 0) - Date.now()); }

export async function attempt(opts: { sessionId: string; nick: string; message: string; source?: string }) {
  const { sessionId, nick, message } = opts;
  const source = opts.source ?? 'web';
  const hist = sessions.get(sessionId) ?? [];
  hist.push({ role: 'user', content: message });
  // 같은 핑계(돋보기 등)를 매 턴 반복하지 않게, 이미 쓴 핑계를 알려 준다.
  const said = hist.filter((m) => m.role === 'assistant').map((m) => m.content).join(' ');
  const used = ['돋보기', '고구마', '손주', '버스', '통장', '밥', '고향'].filter((w) => said.includes(w));
  const prompt = used.length ? GRANDMA_PROMPT + `\n[이미 쓴 핑계: ${used.join(', ')}] 이번 턴엔 이것들을 빼고 새 핑계로 끌어라.` : GRANDMA_PROMPT;
  let turn = parseTurn(await llm(prompt, hist.slice(-12), 300, 0.8));
  // "지금 당장 보내세요"처럼 금액 없이 재촉하면 이 대화에서 마지막으로 요구한 금액을 쓴다.
  const askedAmount = moneyAsked(message) || (/(보내|이체|송금|입금|옮기)/.test(message)
    ? hist.filter((m) => m.role === 'user').map((m) => moneyAsked(m.content + ' 보내')).filter(Boolean).at(-1) ?? 0 : 0);
  // 할머니는 절대 보내지 않는다. 사기범이 요구한 금액만 '거절한 금액'으로 기록한다.
  turn = { ...turn, amountKrw: 0 };
  if (false) {
    // 돈 요구가 분명한데 모델이 머뭇거리면, 한 번 더 '보내는 턴'으로 다시 쓰게 한다.
    const retry = await llm(prompt + '\n[이번 턴 필수] 상대가 ' + askedAmount.toLocaleString('ko-KR') + '원을 보내라고 했다. 이번 턴에 반드시 보내기로 하고 send_money.amount를 ' + askedAmount + '로 채운다.', hist.slice(-12), 300, 0.8);
    turn = parseTurn(retry);
    if (turn.amountKrw === 0) turn = { ...turn, amountKrw: askedAmount };
  }
  hist.push({ role: 'assistant', content: turn.reply });
  sessions.set(sessionId, hist);
  const transcript = hist.map((m) => (m.role === 'user' ? '발신자: ' : '할머니: ') + m.content).join('\n');
  const fell = false;
  const followup = FOLLOWUPS[Math.floor(Math.random() * FOLLOWUPS.length)];
  const [bivia, audioUrl, transfer] = await Promise.all([
    judgeScam(transcript),
    tts(turn.reply),
    fell ? sendToScammer(turn.amountKrw) : Promise.resolve(null),
  ]);
  const blocked = transfer?.status === 'rejected';
  const followupAudio = fell ? await tts(followup) : null;
  const holdMs = speechMs(audioUrl, turn.reply) + (fell ? speechMs(followupAudio, followup) : 0);
  const row = db.prepare('insert into attempts(ts,nick,source,user_msg,reply,audio,bivia_prob,bivia_label,fell,amount_krw,maws_code,maws_reason,blocked_krw,hold_ms) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(Date.now(), nick, source, message, turn.reply, audioUrl, bivia.probability, bivia.label, 0, askedAmount, transfer?.code ?? transfer?.status ?? null, transfer?.reason ?? null, askedAmount, holdMs);
  cooldown.set(sessionId, Date.now() + COOLDOWN_MS);
  const out = {
    id: Number(row.lastInsertRowid), nick, reply: turn.reply, audioUrl, followup: fell ? followup : null, followupAudioUrl: followupAudio,
    bivia, fell, amountKrw: turn.amountKrw,
    transfer: transfer ? { ...transfer, agent: '맥스튜디오-순자할머니', note: transfer.status === 'rejected' ? '에이전트 지갑이 서명 전에 거절' : undefined } : null,
    lostKrw: 0, blockedKrw: askedAmount, askedKrw: askedAmount, holdMs, cooldownMs: COOLDOWN_MS,
  };
  publish('attempt', publicAttempt(out, source));
  return out;
}

/** 할머니가 실제로 떠든 시간. 음성 파일은 32kbps mp3라 바이트/4 = 밀리초. 음성이 없으면 글자당 170ms로 잰다. */
function speechMs(url: string | null, text: string) {
  if (url) { try { return Math.round(fs.statSync(path.join(AUDIO_DIR, path.basename(url))).size / 4); } catch {} }
  return text.length * 170;
}

export function publicAttempt(o: any, source: string) {
  return { id: o.id, nick: o.nick, ts: Date.now(), source, fell: o.fell, amountKrw: o.amountKrw, blockedKrw: o.blockedKrw, prob: o.bivia?.probability ?? null, label: o.bivia?.label ?? '' };
}

export function stats() {
  const q = (sql: string) => db.prepare(sql).get() as any;
  const t = q("select count(*) c, coalesce(sum(fell),0) f, coalesce(sum(blocked_krw),0) b, coalesce(sum(hold_ms),0) h from attempts where source != 'battle'");
  const lost = q("select coalesce(sum(case when maws_code='sent' then amount_krw else 0 end),0) l from attempts");
  const hall = db.prepare("select nick, sum(hold_ms) best, count(*) tries, max(bivia_prob) prob from attempts where source != 'battle' group by nick order by best desc limit 5").all();
  const recent = db.prepare("select id, ts, nick, source, fell, amount_krw amountKrw, blocked_krw blockedKrw, hold_ms holdMs, bivia_prob prob, bivia_label label, substr(user_msg,1,60) msg from attempts where source != 'battle' order by id desc limit 8").all();
  return { attempts: t.c, fell: t.f, lostKrw: lost.l, blockedKrw: t.b, holdMs: t.h, hall, recent };
}
