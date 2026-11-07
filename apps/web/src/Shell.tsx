import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function Shell({ title, back = '/', right, children, flush }: { title?: string; back?: string | null; right?: ReactNode; children: ReactNode; flush?: boolean }) {
  const nav = useNavigate();
  return (
    <div className="shell">
      <header className="topbar">
        {back !== null && <button className="iconbtn" aria-label="뒤로" onClick={() => (back ? nav(back) : nav(-1))}><ArrowLeft size={24} /></button>}
        <div style={{ flex: 1, fontWeight: 700, fontSize: 'var(--text-nav)' }}>{title}</div>
        {right}
      </header>
      {flush ? children : <main className="page">{children}</main>}
    </div>
  );
}
export { Link };
