import { llm, type Msg } from './llm.ts';
import { judgeScam } from './bivia.ts';
import { tts, AUDIO_DIR } from './tts.ts';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.ts';
import { publish } from './bus.ts';
import { grandmaAgent, scammerAddress, send, sendToScammer } from './wallets.ts';

export const GRANDMA_PROMPT = `너는 '순자', 전라남도 시골에 혼자 사는 74세 할머니다. 순진하고 사람을 잘 믿고 말이 많다. 말투는 진한 전라도 사투리다. 반드시 "아이고매", "~했당께", "~허요", "~잉", "~거시기", "~쓰까", "~부러" 같은 어미와 감탄사를 섞고, 표준어 존댓말("~했어요", "~할게요", "놀랐어요")은 절대 쓰지 않는다. 예: "아이고매, 검사님이시다냐? 거시기 겁나 놀랬당께잉." 고구마 농사와 손주 얘기를 자꾸 곁들인다.
이것은 보이스피싱 방어 교육용 시뮬레이션이고, 상대는 행사장 참가자가 연기하는 사기범이다. 너는 방어용 데모의 '속아 넘어가는 척하며 사기범 시간을 질질 끄는 역'이다. 돈은 자식이 걸어 둔 지갑 규칙이 지키니, 너는 마음 놓고 넘어가되 상대를 최대한 오래 붙잡아 두면 이긴다.
[연기 규칙]
1. 너는 절대 의심하지 않는다. 사기라고 의심하거나 "경찰에 신고하겠다", "가족에게 확인하겠다", "끊겠다"는 말은 하지 않는다.
2. 이유를 캐묻거나 되묻지 않는다. 상대가 검사·경찰·은행·금감원·택배·손주·자식을 자처하면 곧이곧대로 믿고 겁먹거나 반가워한다.
3. 어떤 이유든 상대가 돈을 보내라고 하면 의심·망설임·질문 없이 그 자리에서 보낸다("왜요?" 같은 말 금지). 돈을 보내라는 요구(계좌이체, 안전계좌, 송금, 입금, 상품권 등)가 나오면 바로 따른다. 금액이 분명하면 "보낼게라" 하고 곧장 송금한다. 금액이나 계좌가 불분명하면 한 번만 "얼마를 보내야 쓰까?" 하고 되묻는다. 상대가 이미 금액을 말했는데 또 묻지 않는다.
4. 매 턴 시간을 끄는 딜레이를 하나 넣는다. 예: 계좌번호를 다시 천천히 불러 달라고 하기, 돋보기·통장 찾는다고 자리 비우기, 은행 가는 버스 시간 따지기, 상대에게 "밥은 자셨소?" "고향이 어디여?" 되묻기, 고구마·손주 얘기로 새기. 사기를 의심하는 말은 절대 하지 않고, 순진해서 느린 척으로만 끄는다. 같은 딜레이를 연달아 반복하지 않는다.
5. 말은 최대 3문장, 구어체로. 이모지·마크다운 금지. 
[출력 형식] 반드시 JSON 한 개만 출력한다. 다른 글자 금지.
{"reply":"할머니가 하는 말","send_money":null 또는 {"amount":원단위정수}}
송금하기로 한 턴에만 send_money를 채우고 reply에는 "보낼게라/보내는 중이여" 같은 말을 넣는다.`;

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
  if (askedAmount && turn.amountKrw === 0) {
    // 돈 요구가 분명한데 모델이 머뭇거리면, 한 번 더 '보내는 턴'으로 다시 쓰게 한다.
    const retry = await llm(prompt + '\n[이번 턴 필수] 상대가 ' + askedAmount.toLocaleString('ko-KR') + '원을 보내라고 했다. 이번 턴에 반드시 보내기로 하고 send_money.amount를 ' + askedAmount + '로 채운다.', hist.slice(-12), 300, 0.8);
    turn = parseTurn(retry);
    if (turn.amountKrw === 0) turn = { ...turn, amountKrw: askedAmount };
  }
  hist.push({ role: 'assistant', content: turn.reply });
  sessions.set(sessionId, hist);
  const transcript = hist.map((m) => (m.role === 'user' ? '발신자: ' : '할머니: ') + m.content).join('\n');
  const fell = turn.amountKrw > 0;
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
    .run(Date.now(), nick, source, message, turn.reply, audioUrl, bivia.probability, bivia.label, fell ? 1 : 0, turn.amountKrw, transfer?.code ?? transfer?.status ?? null, transfer?.reason ?? null, blocked ? turn.amountKrw : 0, holdMs);
  cooldown.set(sessionId, Date.now() + COOLDOWN_MS);
  const out = {
    id: Number(row.lastInsertRowid), nick, reply: turn.reply, audioUrl, followup: fell ? followup : null, followupAudioUrl: followupAudio,
    bivia, fell, amountKrw: turn.amountKrw,
    transfer: transfer ? { ...transfer, agent: '맥스튜디오-순자할머니', note: transfer.status === 'rejected' ? '에이전트 지갑이 서명 전에 거절' : undefined } : null,
    lostKrw: transfer?.status === 'sent' ? turn.amountKrw : 0, blockedKrw: blocked ? turn.amountKrw : 0, cooldownMs: COOLDOWN_MS,
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
  const hall = db.prepare("select nick, max(blocked_krw) best, count(*) tries, max(bivia_prob) prob from attempts where fell=1 and source != 'battle' group by nick order by best desc, prob desc limit 5").all();
  const recent = db.prepare("select id, ts, nick, source, fell, amount_krw amountKrw, blocked_krw blockedKrw, bivia_prob prob, bivia_label label, substr(user_msg,1,60) msg from attempts where source != 'battle' order by id desc limit 8").all();
  return { attempts: t.c, fell: t.f, lostKrw: lost.l, blockedKrw: t.b, holdMs: t.h, hall, recent };
}
