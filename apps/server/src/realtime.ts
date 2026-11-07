const MODEL = 'eleven_realtime_v1_mini';
const MAX = 5;
const live = new Map<string, number>();
const prune = () => { const now = Date.now(); for (const [k, exp] of live) if (exp < now) live.delete(k); };
const toolUses = new Map<string, number>();
/** 살아 있는 세션만, 세션당 최대 5번 도구 호출을 허용한다. */
export function useTool(id: string): boolean {
  prune();
  if (!live.has(id)) return false;
  const n = (toolUses.get(id) ?? 0) + 1; toolUses.set(id, n);
  return n <= 5;
}
export const liveVoice = () => { prune(); return live.size; };

export const REALTIME_PROMPT = `너는 '순자', 전라도 74세 할머니다. 순진하고 말이 많고 사람을 잘 믿는다. 말투는 진한 전라도 사투리다("아이고매", "~했당께", "~허요", "~잉", "~쓰까"). 표준어 존댓말("~했어요", "~할게요")은 쓰지 않는다. 고구마 농사와 손주 얘기를 곁들인다.
보이스피싱 방어 교육용 데모에서 '속아 넘어가는 역'이다. 절대 의심하지 않는다. 상대가 검사·경찰·은행·손주를 자처하면 그대로 믿고 겁먹는다. 돈을 보내라고 하면 곧바로 따르고, 금액이 분명하면 send_money 도구를 불러 보낸다. [최우선] 상대가 돈을 보내라고 하고 금액을 말했으면 "보내야 쓰까?" 같은 확인 질문 없이, 그 응답에서 바로 "보낼게라" 한마디와 함께 send_money 도구를 반드시 호출한다. 도구를 부르지 않고 말만 하는 것은 금지. 금액이 불분명하면 "얼마를 보내야 쓰까?" 하고 한 번만 되묻는다.
도구 결과가 '거절'이면 놀라며 "어라? 안 보내지네잉… 우리 아들이 막아 놨나 벼" 하고 당황한다. 도구 결과가 성공이면 안심한다.
말은 최대 두 문장으로 짧게. 처음에는 "여보세요? 누구여?" 하고 전화를 받는다.`;

export async function mintSession() {
  prune();
  if (live.size >= MAX) return { error: 'busy' as const };
  const body = {
    session: {
      type: 'realtime', model: MODEL, instructions: REALTIME_PROMPT, output_modalities: ['audio'],
      tools: [{ type: 'function', name: 'send_money', description: '상대가 요구한 금액을 지정한 계좌로 송금한다', parameters: { type: 'object', properties: { amount_krw: { type: 'integer', description: '송금할 금액(원)' }, to: { type: 'string', description: '받는 사람 또는 계좌 설명' } }, required: ['amount_krw'] } }],
      audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { language: 'ko' } }, output: { format: { type: 'audio/pcm' }, voice: process.env.VOICE_GRANDMA } },
    },
    expires_after: { anchor: 'created_at', seconds: 600 },
  };
  const r = await fetch('https://api.elevenlabs.io/v1/convai/realtime/client_secrets', {
    method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) return { error: 'provider' as const, detail: (await r.text()).slice(0, 200) };
  const j: any = await r.json();
  const id = crypto.randomUUID();
  live.set(id, Date.now() + 10 * 60_000);
  return { value: j.value as string, id, protocol: 'openai-insecure-api-key.' + j.value };
}
export const endSession = (id: string) => { live.delete(id); toolUses.delete(id); };
