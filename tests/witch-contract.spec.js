const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, setVar, callSetup } = require('./helpers');

/* setup.WitchContract is Khadija's contract storefront. State is
   bundled under $contracts ({ offered, held, lastRefreshDay }). The
   board refreshes whenever $dailySeed advances; buying a key deducts
   cash + stamps held; resolving a key on success pays the contract
   payout, on failure burns it. HuntController.endHunt() splits the
   payout: contract hunts pay cash only, rogue hunts pay cash AND
   ectoplasm. */
test.describe('WitchContract storefront', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => {
    await resetGame(page);
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    /* Default MC starts at level 0; elm needs lvl 3 + ironclad needs
       lvl 4 plus the warden-outfit gate. Lift to lvl 3 so owaissa +
       elm appear on the board; ironclad stays gated, which we rely on
       for the level/gate filter tests below. */
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 3; });
  });

  // --- Default state -----------------------------------------------------

  test('fresh save initialises $contracts to an empty board', async () => {
    expect(await getVar(page, 'contracts')).toEqual({
      offered: [], held: null, lastRefreshDay: -1
    });
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
    expect(await callSetup(page, 'setup.WitchContract.held()')).toBeNull();
    expect(await callSetup(page, 'setup.WitchContract.heldHouseId()')).toBeNull();
  });

  // --- Daily refresh + level / unlock gates ------------------------------

  test('offered() lists every catalogue house the MC has access to', async () => {
    /* lvl 3 in beforeEach -> owaissa (gate 0) + elm (gate 3); ironclad
       (gate 4 + warden-outfit predicate) stays off the board. */
    const ids = (await callSetup(page, 'setup.WitchContract.offered()'))
      .map(c => c.houseId).sort();
    expect(ids).toEqual(['elm', 'owaissa']);
  });

  test('offered() filters by MC.lvl()', async () => {
    /* Drop below elm's level gate -- the elm row disappears. */
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 0; });
    await page.evaluate(() => SugarCube.setup.WitchContract.ensureFresh());
    /* ensureFresh is keyed off $dailySeed, so we have to bust the
       cached lastRefreshDay before calling it again to see a fresh
       roll. The controller treats -1 as "never refreshed", so reset
       it to that to force a rebuild. */
    await page.evaluate(() => { SugarCube.State.variables.contracts.lastRefreshDay = -1; });
    const ids = (await callSetup(page, 'setup.WitchContract.offered()'))
      .map(c => c.houseId);
    expect(ids).toEqual(['owaissa']);
  });

  test('offered() filters by per-house gate predicate (ironclad warden-outfit)', async () => {
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 5; });
    await page.evaluate(() => { SugarCube.State.variables.contracts.lastRefreshDay = -1; });
    /* lvl 5 clears the level gate, but ironclad still has a gate()
       predicate keyed on the warden outfit, which the MC has not
       bought. The board should expose owaissa + elm only. */
    const ids = (await callSetup(page, 'setup.WitchContract.offered()'))
      .map(c => c.houseId).sort();
    expect(ids).toEqual(['elm', 'owaissa']);
  });

  test('ensureFresh() rebuilds the board when the day advances', async () => {
    /* Pin lastRefreshDay to the current dailySeed -- offered list is
       in sync. Bump the day cursor by 1 and re-call ensureFresh; the
       board should rebuild because the day changed. */
    await page.evaluate(() => SugarCube.setup.WitchContract.ensureFresh());
    const firstDay = await getVar(page, 'contracts.lastRefreshDay');
    expect(firstDay).toBe(await getVar(page, 'dailySeed'));

    await page.evaluate(() => { SugarCube.State.variables.dailySeed = (SugarCube.State.variables.dailySeed + 1) >>> 0; });
    await page.evaluate(() => SugarCube.setup.WitchContract.ensureFresh());
    expect(await getVar(page, 'contracts.lastRefreshDay'))
      .toBe(await getVar(page, 'dailySeed'));
  });

  test('ensureFresh() is idempotent within a single day', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.ensureFresh());
    const first = await callSetup(page, 'setup.WitchContract.offered()');
    /* Mutate $mc.lvl on the second call -- the rebuild is suppressed
       by lastRefreshDay so the offered list stays as it was. */
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 0; });
    await page.evaluate(() => SugarCube.setup.WitchContract.ensureFresh());
    const second = await callSetup(page, 'setup.WitchContract.offered()');
    expect(second).toEqual(first);
  });

  test('refresh() rebuilds the board even when the day has not advanced', async () => {
    /* Prime the cache; offered() reflects $mc.lvl = 3 (owaissa + elm). */
    await page.evaluate(() => SugarCube.setup.WitchContract.ensureFresh());
    const before = (await callSetup(page, 'setup.WitchContract.offered()'))
      .map(c => c.houseId).sort();
    expect(before).toEqual(['elm', 'owaissa']);

    /* Drop the level under elm's gate without touching $dailySeed.
       ensureFresh() would short-circuit on lastRefreshDay; refresh()
       must reroll anyway -- this is the sleep-time guarantee. */
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 0; });
    await page.evaluate(() => SugarCube.setup.WitchContract.refresh());
    const after = (await callSetup(page, 'setup.WitchContract.offered()'))
      .map(c => c.houseId);
    expect(after).toEqual(['owaissa']);
  });

  test('sleepAdvance() rerolls the board on a sub-midnight nap', async () => {
    /* Hold the clock at 18:00 + sleep only 1 hour so $dailySeed never
       reseeds. Without the sleep-time refresh hook the board would
       remain stale until the next midnight rollover. */
    await page.evaluate(() => {
      SugarCube.setup.Time.setHours(18);
      SugarCube.setup.Time.setMinutes(0);
    });
    const seedBefore = await getVar(page, 'dailySeed');

    /* Prime the board at lvl 3 (owaissa + elm), then drop the level
       under elm's gate before sleeping. The post-sleep board should
       reflect the new level. */
    await page.evaluate(() => SugarCube.setup.WitchContract.ensureFresh());
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 0; });

    await page.evaluate(() => SugarCube.setup.Home.sleepAdvance(1));

    expect(await getVar(page, 'dailySeed')).toBe(seedBefore);
    const offered = (await callSetup(page, 'setup.WitchContract.offered()'))
      .map(c => c.houseId);
    expect(offered).toEqual(['owaissa']);
  });

  test('sleepAdvance() leaves the held contract intact', async () => {
    /* The held key is the player's purchased contract; sleeping must
       reroll the offered list but never burn what the MC already paid
       for. */
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.Home.sleepAdvance(8));
    expect(await callSetup(page, 'setup.WitchContract.heldHouseId()')).toBe('owaissa');
  });

  // --- Buying a key ------------------------------------------------------

  test('buyContract() deducts the fee, removes the offering, stamps held', async () => {
    await page.evaluate(() => { SugarCube.setup.Mc.setMoney(500); });
    expect(await callSetup(page, 'setup.WitchContract.buyContract("owaissa")')).toBe(true);

    expect(await callSetup(page, 'setup.Mc.money()')).toBe(470); // 500 - 30
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(true);
    expect(await callSetup(page, 'setup.WitchContract.heldHouseId()')).toBe('owaissa');

    const offered = await callSetup(page, 'setup.WitchContract.offered()');
    expect(offered.map(c => c.houseId)).not.toContain('owaissa');
  });

  test('buyContract() refuses when the MC cannot pay', async () => {
    await page.evaluate(() => { SugarCube.setup.Mc.setMoney(10); });
    expect(await callSetup(page, 'setup.WitchContract.buyContract("owaissa")')).toBe(false);
    expect(await callSetup(page, 'setup.Mc.money()')).toBe(10);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
  });

  test('buyContract() refuses when a contract is already held', async () => {
    await page.evaluate(() => { SugarCube.setup.Mc.setMoney(500); });
    expect(await callSetup(page, 'setup.WitchContract.buyContract("owaissa")')).toBe(true);
    /* Second purchase must be refused -- the witch sells one key at a
       time. Elm is still on the board but the held slot is occupied. */
    expect(await callSetup(page, 'setup.WitchContract.buyContract("elm")')).toBe(false);
    expect(await callSetup(page, 'setup.WitchContract.heldHouseId()')).toBe('owaissa');
    expect(await callSetup(page, 'setup.Mc.money()')).toBe(470);
  });

  test('buyContract() refuses houses that are not on today\'s board', async () => {
    await page.evaluate(() => { SugarCube.setup.Mc.setMoney(5000); });
    /* Ironclad is gated by warden-outfit so it never makes it onto
       the board at lvl 3. buyContract should refuse rather than
       silently stamp held. */
    expect(await callSetup(page, 'setup.WitchContract.buyContract("ironclad")')).toBe(false);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
    expect(await callSetup(page, 'setup.Mc.money()')).toBe(5000);
  });

  test('buyContract() refuses unknown house ids', async () => {
    await page.evaluate(() => { SugarCube.setup.Mc.setMoney(5000); });
    expect(await callSetup(page, 'setup.WitchContract.buyContract("not_a_house")')).toBe(false);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
  });

  // --- canEnterHouse predicate ------------------------------------------

  test('canEnterHouse() gates static houses on the matching held key', async () => {
    expect(await callSetup(page, 'setup.WitchContract.canEnterHouse("owaissa")')).toBe(false);
    expect(await callSetup(page, 'setup.WitchContract.canEnterHouse("elm")')).toBe(false);

    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    expect(await callSetup(page, 'setup.WitchContract.canEnterHouse("owaissa")')).toBe(true);
    expect(await callSetup(page, 'setup.WitchContract.canEnterHouse("elm")')).toBe(false);
  });

  // --- Resolving a held contract ----------------------------------------

  test('resolveHeld(true) returns the contract payout and clears held', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    const pay = await callSetup(page, 'setup.WitchContract.resolveHeld(true)');
    expect(pay).toBe(200);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
  });

  test('resolveHeld(false) burns the key for 0 and clears held', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('elm'));
    const pay = await callSetup(page, 'setup.WitchContract.resolveHeld(false)');
    expect(pay).toBe(0);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
  });

  test('resolveHeld() with no held contract is a no-op and returns 0', async () => {
    expect(await callSetup(page, 'setup.WitchContract.resolveHeld(true)')).toBe(0);
    expect(await callSetup(page, 'setup.WitchContract.resolveHeld(false)')).toBe(0);
  });

  test('feeFor() / payoutFor() expose the templated terms', async () => {
    expect(await callSetup(page, 'setup.WitchContract.feeFor("owaissa")')).toBe(30);
    expect(await callSetup(page, 'setup.WitchContract.payoutFor("owaissa")')).toBe(200);
    expect(await callSetup(page, 'setup.WitchContract.feeFor("elm")')).toBe(75);
    expect(await callSetup(page, 'setup.WitchContract.payoutFor("elm")')).toBe(500);
    expect(await callSetup(page, 'setup.WitchContract.feeFor("ironclad")')).toBe(200);
    expect(await callSetup(page, 'setup.WitchContract.payoutFor("ironclad")')).toBe(1200);
    expect(await callSetup(page, 'setup.WitchContract.feeFor("not_a_house")')).toBeNull();
  });
});

