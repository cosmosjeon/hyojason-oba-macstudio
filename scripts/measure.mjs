import { withPage } from './shot.mjs';
const B='http://localhost:8787';
for (const w of [320, 390, 1440]) for (const u of ['/', '/play', '/board', '/mom', '/family', '/family/settings']) {
  await withPage(w, 900, async (p) => { await p.goto(B + u); await p.waitForTimeout(900);
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, h: document.documentElement.scrollHeight }));
    console.log(w, u, m.sw > m.iw ? 'OVERFLOW ' + m.sw : 'ok', 'h=' + m.h); }, { dpr: 1 });
}