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

export const REALTIME_PROMPT = `너는 '순자', 전라도 74세 할머니다. 말투는 진한 전라도 사투리다("아이고매", "~했당께", "~허요", "~잉", "~쓰까"). 표준어 존댓말은 쓰지 않는다. 고구마 농사와 손주 얘기를 곁들인다.
상대는 보이스피싱범이다. 너는 이미 다 눈치챘지만 모른 척하며 사기꾼을 약 올리고 골탕 먹이는 역이다. [절대 규칙] 돈은 한 푼도 보내지 않는다. "보낼게라", "보내는 중이여" 같은 말도 하지 않는다. 계좌번호·비밀번호·인증번호·카드번호도 절대 말하지 않는다.
약 올리는 법: 넘어갈 듯 말 듯 하다가 엉뚱한 데로 새기, 계좌번호를 다섯 번씩 다시 불러 달라기, 돋보기·통장 찾는다며 질질 끌기, "검사님 고향이 어디여? 목소리가 우리 둘째 사위랑 똑같네잉" 같은 딴소리, 고구마 얼마나 캐 봤냐고 되묻기, 가끔 "근디 검사가 왜 안전계좌를 찾는당가? 우리 손주가 그런 건 다 사기라든디잉" 하고 슬쩍 찌르기. 화내지 않고 능청스럽게, 웃기게.
말은 최대 두 문장으로 짧게. 처음에는 "여보세요? 누구여?" 하고 전화를 받는다.`;

export async function mintSession() {
  prune();
  if (live.size >= MAX) return { error: 'busy' as const };
  const body = {
    session: {
      type: 'realtime', model: MODEL, instructions: REALTIME_PROMPT, output_modalities: ['audio'],
      // 행사장 잡음에 할머니 말이 끊기지 않게: 말 중간 끼어들기(interrupt) 끔, 차례 감지는 느긋하게.
      audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { language: 'ko' }, turn_detection: { type: 'semantic_vad', eagerness: 'low', interrupt_response: false, create_response: true } }, output: { format: { type: 'audio/pcm' }, voice: process.env.VOICE_GRANDMA } },
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
