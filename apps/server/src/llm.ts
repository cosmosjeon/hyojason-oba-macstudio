import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

// 1순위 Bedrock(서울). 계정의 Anthropic 사용 신청이 아직 안 풀리면 2분간 건너뛰고 로컬 프록시(구독)로 간다.
const bedrock = new BedrockRuntimeClient({ region: 'ap-northeast-2' });
const BEDROCK_MODEL = process.env.BEDROCK_MODEL || 'global.anthropic.claude-sonnet-4-6';
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
        messages: messages.map((m) => ({ role: m.role, content: [{ text: m.content }] })),
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
