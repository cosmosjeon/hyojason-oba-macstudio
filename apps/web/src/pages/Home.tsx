import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';

const LOOP = '/trailer/hyojason-loop.mp4';
const FULL = '/trailer/hyojason-trailer.mp4';
const POSTER = '/trailer/hyojason-poster.jpg';

export default function Home() {
  const ref = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const [failed, setFailed] = useState(false);

  // 소리를 켜면 45초 예고편으로 바꿔 처음부터 재생하고, 끄면 15초 루프로 돌아간다.
  function toggle() {
    const v = ref.current; const next = !sound;
    setSound(next);
    if (!v) return;
    v.src = next ? FULL : LOOP; v.muted = !next; v.loop = true; v.load();
    void v.play().catch(() => { v.muted = true; setSound(false); });
  }
  return (
    <div className="shell">
      <main className="page" style={{ padding: 0, gap: 0 }}>
        <div className="hero-video">
          {!failed && (
            <video ref={ref} src={LOOP} poster={POSTER} autoPlay muted loop playsInline preload="auto" onError={() => setFailed(true)} aria-label="효자손 예고편" />
          )}
          {!failed && (
            <button className="btn sm weak hero-sound" onClick={toggle} aria-pressed={sound}>
              {sound ? <VolumeX size={18} /> : <Volume2 size={18} />}{sound ? '소리 끄기' : '소리 켜기'}
            </button>
          )}
        </div>
        <div style={{ padding: 'var(--space-4) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom))' }}>
          <Link to="/play" className="btn block lime" style={{ minHeight: 60, textDecoration: 'none', fontSize: 'var(--text-section)' }}>순자 할머니 털어 보기</Link>
        </div>
      </main>
    </div>
  );
}
