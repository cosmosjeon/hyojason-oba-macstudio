import { withPage } from './shot.mjs';
await withPage(390, 844, async (p) => { await p.goto('http://localhost:8787/'); await p.waitForTimeout(1500); await p.screenshot({ path: process.argv[2] }); });