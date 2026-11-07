import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';

const LOOP = '/trailer/hyojason-loop.mp4';
const FULL = '/trailer/hyojason-trailer.mp4';
const POSTER = '/trailer/hyojason-poster.jpg';

export default function Home() {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  // 버튼 글자는 내 상태값이 아니라 영상의 실제 상태(음소거·로딩)에서만 정한다.
  const [audible, setAudible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const v = ref.current; if (!v) return;
    const sync = () => setAudible(!v.muted && !v.paused && v.src.endsWith(FULL));
    const wait = () => setLoading(v.src.endsWith(FULL) && !v.muted);
    const ready = () => setLoading(false);
    const evs: [string, () => void][] = [['volumechange', sync], ['play', sync], ['pause', sync], ['playing', () => { ready(); sync(); }], ['waiting', wait], ['loadstart', wait], ['canplay', ready]];
    evs.forEach(([e, f]) => v.addEventListener(e, f));
    return () => evs.forEach(([e, f]) => v.removeEventListener(e, f));
  }, [failed]);

  // 소리 없는 15초 반복본에는 소리가 없다. 처음 켤 때만 49초 예고편으로 바꾸고, 그 뒤로는 음소거만 켜고 끈다.
  function toggle() {
    const v = ref.current; if (!v) return;
    if (audible || (loading && !v.muted)) { v.muted = true; setLoading(false); return; }
    if (!v.src.endsWith(FULL)) { v.src = FULL; v.loop = true; v.load(); }
    v.muted = false;
    void v.play().catch(() => { v.muted = true; });
  }
  const on = audible || loading;
  return (
    <div className="shell">
      <main className="page" style={{ padding: 0, gap: 0 }}>
        <div className="hero-video">
          {failed && <img src={POSTER} alt="효자손 화면" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
          {!failed && (
            <video ref={ref} src={LOOP} poster={POSTER} autoPlay muted loop playsInline preload="auto" onError={() => setFailed(true)} aria-label="효자손 예고편" />
          )}
          {!failed && (
            <button className="btn sm weak hero-sound" onClick={toggle} aria-pressed={on}>
              {on ? <VolumeX size={18} /> : <Volume2 size={18} />}{loading ? '불러오는 중' : on ? '소리 끄기' : '소리 켜기'}
            </button>
          )}
        </div>
        <div style={{ padding: 'var(--space-4) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom))' }}>
          <Link to="/play" className="btn block lime" style={{ minHeight: 60, textDecoration: 'none', fontSize: 'var(--text-section)' }}>순자 할머니 털어 보기</Link>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
            <Link to="/mom" className="btn weak" style={{ textDecoration: 'none', minHeight: 52, fontSize: 15 }}>엄마 결제</Link>
            <Link to="/family/settings" className="btn weak" style={{ textDecoration: 'none', minHeight: 52, fontSize: 15 }}>자녀 규칙</Link>
            <Link to="/family" className="btn weak" style={{ textDecoration: 'none', minHeight: 52, fontSize: 15 }}>가족방</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
