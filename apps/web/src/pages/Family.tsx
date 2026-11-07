import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, ShieldAlert, Sun, Wallet, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Shell } from '../Shell';
import { api, hhmm, won } from '../lib';

const ICON: Record<string, any> = { pay: Wallet, blocked: ShieldAlert, scam: ShieldAlert, approval: ShieldAlert, call: Wallet };
export default function Family() {
  const [d, setD] = useState<any>(null);
  const [brief, setBrief] = useState<{ text: string; ts: number } | null>(null);
  const [bl, setBl] = useState(false);
  const load = useCallback(() => api('/api/family/feed').then((x: any) => { setD(x); setBrief((b) => b ?? x.briefing); }), []);
  useEffect(() => {
    void load();
    const es = new EventSource('/events');
    es.addEventListener('feed', () => void load()); es.addEventListener('approval', () => void load());
    return () => es.close();
  }, [load]);
  async function getBrief() { setBl(true); setBrief(await api('/api/family/briefing', {})); setBl(false); }
  async function decide(id: number, act: 'approve' | 'reject') { await api('/api/family/approvals/' + id + '/' + act, {}); void load(); }
  const pending = (d?.approvals ?? []).filter((a: any) => a.status === 'pending');
  return (
    <Shell title="가족방" back="/" right={<Link to="/family/settings" className="btn sm weak" style={{ textDecoration: 'none' }}>규칙</Link>} flush>
      <main className="page" style={{ gap: 'var(--space-4)' }}>
        <h1 className="title">엄마 소식</h1>
        {pending.map((a: any) => (
          <section key={a.id} className="card" style={{ background: 'var(--color-lime-100)' }}>
            <h2 className="sec">{a.merchant}에 {won(a.amountKrw)} 결제 요청</h2>
            <p className="muted" style={{ margin: '4px 0 12px' }}>1회 한도를 넘어서 승인이 필요해요. {a.note}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => decide(a.id, 'approve')}><Check size={18} />승인</button>
              <button className="btn weak" style={{ flex: 1 }} onClick={() => decide(a.id, 'reject')}><X size={18} />거절</button>
            </div>
          </section>
        ))}
        <section className="card subtle">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 className="sec">아침 브리핑</h2>
            <button className="btn sm" onClick={getBrief} disabled={bl}><Sun size={16} />{bl ? '쓰는 중' : brief ? '다시 받기' : '받아 보기'}</button>
          </div>
          {brief ? <p style={{ margin: '12px 0 0', lineHeight: 1.65 }}>{brief.text}</p> : null}
        </section>
        <section className="card">
          <h2 className="sec">기록</h2>
          {(d?.feed ?? []).length === 0 ? <p className="muted" style={{ margin: '8px 0 0' }}>아직 기록이 없어요. 엄마 통화 화면에서 결제를 해 보세요.</p> : (d.feed as any[]).map((f) => {
            const I = ICON[f.kind] ?? Wallet; const bad = f.kind !== 'pay';
            return (
              <div key={f.id} className={'feed-item' + (bad ? ' bad' : '')}>
                <span className="ico"><I size={18} /></span>
                <div style={{ minWidth: 0 }}>
                  <b>{f.title}</b>
                  {f.body && <div className="muted small">{f.body}</div>}
                  <div className="muted small">{hhmm(f.ts)}{f.json?.explorer && <> · <a href={f.json.explorer} target="_blank" rel="noreferrer">거래 보기 <ExternalLink size={11} style={{ verticalAlign: -1 }} /></a></>}</div>
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </Shell>
  );
}
