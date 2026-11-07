import { withPage } from './shot.mjs';
const B = 'http://localhost:8787';
const pages = [['play', '/play'], ['mom', '/mom'], ['family', '/family'], ['family-settings', '/family/settings']];
for (const [n, u] of pages) await withPage(390, 844, async (p) => { await p.goto(B + u); await p.waitForTimeout(1200); await p.screenshot({ path: 'design/build-' + n + '-390.png', fullPage: true }); });
await withPage(1440, 900, async (p) => { await p.goto(B + '/board'); await p.waitForTimeout(1500); await p.screenshot({ path: 'design/build-board-1440.png', fullPage: true }); });
await withPage(390, 844, async (p) => { await p.goto(B + '/board'); await p.waitForTimeout(1500); await p.screenshot({ path: 'design/build-board-390.png', fullPage: true }); });
await withPage(1440, 900, async (p) => { await p.goto(B + '/play'); await p.waitForTimeout(800); await p.screenshot({ path: 'design/build-play-1440.png' }); });
