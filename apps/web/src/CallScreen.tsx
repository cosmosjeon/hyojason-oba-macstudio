import { ReactNode, useEffect, useState } from 'react';
import { MessageSquareText, Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react';

export type CallPhase = 'ready' | 'connecting' | 'live' | 'ended' | 'error';
const label: Record<CallPhase, string> = { ready: '음성 통화', connecting: '신호 가는 중…', live: '통화 중', ended: '통화 종료', error: '연결을 확인해 주세요' };
const fmt = (s: number) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

/** 전화 화면: 위에 시간·이름, 아래에 72px 반투명 원형 버튼과 빨간 종료 버튼. */
export function CallScreen(p: {
  name: string; initial: string; badge?: string; phase: CallPhase; speaking?: boolean; caption?: string; error?: string;
  muted: boolean; outputMuted: boolean; onMute: () => void; onSpeaker: () => void; onHang: () => void; onStart?: () => void;
  onText?: (t: string) => void; extra?: ReactNode;
}) {
  const [sec, setSec] = useState(0);
  const [typing, setTyping] = useState(false); const [t, setT] = useState('');
  useEffect(() => { if (p.phase !== 'live') return; setSec(0); const i = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(i); }, [p.phase]);
  return (
    <div className="call" role="dialog" aria-label={p.name + ' 통화'} data-speaking={p.speaking && p.phase === 'live' ? '' : undefined}>
      <div className="call-bg" aria-hidden="true" />
      <div className="call-stage">
        {p.phase === 'live' ? <p className="call-timer" aria-label={'통화 시간 ' + sec + '초'}>{fmt(sec)}</p> : null}
        <p className={p.phase === 'live' ? 'call-status sr-only' : 'call-status'} role="status" style={p.phase === 'live' ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' } : undefined}>{label[p.phase]}</p>
        <h2>{p.name}</h2>
        {p.badge && p.phase !== 'ended' ? <p className="call-badge">{p.badge}</p> : null}
        <div className="call-avatar" aria-hidden="true">{p.initial}</div>
        {p.caption ? <p className="call-caption" aria-live="polite">{p.caption}</p> : null}
        {p.error ? <p className="call-error" role="alert">{p.error}</p> : null}
        {p.extra}
      </div>
      <div className="call-actions">
        {p.phase === 'ready' ? <button className="call-primary" onClick={p.onStart}><Phone size={20} />전화 시작하기</button> : null}
        {p.phase === 'live' && typing && p.onText ? (
          <form className="call-textrow" onSubmit={(e) => { e.preventDefault(); if (t.trim()) { p.onText!(t.trim()); setT(''); } }}>
            <input autoFocus value={t} onChange={(e) => setT(e.target.value)} placeholder="글로 말하기" aria-label="글로 말하기" />
            <button className="call-primary" style={{ width: 'auto', padding: '0 20px' }} disabled={!t.trim()}>보내기</button>
          </form>
        ) : null}
        {p.phase === 'live' ? (
          <div className="call-row">
            <Ctl label="소리" onClick={p.onSpeaker} pressed={!p.outputMuted} aria={p.outputMuted ? '소리 켜기' : '소리 끄기'}>{p.outputMuted ? <VolumeX size={28} /> : <Volume2 size={28} />}</Ctl>
            {p.onText ? <Ctl label="글로 말하기" onClick={() => setTyping((x) => !x)} pressed={typing} aria="글로 말하기"><MessageSquareText size={28} /></Ctl> : null}
            <Ctl label="음소거" onClick={p.onMute} pressed={p.muted} aria={p.muted ? '마이크 켜기' : '마이크 끄기'}>{p.muted ? <MicOff size={28} /> : <Mic size={28} />}</Ctl>
          </div>
        ) : null}
        {p.phase === 'connecting' || p.phase === 'live' || p.phase === 'error' ? (
          <Ctl label={p.phase === 'live' ? '종료' : '취소'} onClick={p.onHang} aria="통화 종료" hangup><PhoneOff size={32} /></Ctl>
        ) : null}
        {p.phase === 'ended' || p.phase === 'error' ? <button className="call-primary" style={{ background: 'rgba(255,255,255,.17)', color: '#fff' }} onClick={p.onHang}>닫기</button> : null}
      </div>
    </div>
  );
}
function Ctl({ label, onClick, pressed, aria, hangup, children }: { label: string; onClick: () => void; pressed?: boolean; aria: string; hangup?: boolean; children: ReactNode }) {
  return <div className="call-ctl"><button className={'call-btn' + (hangup ? ' hangup' : '')} aria-label={aria} aria-pressed={pressed} onClick={onClick}>{children}</button><span aria-hidden="true">{label}</span></div>;
}
