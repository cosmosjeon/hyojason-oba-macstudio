import fs from 'node:fs';
import path from 'node:path';
import { maws } from './maws.ts';
import { kvGet } from './db.ts';

const P = path.resolve(import.meta.dirname, '../../../secrets.local.json');
const s = JSON.parse(fs.readFileSync(P, 'utf8'));
export const grandmaAgent: string = s.agents['맥스튜디오-순자할머니'].agentId;
export const momAgent: string = s.agents['맥스튜디오-엄마'].agentId;
export const merchants: Record<string, string> = Object.fromEntries(Object.entries<any>(s.merchants).map(([k, v]) => [k, v.address]));
export const scammerAddress: string = s.scammer.address;
export const EXPLORER = 'https://explorer-testnet.maroo.io/tx/';
/** 화면 금액은 원, 체인 금액은 원/1000 (1000원 = 1 tOKRW). */
export const toChain = (krw: number) => String(Math.max(1, Math.round(krw / 1000)));

export type Settings = { limitKrw: number; merchants: string[] };
export const getSettings = (): Settings => kvGet('settings', { limitKrw: 100000, merchants: Object.keys(merchants) });

export async function applyPolicy(set: Settings) {
  const targets = set.merchants.map((m) => merchants[m]).filter(Boolean);
  if (!targets.length) throw new Error('허용 상점을 하나 이상 골라 주세요');
  return maws('policy.set', { agentId: momAgent, spendingLimit: toChain(set.limitKrw), allowedTargets: targets.join(',') });
}

export type TransferOutcome = { status: 'sent' | 'rejected' | 'error'; txHash?: string; reason?: string; code?: string; explorer?: string };
export async function send(agentId: string, to: string, amountKrw: number): Promise<TransferOutcome> {
  try {
    const r = await maws('transfer.send', { agentId, to, amount: toChain(amountKrw), clientToken: 'ms-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) });
    if (r.ok && r.data?.txHash) return { status: 'sent', txHash: r.data.txHash, explorer: EXPLORER + r.data.txHash };
    const code = r.data?.error?.code ?? r.code;
    const reason = r.data?.error?.detail?.reason ?? r.data?.error?.message ?? r.text.slice(0, 200);
    if (code === 'POLICY_REJECTED') return { status: 'rejected', code, reason };
    return { status: 'error', code, reason };
  } catch (e) {
    return { status: 'error', reason: (e as Error).message };
  }
}

/** 사기범 주소로 가는 시도. 화면 금액은 요청 그대로, 체인 금액만 잔액·한도 이하로 줄여 '정책 거절'이 잔액 부족보다 먼저 나오게 한다. */
let balCache = { at: 0, v: 400 };
async function grandmaBalance(): Promise<number> {
  if (Date.now() - balCache.at < 30_000) return balCache.v;
  try { const r = await maws('agent.balance', { agentId: grandmaAgent }); const b = Number(r.data?.balance); if (Number.isFinite(b)) balCache = { at: Date.now(), v: b }; } catch {}
  return balCache.v;
}
/** 요청 금액을 정책 한도(100)와 잔액-1 이하로 줄여, 결과가 항상 POLICY_REJECTED가 되게 한다. */
export async function sendToScammer(amountKrw: number) {
  if (Object.values(merchants).includes(scammerAddress)) throw new Error('scammer address must not be an allowed merchant');
  const bal = await grandmaBalance();
  const chain = Math.max(1, Math.min(Math.round(amountKrw / 1000), 90, Math.floor(bal) - 1));
  return send(grandmaAgent, scammerAddress, chain * 1000);
}
