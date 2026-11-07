import { withPage } from './scripts-shot.mjs';
const B = 'http://localhost:8787';
for (const w of [390, 320]) await withPage(w, 844, async (p) => {
  await p.goto(B + '/play'); await p.fill('#nick', '효자손팬');
  await p.getByText('서울중앙지검').click();
  await p.click('button[aria-label="보내기"]');
  await p.waitForSelector('.reject', { timeout: 40000 }); await p.waitForTimeout(5000);
  await p.screenshot({ path: 'design/build-play-chat-' + w + '.png' });
  console.log('cool label', await p.locator('.send').last().getAttribute('aria-label'));
});
