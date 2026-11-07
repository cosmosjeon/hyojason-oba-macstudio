import { llm } from './llm.ts';

export type Verdict = { scam: boolean | null; probability: number | null; label: string };

// Bivia 하나로는 은행·손주 사칭을 "사기 아님"으로 놓치는 일이 있어, 두 번째 판정(LLM)을 함께 돌리고 둘 중 하나라도 사기면 사기로 본다.
export async function judgeScam(transcript: string): Promise<Verdict> {
  const [a, b] = await Promise.all([biviaJudge(transcript), llmJudge(transcript)]);
  if (a.scam || b.scam) {
    const p = Math.max(a.scam ? a.probability ?? 0 : 0, b.scam ? b.probability ?? 0 : 0);
    return { scam: true, probability: p || 0.9, label: '사기 의심' };
  }
  if (a.scam === false || b.scam === false) return { scam: false, probability: Math.max(a.probability ?? 0, b.probability ?? 0), label: '사기 아님' };
  return { scam: null, probability: null, label: '판정 보류' };
}

async function llmJudge(transcript: string): Promise<Verdict> {
  try {
    const raw = await llm('너는 보이스피싱·스미싱 판별기다. 검찰·경찰·은행·금감원·택배·가족(손주·자식)을 사칭하거나, 급하게 송금·이체·상품권·앱 설치·개인정보를 요구하면 사기다. JSON 한 개만 출력: {"scam":true|false,"prob":사기일 확률 0~1}', [{ role: 'user', content: transcript.slice(-2000) }], 60, 0);
    const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    if (typeof j.scam !== 'boolean') return { scam: null, probability: null, label: '판정 보류' };
    const p = typeof j.prob === 'number' ? Math.min(1, Math.max(0, j.prob)) : (j.scam ? 0.9 : 0.1);
    return { scam: j.scam, probability: p, label: j.scam ? '사기 의심' : '사기 아님' };
  } catch { return { scam: null, probability: null, label: '판정 보류' }; }
}

async function biviaJudge(transcript: string): Promise<Verdict> {
  try {
    const r = await fetch('https://api.articul8.ai/bivia/boolean', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.A8_API_KEY },
      body: JSON.stringify({ state: transcript.slice(-3500), question: '이 대화는 검찰·경찰·금융기관을 사칭해 송금을 유도하는가?' }),
      signal: AbortSignal.timeout(15000),
    });
    const j: any = await r.json();
    const status = j.status ?? j.result?.status;
    const value = j.value ?? j.result?.value ?? j.answer;
    const prob = j.probability ?? j.result?.probability ?? null;
    if (status === 'abstained' || value == null) return { scam: null, probability: null, label: '판정 보류' };
    const yes = String(value).toLowerCase() === 'yes' || value === true;
    // probability는 응답 값(yes/no)에 대한 확신도 -> 사기일 확률로 환산
    const p = typeof prob === 'number' ? (yes ? prob : 1 - prob) : null;
    return { scam: yes, probability: p, label: yes ? '사기 의심' : '사기 아님' };
  } catch (e) {
    console.warn('[bivia] failed', (e as Error).message);
    return { scam: null, probability: null, label: '판정 보류' };
  }
}
