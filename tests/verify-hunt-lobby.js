/* One-off verification driver for the HuntStart polish.
   Loads the built game with images enabled, drives to HuntStart for both
   a procedural-style fallback and a static-house (Owaissa) hunt, and
   writes screenshots. */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const GAME_URL = 'file://' + path.join(ROOT, 'ghost-in-msheet.html');
const OUT_DIR = path.join(ROOT, 'tests', 'verify-out');

async function waitForSugarCube(page) {
  await page.waitForFunction(() => window.SugarCube && SugarCube.State && SugarCube.State.passage !== '', null, { timeout: 15000 });
}

async function goToPassage(page, name) {
  await page.evaluate((p) => SugarCube.Engine.play(p), name);
  await page.waitForFunction((p) => SugarCube.State.passage === p, name, { timeout: 5000 });
  // Allow CSS / background-image fetches to settle
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('CONSOLE:', m.text());
  });

  await page.goto(GAME_URL, { waitUntil: 'load' });
  await waitForSugarCube(page);

  /* --- Case 1: Static house (Owaissa Avenue) --- */
  await page.evaluate(() => {
    // Unlock the city, give the MC some headroom.
    SugarCube.setup.Mc.setLvl(5);
    // Stage Owaissa as the next static house and start a hunt.
    SugarCube.State.variables.pendingHuntHouseId = 'owaissa';
  });
  await goToPassage(page, 'HuntStart');
  await page.screenshot({ path: path.join(OUT_DIR, 'hunt-lobby-owaissa.png'), fullPage: false });
  const owaissaInfo = await page.evaluate(() => {
    const panel = document.querySelector('.hunt-lobby-panel');
    const addr = document.querySelector('.hunt-lobby-address');
    const bgImg = window.getComputedStyle(document.body).backgroundImage;
    return {
      panelPresent: !!panel,
      addressText: addr ? addr.innerText.trim() : null,
      bodyBackgroundImage: bgImg,
      staticHouseId: SugarCube.setup.HuntController.staticHouseId(),
    };
  });
  console.log('Owaissa:', JSON.stringify(owaissaInfo, null, 2));

  /* --- Case 2: Procedural fallback hunt (no static house id) --- */
  // End the in-flight hunt first, then start a procedural one.
  await page.evaluate(() => {
    SugarCube.setup.HuntController.endHunt(false);
    SugarCube.State.variables.pendingHuntHouseId = null;
  });
  await goToPassage(page, 'HuntStart');
  await page.screenshot({ path: path.join(OUT_DIR, 'hunt-lobby-procedural.png'), fullPage: false });
  const procInfo = await page.evaluate(() => {
    const panel = document.querySelector('.hunt-lobby-panel');
    const addr = document.querySelector('.hunt-lobby-address');
    const bgImg = window.getComputedStyle(document.body).backgroundImage;
    return {
      panelPresent: !!panel,
      addressText: addr ? addr.innerText.trim() : null,
      bodyBackgroundImage: bgImg,
      staticHouseId: SugarCube.setup.HuntController.staticHouseId(),
    };
  });
  console.log('Procedural:', JSON.stringify(procInfo, null, 2));

  /* --- Case 3: Elm static house --- */
  await page.evaluate(() => {
    SugarCube.setup.HuntController.endHunt(false);
    SugarCube.State.variables.pendingHuntHouseId = 'elm';
  });
  await goToPassage(page, 'HuntStart');
  await page.screenshot({ path: path.join(OUT_DIR, 'hunt-lobby-elm.png'), fullPage: false });

  /* --- Case 4: Ironclad static house (has its own description) --- */
  await page.evaluate(() => {
    SugarCube.setup.HuntController.endHunt(false);
    SugarCube.State.variables.pendingHuntHouseId = 'ironclad';
  });
  await goToPassage(page, 'HuntStart');
  await page.screenshot({ path: path.join(OUT_DIR, 'hunt-lobby-ironclad.png'), fullPage: false });

  await browser.close();
  console.log('Screenshots written to', OUT_DIR);
})().catch((err) => {
  console.error('Driver failed:', err);
  process.exit(1);
});
