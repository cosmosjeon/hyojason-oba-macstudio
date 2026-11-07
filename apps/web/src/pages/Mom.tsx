import { useEffect, useRef, useState } from 'react';
import VapiMod from '@vapi-ai/web';
const Vapi: typeof VapiMod = (VapiMod as any).default ?? VapiMod;
import { ExternalLink, Phone, PhoneOff, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Shell } from '../Shell';
import { CallScreen, CallPhase } from '../CallScreen';
import { api, won } from '../lib';

type Line = { id: number; role: string; text: string };
type Pay = { id: number; merchant: string; amountKrw: number; status: string; message: string; explorer?: string };
const QUICK: [string, number, string][] = [['관리사무소', 85000, '이번 달 관리비'], ['약국', 35000, '감기약'], ['무신사', 59000, '겨울 내의']];
let n = 1;

export default function Mom() {
  const [cfg, setCfg] = useState<any>(null);
  const [state, setState] = useState<'idle' | CallPhase>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [outMuted, setOutMuted] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [scamText, setScamText] = useState('');
  const [scam, setScam] = useState('');
  const vapi = useRef<InstanceType<typeof VapiMod> | null>(null);

  useEffect(() => { void api('/api/vapi/config').then(setCfg); return () => { vapi.current?.stop(); }; }, []);

  function start() {
    if (!cfg?.publicKey || !cfg?.momAssistantId) { setErr('통화 설정을 불러오지 못했어요. 아래 버튼으로 결제를 요청할 수 있어요.'); return; }
    setErr(''); setState('connecting'); setLines([]); setMuted(false); setOutMuted(false);
    const v = new Vapi(cfg.publicKey); vapi.current = v;
    v.on('call-start', () => setState('live'));
    v.on('call-end', () => setState((s) => (s === 'error' ? s : 'ended')));
    v.on('speech-start', () => setSpeaking(true)); v.on('speech-end', () => setSpeaking(false));
    v.on('error', (e: any) => { setErr('통화 연결에 문제가 생겼어요. 아래 버튼으로 결제를 요청할 수 있어요.'); setState('error'); });
    v.on('message', (m: any) => {
      if (m.type === 'transcript' && m.transcriptType === 'final') setLines((l) => [...l, { id: n++, role: m.role, text: m.transcript }]);
      if (m.type === 'tool-calls-result' || m.type === 'tool-call-result') { /* 결제 결과는 가족방에 쌓인다 */ }
    });
    void v.start(cfg.momAssistantId);
  }
  function stop() { vapi.current?.stop(); setState('idle'); setSpeaking(false); }
  const toggleMute = () => setMuted((m) => { vapi.current?.setMuted(!m); return !m; });
  const toggleOut = () => setOutMuted((m) => { document.querySelectorAll('audio,video').forEach((a) => { (a as HTMLMediaElement).muted = !m; }); return !m; });

  async function pay(merchant: string, amountKrw: number, note: string) {
    setBusy(merchant);
    const r: any = await api('/api/mom/pay', { merchant, amountKrw, note });
    setPays((p) => [{ id: n++, merchant, amountKrw, status: r.status, message: r.message ?? r.error, explorer: r.explorer }, ...p]);
    setBusy('');
  }
  async function check() {
    if (!scamText.trim()) return;
    setBusy('scam'); const r: any = await api('/api/mom/scamcheck', { text: scamText });
    setScam(r.scam ? '사기로 의심돼요 (' + Math.round((r.probability ?? 0) * 100) + '%). 송금하지 말고 가족방에 알렸어요.' : r.scam === false ? '사기로 보이지 않아요.' : '판정을 보류했어요. 조심해서 확인해 주세요.');
    setBusy('');
  }
  const lastSay = [...lines].reverse().find((l) => l.role !== 'user')?.text ?? '';
  return (
    <Shell title="엄마 통화" back="/" right={<Link to="/family" className="btn sm weak" style={{ textDecoration: 'none' }}>가족방</Link>}>
      <div>
        <h1 className="title">엄마, 뭐 도와드릴까요?</h1>
      </div>
      <button className="btn block" style={{ minHeight: 60 }} onClick={start} disabled={state !== 'idle'}><Phone size={22} />엄마 전화 걸기</button>
      {err && state === 'idle' && <div role="alert" className="small" style={{ color: 'var(--color-notice-text)', fontWeight: 600 }}>{err}</div>}
      <div className="sheet" style={{ margin: '0 calc(var(--space-5) * -1)', borderRadius: '28px 28px 0 0' }}>
        <section className="card">
          <h2 className="sec">바로 결제</h2>
          <ul className="list" style={{ marginTop: 8 }}>
            {QUICK.map(([m, a, note]) => (
              <li key={m} className="row" style={{ minHeight: 64 }}>
                <span style={{ flex: 1 }}><b>{m}</b><br /><span className="muted small">{note} · <span className="num">{won(a)}</span></span></span>
                <button className="btn sm" disabled={!!busy} onClick={() => pay(m, a, note)}>{busy === m ? '보내는 중' : '결제'}</button>
              </li>
            ))}
            <li className="row" style={{ minHeight: 64 }}>
              <span style={{ flex: 1 }}><b>한도 넘는 결제</b><br /><span className="muted small">관리사무소 · <span className="num">{won(250000)}</span></span></span>
              <button className="btn sm weak" disabled={!!busy} onClick={() => pay('관리사무소', 250000, '관리비 연체분')}>요청</button>
            </li>
          </ul>
          {pays.map((p) => (
            <div key={p.id} className="feed-item" style={{ paddingBottom: 0 }}>
              <span className="ico" style={p.status === 'paid' ? undefined : { background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}>{p.status === 'paid' ? '✓' : '!'}</span>
              <div><b>{p.message}</b>{p.explorer && <><br /><a href={p.explorer} target="_blank" rel="noreferrer">거래 보기 <ExternalLink size={12} style={{ verticalAlign: -1 }} /></a></>}</div>
            </div>
          ))}
        </section>
        <section className="card">
          <h2 className="sec">수상한 문자·전화</h2>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="scam">받은 내용을 붙여 넣으세요</label>
            <textarea id="scam" className="input" style={{ padding: 12, minHeight: 88 }} value={scamText} onChange={(e) => setScamText(e.target.value)} placeholder="예: 검찰입니다. 계좌가 도용됐으니 안전계좌로 옮기세요" />
          </div>
          <button className="btn weak block" style={{ marginTop: 12 }} disabled={busy === 'scam' || !scamText.trim()} onClick={check}><ShieldAlert size={20} />사기인지 확인</button>
          {scam && <p style={{ margin: '12px 0 0', fontWeight: 600 }}>{scam}</p>}
        </section>
      </div>
      {state !== 'idle' && (
        <CallScreen name="순자 어머니" initial="순" phase={state} speaking={speaking} caption={lastSay} error={state === 'error' ? err : undefined}
          muted={muted} outputMuted={outMuted} onMute={toggleMute} onSpeaker={toggleOut} onHang={stop} />
      )}
    </Shell>
  );
}
