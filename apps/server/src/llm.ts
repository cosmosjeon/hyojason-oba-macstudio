import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

// 1순위 Bedrock(서울) Amazon Nova 2 Lite: 별도 사용 신청 없이 약 1.3초. 실패하면 2분간 건너뛰고 로컬 프록시로 간다.
const bedrock = new BedrockRuntimeClient({ region: 'ap-northeast-2' });
const BEDROCK_MODEL = process.env.BEDROCK_MODEL || 'global.amazon.nova-2-lite-v1:0';

// Converse는 user로 시작하고 역할이 번갈아야 한다. 할머니 인사처럼 assistant로 시작하면 앞에 연결 신호를 붙이고, 같은 역할은 합친다.
function converseTurns(messages: Msg[]) {
  const turns: Msg[] = [];
  for (const m of messages) {
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content;
    else turns.push({ ...m });
  }
  if (turns[0]?.role !== 'user') turns.unshift({ role: 'user', content: '(전화 연결됨)' });
  return turns.map((m) => ({ role: m.role, content: [{ text: m.content }] }));
}
const PROXY_MODEL = process.env.PROXY_MODEL || 'anthropic/claude-haiku-4-5';
let bedrockDownUntil = 0;
export let lastBackend = 'none';

export type Msg = { role: 'user' | 'assistant'; content: string };

export async function llm(system: string, messages: Msg[], maxTokens = 400, temperature = 0.8): Promise<string> {
  if (Date.now() > bedrockDownUntil) {
    try {
      const out = await bedrock.send(new ConverseCommand({
        modelId: BEDROCK_MODEL,
        system: [{ text: system }],
        messages: converseTurns(messages),
        inferenceConfig: { maxTokens, temperature },
      }));
      const t = out.output?.message?.content?.map((c: any) => c.text ?? '').join('') ?? '';
      if (t.trim()) { lastBackend = 'bedrock'; return t.trim(); }
    } catch (e) {
      bedrockDownUntil = Date.now() + 120_000;
      console.warn('[llm] bedrock 실패, 프록시로 전환:', (e as Error).message.slice(0, 90));
    }
  }
  const r = await fetch('http://127.0.0.1:10100/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: PROXY_MODEL, max_tokens: maxTokens, temperature, messages: [{ role: 'system', content: system }, ...messages] }),
    signal: AbortSignal.timeout(30000),
  });
  const j: any = await r.json();
  lastBackend = 'proxy';
  return (j.choices?.[0]?.message?.content ?? '').trim();
}
