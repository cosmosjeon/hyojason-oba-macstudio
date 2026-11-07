import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Shell } from '../Shell';
import { api, won } from '../lib';

const LIMITS = [50000, 100000, 300000, 500000];
export default function FamilySettings() {
  const [limit, setLimit] = useState(100000);
  const [sel, setSel] = useState<string[]>([]);
  const [all, setAll] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  useEffect(() => { void api('/api/family/settings').then((s: any) => { setLimit(s.limitKrw); setSel(s.merchants); setAll(s.all); }); }, []);
  const toggle = (m: string) => setSel((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  async function save() {
    setState('saving'); setMsg('');
    const r: any = await api('/api/family/settings', { limitKrw: limit, merchants: sel });
    if (r.error) { setState('error'); setMsg(r.error); } else { setState('saved'); setMsg('엄마 지갑에 규칙이 적용됐어요.'); }
  }
  return (
    <Shell title="자녀 설정" back="/" flush>
      <main className="page" style={{ gap: 'var(--space-6)' }}>
        <div>
          <h1 className="title">엄마 지갑의 결제 규칙</h1>
        </div>
        <section className="field">
          <label>1회 결제 한도</label>
          <div className="chips" role="group" aria-label="한도 선택">
            {LIMITS.map((l) => <button key={l} className="pill num" aria-pressed={limit === l} onClick={() => setLimit(l)}>{won(l)}</button>)}
          </div>
        </section>
        <section className="field">
          <label>결제할 수 있는 상점</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {all.map((m) => (
              <button key={m} className="toggle" aria-pressed={sel.includes(m)} onClick={() => toggle(m)}>
                <span className="check"><Check size={14} strokeWidth={3} /></span>{m}
              </button>
            ))}
          </div>
        </section>
        {msg && <div role={state === 'error' ? 'alert' : 'status'} style={{ fontWeight: 600, color: state === 'error' ? 'var(--color-notice-text)' : 'var(--color-lime-text)' }}>{msg}{state === 'saved' && <> <Link to="/family" style={{ color: 'var(--color-ink)' }}>가족방 보기</Link></>}</div>}
        <button className="btn block" style={{ marginTop: 'auto' }} disabled={state === 'saving' || !sel.length} onClick={save}>{state === 'saving' ? '지갑에 적용하는 중… (약 30초)' : '규칙 저장'}</button>
      </main>
    </Shell>
  );
}
