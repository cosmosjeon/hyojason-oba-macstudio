import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Swords, Volume2, VolumeX, ShieldX } from 'lucide-react';
import { api, hhmm, pct, won } from '../lib';

type Stats = { attempts: number; fell: number; lostKrw: number; blockedKrw: number; holdMs: number; hall: { nick: string; best: number; tries: number; prob: number | null }[]; recent: { id: number; ts: number; nick: string; source: string; fell: number; amountKrw: number; blockedKrw: number; prob: number | null; msg: string }[] };
type Line = { id: number; who: 'kim' | 'sunja' | 'wallet'; text: string };
let lid = 1;

function buzz(ctx: AudioContext) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.setValueAtTime(220, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.35);
  g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
  o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.5);
}

const HOST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('host');
export default function Board() {
  const [s, setS] = useState<Stats | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  const ctx = useRef<AudioContext | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [pub, setPub] = useState('');
  const origin = pub || (typeof location !== 'undefined' ? location.origin : '');

  useEffect(() => { void api('/api/health').then((h: any) => { if (h.publicUrl) setPub(h.publicUrl.replace(/\/$/, '')); }); }, []);
  useEffect(() => {
    const es = new EventSource('/events');
    es.addEventListener('stats', (e) => setS(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('attempt', (e) => { const a = JSON.parse((e as MessageEvent).data); if (soundRef.current && a.blockedKrw > 0 && ctx.current) buzz(ctx.current); });
    es.addEventListener('battle', (e) => {
      const b = JSON.parse((e as MessageEvent).data);
      if (b.who === 'reset') { queue.current = queue.current.then(() => new Promise((r) => setTimeout(r, 1200))).then(() => setLines([])); return; }
      // 말풍선과 소리를 같은 순서로 맞춘다.
      queue.current = queue.current.then(async () => {
        setLines((l) => [...l.slice(-5), { id: lid++, who: b.who, text: b.text }]);
        if (b.who === 'wallet' && soundRef.current && ctx.current) buzz(ctx.current);
        if (b.audioUrl && soundRef.current) await new Promise<void>((res) => { const a = new Audio(b.audioUrl); a.onended = () => res(); a.onerror = () => res(); a.play().catch(() => res()); setTimeout(res, 20000); });
        else await new Promise((r) => setTimeout(r, b.who === 'wallet' ? 1800 : 2200));
      });
    });
    return () => es.close();
  }, []);

  // 행사장 큰 화면(/board?host)만 AI 대결을 켠다. 일반 방문자는 소리만 켜서 관리자 키 창이 뜨지 않는다.
  async function enableSound() {
    ctx.current = new AudioContext(); await ctx.current.resume();
    soundRef.current = true; setSound(true);
    if (HOST) void api('/api/battle', { on: true });
    buzz(ctx.current);
  }
  async function disableSound() { soundRef.current = false; setSound(false); if (HOST) void api('/api/battle', { on: false }); }

  const st = s ?? { attempts: 0, fell: 0, lostKrw: 0, blockedKrw: 0, holdMs: 0, hall: [], recent: [] };
  const holdS = Math.round((st.holdMs ?? 0) / 1000);
  return (
    <div className="board">
      <header className="b-head">
        <h1>AI 순자 할머니는 <em>넘어가도 0원</em>이에요</h1>
        <button className={'btn ' + (sound ? 'weak' : 'night')} onClick={sound ? disableSound : enableSound} style={sound ? { background: 'transparent', color: 'var(--night-text)', borderColor: 'var(--night-line)' } : undefined}>
          {sound ? <><VolumeX size={20} />{HOST ? '소리·AI 대결 끄기' : '소리 끄기'}</> : <><Volume2 size={20} />{HOST ? '소리 켜고 AI 대결 시작' : '소리 켜기'}</>}
        </button>
      </header>
      <p className="b-why">2025 보이스피싱 피해 1조 2,578억 원 · 피해자 53%가 50대 이상 · AI가 속아도 돈은 안 나가요: 자녀가 정한 규칙을 에이전트 지갑이 서명 전에 지켜요</p>
      <div className="b-stats">
        <div className="b-stat"><div className="k">사기꾼 붙잡아 둔 시간</div><div className="v">{holdS >= 60 ? <>{Math.floor(holdS / 60)}<span className="u">분</span> {holdS % 60}</> : holdS}<span className="u">초</span></div></div>
        <div className="b-stat"><div className="k">할머니가 넘어간 횟수</div><div className="v">{st.fell}<span className="u">번</span></div></div>
        <div className="b-stat zero"><div className="k">털린 돈</div><div className="v">{st.lostKrw.toLocaleString('ko-KR')}<span className="u">원</span></div></div>
        <div className="b-stat block"><div className="k">지갑이 막은 금액</div><div className="v">{st.blockedKrw.toLocaleString('ko-KR')}<span className="u">원</span></div></div>
      </div>
      <section className="b-card b-battle" aria-label="AI 김검사 대 AI 순자">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Swords size={22} />AI 김검사 vs AI 순자</h2>
        <div className="stage" aria-live="polite">
          {lines.length === 0 && <p style={{ color: 'var(--night-muted)', margin: 0 }}>{sound ? '김검사가 전화를 거는 중이에요…' : '대결을 시작하면 두 AI가 목소리로 맞붙어요.'}</p>}
          {lines.map((l) => l.who === 'wallet' ? (
            <div key={l.id} className="wallet"><ShieldX size={22} />{l.text}</div>
          ) : (
            <div key={l.id} className={'line ' + l.who}><div className="who">{l.who === 'kim' ? '검' : '순'}</div><div className="say"><b style={{ display: 'block', fontSize: '.8em', opacity: .6 }}>{l.who === 'kim' ? 'AI 김검사' : 'AI 순자'}</b>{l.text}</div></div>
          ))}
        </div>
      </section>
      <div className="b-side">
        <section className="b-card qr-card">
          <div className="qr"><QRCodeSVG value={origin + '/play'} size={148} /></div>
          <div><h2 style={{ marginBottom: 6 }}>직접 털어 보기</h2></div>
          <div className="num qr-url">{origin.replace(/^https?:\/\//, '')}/play</div>
        </section>
        <section className="b-card">
          <h2>명예의 전당</h2>
          {st.hall.length === 0 ? <p style={{ color: 'var(--night-muted)', margin: 0 }}>아직 없어요.</p> : (
            <ol className="b-list">{st.hall.map((h, i) => (
              <li key={h.nick}><span className="rank">{i + 1}</span><span className="grow"><span className="nm">{h.nick}</span><br /><span className="sub">{h.tries}번 만에 · 사기 판정 {pct(h.prob) ?? '-'}%</span></span><b className="num">{won(h.best)}</b></li>
            ))}</ol>
          )}
        </section>
        <section className="b-card">
          <h2>최근 시도</h2>
          {st.recent.length === 0 ? <p style={{ color: 'var(--night-muted)', margin: 0 }}>아직 없어요.</p> : (
            <ul className="b-list">{st.recent.map((r) => (
              <li key={r.id}><span className="grow"><span className="nm">{r.nick}</span><br /><span className="sub">{hhmm(r.ts)} · {r.fell ? '넘어감 ' + won(r.amountKrw) + ' → 거절' : '버팀'}</span></span></li>
            ))}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
