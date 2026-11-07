import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let client: Client | null = null;
let connecting: Promise<Client> | null = null;

async function connect(): Promise<Client> {
  if (client) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const transport = new StdioClientTransport({ command: 'm-aws', args: ['serve'], env: { ...process.env } as Record<string, string> });
    const c = new Client({ name: 'hyojason-macstudio', version: '1.0.0' });
    await c.connect(transport);
    transport.onclose = () => { client = null; };
    client = c;
    return c;
  })();
  try { return await connecting; } finally { connecting = null; }
}

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