/* HuntController.endHunt() splits the payout between cash (always) and
   ectoplasm (rogue hunts only). The contract hunt path consumes the
   held contract through setup.WitchContract.resolveHeld(); the rogue
   path falls back to the legacy 50-cash + 10-ectoplasm-on-success /
   3-ectoplasm-on-failure block. */
test.describe('HuntController.endHunt() payout split', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => {
    await resetGame(page);
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    await page.evaluate(() => { SugarCube.setup.Mc.setMoney(0); });
  });

  test('contract hunt (success) pays cash only -- no ectoplasm', async () => {
    /* Stamp the held key first, then start a static-house run so
       $run.staticHouseId matches heldHouseId. endHunt(true) pays the
       owaissa payout (200) and nothing else. */
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));

    const moneyBefore = await callSetup(page, 'setup.Mc.money()');
    const ectoplasmBefore = await callSetup(page, 'setup.HuntController.ectoplasm()');

    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));

    expect(summary.isContractHunt).toBe(true);
    expect(summary.cashPayout).toBe(200);
    expect(summary.ectoplasmPayout).toBe(0);
    expect(await callSetup(page, 'setup.Mc.money()')).toBe(moneyBefore + 200);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(ectoplasmBefore);
    /* Resolving consumes the held key. */
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
  });

  test('contract hunt (failure) burns the key for no payout', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('elm'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'elm' }));

    const moneyBefore = await callSetup(page, 'setup.Mc.money()');
    const ectoplasmBefore = await callSetup(page, 'setup.HuntController.ectoplasm()');

    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));

    expect(summary.isContractHunt).toBe(true);
    expect(summary.cashPayout).toBe(0);
    expect(summary.ectoplasmPayout).toBe(0);
    expect(await callSetup(page, 'setup.Mc.money()')).toBe(moneyBefore);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(ectoplasmBefore);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
  });

  test('rogue hunt (success) pays cash AND ectoplasm', async () => {
    /* No contract held. modifierCount=0 suppresses the modifier deck
       so the payout multiplier stays at the procedural baseline (1),
       pinning the test against the raw cash/ectoplasm numbers rather
       than the seed-dependent draft. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, modifierCount: 0 }));

    const moneyBefore = await callSetup(page, 'setup.Mc.money()');
    const ectoplasmBefore = await callSetup(page, 'setup.HuntController.ectoplasm()');

    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));

    expect(summary.isContractHunt).toBe(false);
    expect(summary.cashPayout).toBe(50);
    expect(summary.ectoplasmPayout).toBe(10);
    expect(await callSetup(page, 'setup.Mc.money()')).toBe(moneyBefore + 50);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(ectoplasmBefore + 10);
  });

  test('rogue hunt (failure) pays consolation ectoplasm but no cash', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, modifierCount: 0 }));

    const moneyBefore = await callSetup(page, 'setup.Mc.money()');
    const ectoplasmBefore = await callSetup(page, 'setup.HuntController.ectoplasm()');

    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));

    expect(summary.isContractHunt).toBe(false);
    expect(summary.cashPayout).toBe(0);
    expect(summary.ectoplasmPayout).toBe(3);
    expect(await callSetup(page, 'setup.Mc.money()')).toBe(moneyBefore);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(ectoplasmBefore + 3);
  });

  test('held key for a different house falls back to the rogue payout', async () => {
    /* Hold owaissa key, run elm. heldHouseId !== run.staticHouseId so
       isContractHunt is false; payout is rogue (cash + ectoplasm).
       The owaissa key stays held -- nothing consumes it. Elm's
       catalogue entry pins modifierCount to 0, so the payout multiplier
       stays at the baseline (1). */
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'elm' }));

    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));

    expect(summary.isContractHunt).toBe(false);
    expect(summary.cashPayout).toBe(50);
    expect(summary.ectoplasmPayout).toBe(10);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(true);
    expect(await callSetup(page, 'setup.WitchContract.heldHouseId()')).toBe('owaissa');
  });
});
