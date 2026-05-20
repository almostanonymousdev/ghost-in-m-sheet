const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, getVar, setVar } = require('./helpers');

/* Unit coverage for the "return to witch to call the ghost" flow.
   Once a contract hunt finishes the in-house work, the MC has to walk
   back to Khadija's desk and name the ghost. The flow is:

       HuntRun -> Outside (HuntOutside) -> WitchInside (sees pending
       link) -> WitchEndContract (dropdown) -> WitchEndContractResolve
       (markSuccess/markFailure + endHunt -> back to WitchInside)

   The hunt stays active across that whole walk -- the only thing that
   ends the run is the guess being locked in at WitchEndContractResolve.
   These tests pin each gate of that flow in isolation. The full
   browser-side walk lives in tests/e2e/witch-end-contract.spec.js. */
test.describe('WitchEndContract — gating + state machine', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => {
    await resetGame(page);
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
  });

  // --- Pending-contract predicate ----------------------------------------
  /* The "you have findings from <house>" link surfaces on WitchInside
     iff all three of: a hunt is active, a contract is held, and the
     run's static house matches the held key. The three conditions are
     ANDed inside the passage; the tests below check each falsy branch. */

  test('pending-contract conditions all true when hunt + held + match', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.staticHouseId()')).toBe('owaissa');
    expect(await callSetup(page, 'setup.WitchContract.heldHouseId()')).toBe('owaissa');
  });

  test('no held contract -> WitchEndContract gate stays false', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
  });

  test('hunt inactive -> WitchEndContract gate stays false even with held key', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(true);
  });

  test('held key for different house -> staticHouseId !== heldHouseId', async () => {
    /* Hold owaissa, walk into elm. The pending link only renders when
       the run matches the held key; mismatched keys must NOT surface
       the "findings" prompt -- the elm run is rogue, not contract. */
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'elm' }));
    const heldId = await callSetup(page, 'setup.WitchContract.heldHouseId()');
    const staticId = await callSetup(page, 'setup.HuntController.staticHouseId()');
    expect(heldId).not.toBe(staticId);
  });

  // --- HuntOutside identify fork ----------------------------------------
  /* HuntOutside computes _isContractHunt from the same triple as the
     pending link. The fork drives whether the "name the ghost" link
     points at HuntIdentify (rogue) or WitchInside (contract). Pin the
     truth-table here. */

  test('identify fork: contract hunt matches the held key', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    const heldId = await callSetup(page, 'setup.WitchContract.heldHouseId()');
    const staticId = await callSetup(page, 'setup.HuntController.staticHouseId()');
    expect(staticId).toBeTruthy();
    expect(heldId).toBe(staticId);
  });

  test('identify fork: rogue hunt has no static house', async () => {
    /* Procedural hunts roll a random floor plan with no staticHouseId
       set. _isContractHunt is `_staticId and _heldId eq _staticId` --
       falsy _staticId short-circuits to rogue. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, modifierCount: 0 }));
    expect(await callSetup(page, 'setup.HuntController.staticHouseId()')).toBeFalsy();
  });

  // --- markSuccess + endHunt(true) (success path) -----------------------

  test('correct guess: markSuccess + endHunt(true) pays contract cash', async () => {
    /* Stamp owaissa contract + run; lock the guess in via the
       Ghosts.ghostTypeSelected accessor (the dropdown writes to that
       backing var); WitchEndContractResolve uses the same accessor. */
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    await page.evaluate(() => { SugarCube.setup.Mc.setMoney(0); });

    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    await page.evaluate(name => { SugarCube.State.variables.ghostTypeSelected = name; }, trueName);

    const guess = await callSetup(page, 'setup.Ghosts.ghostTypeSelected()');
    expect(guess).toBe(trueName);

    await page.evaluate(() => SugarCube.setup.HuntController.markSuccess());
    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));

    expect(summary.isContractHunt).toBe(true);
    expect(summary.cashPayout).toBe(200);
    expect(summary.ectoplasmPayout).toBe(0);
    expect(await callSetup(page, 'setup.Mc.money()')).toBe(200);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  // --- markFailure(WRONG_CALL) + endHunt(false) (burn path) -------------

  test('wrong guess: markFailure(WRONG_CALL) + endHunt(false) burns key', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('elm'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'elm' }));
    await page.evaluate(() => { SugarCube.setup.Mc.setMoney(0); });

    /* Pick a name that's guaranteed to be wrong -- pull the ghost
       catalogue and pick the first entry that isn't the true name. */
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    const wrongName = await page.evaluate(real => {
      const list = SugarCube.setup.Ghosts.list();
      const other = list.find(g => g.name !== real);
      return other ? other.name : null;
    }, trueName);
    expect(wrongName).not.toBe(trueName);

    await page.evaluate(g => { SugarCube.State.variables.ghostTypeSelected = g; }, wrongName);

    await page.evaluate(() => SugarCube.setup.HuntController.markFailure(
      SugarCube.setup.HuntController.FailureReason.WRONG_CALL
    ));
    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));

    expect(summary.isContractHunt).toBe(true);
    expect(summary.cashPayout).toBe(0);
    expect(summary.ectoplasmPayout).toBe(0);
    expect(await callSetup(page, 'setup.Mc.money()')).toBe(0);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  // --- WRONG_CALL failure reason ----------------------------------------

  test('WRONG_CALL is exposed on the FailureReason enum', async () => {
    const reasons = await page.evaluate(() => SugarCube.setup.HuntController.FailureReason);
    expect(reasons.WRONG_CALL).toBe('wrong_call');
  });

  test('WRONG_CALL stamps onto $run.failureReason', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    await page.evaluate(() => SugarCube.setup.HuntController.markFailure(
      SugarCube.setup.HuntController.FailureReason.WRONG_CALL
    ));
    expect(await getVar(page, 'run.failureReason')).toBe('wrong_call');
  });

  // --- endHunt clears run state regardless of outcome --------------------

  test('endHunt(true) on contract hunt clears $run', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  test('endHunt(false) on contract hunt clears $run', async () => {
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });
});
