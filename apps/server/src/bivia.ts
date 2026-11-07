export type Verdict = { scam: boolean | null; probability: number | null; label: string };

export async function judgeScam(transcript: string): Promise<Verdict> {
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
