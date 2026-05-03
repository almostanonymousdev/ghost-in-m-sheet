const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, setVar, callSetup } = require('./helpers');

/* setup.Time owns the in-world clock and the per-day random seed.
   $dailySeed is regenerated on every 24h rollover so daily-content
   pickers (shop rotations, daily event rolls) can derive
   deterministic per-day choices from one shared source. */
test.describe('TimeController', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
  });

  test('$dailySeed is initialised at game start', async () => {
    const seed = await getVar(page, 'dailySeed');
    expect(typeof seed).toBe('number');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });

  test('setup.addTime regenerates $dailySeed on 24h rollover', async () => {
    await setVar(page, 'hours', 23);
    await setVar(page, 'minutes', 30);
    await setVar(page, 'dailySeed', 42);

    const rolled = await page.evaluate(() => SugarCube.setup.addTime(60));
    expect(rolled).toBe(true);

    const seed = await getVar(page, 'dailySeed');
    expect(seed).not.toBe(42);
  });

  test('setup.addTime leaves $dailySeed alone when the day does not roll', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'minutes', 0);
    await setVar(page, 'dailySeed', 42);

    const rolled = await page.evaluate(() => SugarCube.setup.addTime(60));
    expect(rolled).toBe(false);

    expect(await getVar(page, 'dailySeed')).toBe(42);
  });

  test('setup.Time.sleepAdvanceHours regenerates $dailySeed on rollover', async () => {
    await setVar(page, 'hours', 22);
    await setVar(page, 'dailySeed', 42);

    const rolled = await callSetup(page, 'setup.Time.sleepAdvanceHours(4)');
    expect(rolled).toBe(true);

    const seed = await getVar(page, 'dailySeed');
    expect(seed).not.toBe(42);
  });

  test('setup.Time.sleepAdvanceHours leaves $dailySeed alone without rollover', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'dailySeed', 42);

    const rolled = await callSetup(page, 'setup.Time.sleepAdvanceHours(4)');
    expect(rolled).toBe(false);

    expect(await getVar(page, 'dailySeed')).toBe(42);
  });

  test('setup.Time.addMinutes cascades minute rollover into +1 hour', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'minutes', 45);
    await setVar(page, 'dailySeed', 42);

    const rolled = await callSetup(page, 'setup.Time.addMinutes(30)');
    expect(rolled).toBe(false);

    expect(await getVar(page, 'hours')).toBe(11);
    expect(await getVar(page, 'minutes')).toBe(15);
    expect(await getVar(page, 'dailySeed')).toBe(42);
  });

  test('setup.Time.addMinutes propagates 24h rollover from minute cascade', async () => {
    await setVar(page, 'hours', 23);
    await setVar(page, 'minutes', 45);
    await setVar(page, 'dailySeed', 42);

    const rolled = await callSetup(page, 'setup.Time.addMinutes(30)');
    expect(rolled).toBe(true);

    expect(await getVar(page, 'hours')).toBe(0);
    expect(await getVar(page, 'minutes')).toBe(15);
    expect(await getVar(page, 'dailySeed')).not.toBe(42);
  });

  test('setup.Time.addHours wraps past 24 with single-call rollover', async () => {
    await setVar(page, 'hours', 22);
    await setVar(page, 'dailySeed', 42);

    const rolled = await callSetup(page, 'setup.Time.addHours(5)');
    expect(rolled).toBe(true);

    expect(await getVar(page, 'hours')).toBe(3);
    expect(await getVar(page, 'dailySeed')).not.toBe(42);
  });
});
