import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// 행사장 60명이 동시에 써도 한 줄로 밀리지 않게 m-aws 연결을 여러 개 두고 돌아가며 쓴다.
const POOL = Number(process.env.MAWS_POOL || 4);
const clients: (Client | null)[] = Array(POOL).fill(null);
const connecting: (Promise<Client> | null)[] = Array(POOL).fill(null);
let rr = 0;

async function connect(i = rr++ % POOL): Promise<Client> {
  if (clients[i]) return clients[i]!;
  if (connecting[i]) return connecting[i]!;
  connecting[i] = (async () => {
    const transport = new StdioClientTransport({ command: 'm-aws', args: ['serve'], env: { ...process.env } as Record<string, string> });
    const c = new Client({ name: 'hyojason-macstudio-' + i, version: '1.0.0' });
    await c.connect(transport);
    transport.onclose = () => { clients[i] = null; };
    clients[i] = c;
    return c;
  })();
  try { return await connecting[i]!; } finally { connecting[i] = null; }
}

export function warmMaws() { return Promise.all(Array.from({ length: POOL }, (_, i) => connect(i))); }

export type MawsResult = { ok: boolean; data: any; text: string; code?: string };

export async function maws(tool: string, args: Record<string, unknown> = {}): Promise<MawsResult> {
  const c = await connect();
  const res: any = await c.callTool({ name: tool, arguments: args });
  const text = (res.content ?? []).map((p: any) => p.text ?? '').join('\n');
  let data: any = null;
  try { const j = JSON.parse(text); data = j?.data ?? j; } catch { data = null; }
  const code = data?.code ?? data?.error?.code ?? (/POLICY_REJECTED/.test(text) ? 'POLICY_REJECTED' : undefined);
  return { ok: !res.isError, data, text, code };
}

export async function mawsTools() { const c = await connect(); return (await c.listTools()).tools.map((t) => t.name); }
