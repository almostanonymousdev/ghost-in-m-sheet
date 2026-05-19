const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, goToPassage, getVar, setVar } = require('./helpers');

/* Bug-class regressions guarded here:
 *   1. EventMC must apply the dark-room body filter when the hunt's
 *      current room is unlit -- previously it only fired for the
 *      static-house passages where previous() resolves to a room name.
 *      Under the procedural hunt the previous passage is "HuntRun" or
 *      "FurnitureSearch", which Styles.isDarkRoom doesn't know about,
 *      so the filter was silently dropped and every event video read
 *      as fully lit.
 *
 *   2. The Witch's Paranormal Detector must annotate loot-bearing
 *      furniture in HuntRun. Pre-unification this lived in
 *      TickController; the unification refactor moved furniture
 *      rendering to HuntController.currentRoomData() but never re-added
 *      the detector pass, so the purchase had no visible effect.
 *
 *   3. FreezeHunt strips a garment but used to skip the stash + mark
 *      pair, leaving the player permanently down a garment with
 *      nothing to find in the house.
 *
 *   4. StealClothes runs the stash + mark unconditionally at the top
 *      of the passage even when the available-targets list is empty,
 *      flipping isClothesStolen=1 without actually taking anything.
 *      Conversely, when something IS taken, the stash must always land
 *      somewhere on the floor plan -- a recurring report from players
 *      is "clothes were stolen but never appeared anywhere".
 */
test.describe('Hunt — clothes + dark-room bugs', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
  });

  // -----------------------------------------------------------------
  // Bug 1: EventMC dark-room filter under procedural hunt
  // -----------------------------------------------------------------

  test('EventMC applies style-event-mc-dark when the current hunt room is dark', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 42 }));
    /* Mark the spawn room dark so isCurrentRoomDark() returns true. */
    await page.evaluate(() => {
      const run = SugarCube.State.variables.run;
      const rid = run.currentRoomId || run.floorplan.spawnRoomId || 'room_0';
      SugarCube.setup.HuntController.setRoomLight(rid, SugarCube.setup.RoomLight.DARK);
    });

    /* Land on HuntRun so previous() returns a hunt passage, then jump
       to Event which routes through EventMC. */
    await goToPassage(page, 'HuntRun');
    await goToPassage(page, 'EventMC');

    const hasDarkClass = await page.evaluate(() =>
      document.body.classList.contains('style-event-mc-dark'));
    expect(hasDarkClass).toBe(true);
  });

  test('EventMC does NOT apply the dark filter when the current hunt room is lit', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 42 }));
    await page.evaluate(() => {
      const run = SugarCube.State.variables.run;
      const rid = run.currentRoomId || run.floorplan.spawnRoomId || 'room_0';
      SugarCube.setup.HuntController.setRoomLight(rid, SugarCube.setup.RoomLight.LIT);
    });

    await goToPassage(page, 'HuntRun');
    await goToPassage(page, 'EventMC');

    const hasDarkClass = await page.evaluate(() =>
      document.body.classList.contains('style-event-mc-dark'));
    expect(hasDarkClass).toBe(false);
  });

  // -----------------------------------------------------------------
  // Bug 2: Paranormal Detector highlights loot-bearing furniture
  // -----------------------------------------------------------------

  test('HuntRun highlights loot-bearing furniture when the detector is bought', async () => {
    /* Build a deterministic plan with at least one loot pin so we
       know which furniture slot should light up. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 7, floorPlanOpts: { roomCount: 5 }
    }));
    await page.evaluate(() => SugarCube.setup.Witch.buyDetector());
    /* lootKindsAt gates clothesStolen on isClothesStolen=1 (the same
       precondition FurnitureSearch's hasClothesStolen guard checks) so
       the detector highlight matches what the pickup will actually
       hand out. Mark it before stashing. */
    await page.evaluate(() => SugarCube.setup.HauntedHouses.markClothesStolen());
    const stash = await page.evaluate(() =>
      SugarCube.setup.HuntController.stashStolenClothes());
    expect(stash).not.toBeNull();
    /* Move the player into the room with the stash so HuntRun renders
       that room's furniture strip. */
    await page.evaluate(rid => SugarCube.setup.HuntController.setCurrentRoom(rid), stash.roomId);

    await goToPassage(page, 'HuntRun');

    const highlightedCount = await page.evaluate(() =>
      document.querySelectorAll('.hunt-furniture-item.highlighted-furnitureDetector').length);
    expect(highlightedCount).toBeGreaterThan(0);
  });

  test('HuntRun does NOT highlight furniture when the detector is not bought', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 7, floorPlanOpts: { roomCount: 5 }
    }));
    await page.evaluate(() => { delete SugarCube.State.variables.boughtDetector; });
    await page.evaluate(() => SugarCube.setup.HauntedHouses.markClothesStolen());
    const stash = await page.evaluate(() =>
      SugarCube.setup.HuntController.stashStolenClothes());
    await page.evaluate(rid => SugarCube.setup.HuntController.setCurrentRoom(rid), stash.roomId);

    await goToPassage(page, 'HuntRun');

    const highlightedCount = await page.evaluate(() =>
      document.querySelectorAll('.hunt-furniture-item.highlighted-furnitureDetector').length);
    expect(highlightedCount).toBe(0);
  });

  // -----------------------------------------------------------------
  // Bug 3: FreezeHunt must stash + mark when it strips a garment
  // -----------------------------------------------------------------

  test('FreezeHunt with a strippable garment stashes the steal target on the floor plan', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 11, floorPlanOpts: { roomCount: 5 }
    }));
    /* Force a non-empty slot list -- panties is the simplest. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const WORN = SugarCube.setup.ClothingState.WORN;
      const NOT_WORN = SugarCube.setup.ClothingState.NOT_WORN;
      V.tshirtState  = NOT_WORN;
      V.jeansState   = NOT_WORN;
      V.shortsState  = NOT_WORN;
      V.skirtState   = NOT_WORN;
      V.braState     = NOT_WORN;
      V.pantiesState = WORN;
      V.isClothesStolen = 0;
    });

    await goToPassage(page, 'FreezeHunt');

    const isStolen = await getVar(page, 'isClothesStolen');
    expect(isStolen).toBe(1);

    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    expect(fp.loot && fp.loot.clothesStolen).toBeTruthy();
    expect(fp.lootFurniture && fp.lootFurniture.clothesStolen).toBeTruthy();
  });

  test('FreezeHunt with nothing left to give does not stash or mark', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 12, floorPlanOpts: { roomCount: 5 }
    }));
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const NOT_WORN = SugarCube.setup.ClothingState.NOT_WORN;
      V.tshirtState  = NOT_WORN;
      V.jeansState   = NOT_WORN;
      V.shortsState  = NOT_WORN;
      V.skirtState   = NOT_WORN;
      V.braState     = NOT_WORN;
      V.pantiesState = NOT_WORN;
      V.isClothesStolen = 0;
    });

    await goToPassage(page, 'FreezeHunt');

    expect(await getVar(page, 'isClothesStolen')).toBe(0);
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    expect(fp && fp.loot && fp.loot.clothesStolen).toBeFalsy();
  });

  // -----------------------------------------------------------------
  // Bug 4: StealClothes must only stash + mark on a real steal, and
  //        the stash must always land somewhere on the plan when one
  //        fires inside an active hunt.
  // -----------------------------------------------------------------

  test('StealClothes with a real steal target stashes onto the floor plan', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 13, floorPlanOpts: { roomCount: 5 }
    }));
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const WORN = SugarCube.setup.ClothingState.WORN;
      V.pantiesState = WORN;
      V.braState     = WORN;
      V.tshirtState  = WORN;
      V.jeansState   = WORN;
      V.shortsState  = SugarCube.setup.ClothingState.NOT_WORN;
      V.skirtState   = SugarCube.setup.ClothingState.NOT_WORN;
      V.isClothesStolen = 0;
    });

    await goToPassage(page, 'StealClothes');

    expect(await getVar(page, 'isClothesStolen')).toBe(1);
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    expect(fp.loot && fp.loot.clothesStolen).toBeTruthy();
    /* The stash must land on a real furniture-bearing room. */
    const room = fp.rooms.find(r => r.id === fp.loot.clothesStolen);
    expect(room).toBeTruthy();
    const tmpl = await page.evaluate(t =>
      SugarCube.setup.Templates.byId(t), room.template);
    expect(tmpl.furniture).toContain(fp.lootFurniture.clothesStolen);
  });

  test('StealClothes with no available targets does not flip isClothesStolen', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 14, floorPlanOpts: { roomCount: 5 }
    }));
    /* No worn garments -> availableStealTargets returns []. The
       passage should be a no-op for stolen-clothes state instead of
       flipping the flag + planting a phantom stash. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const NOT_WORN = SugarCube.setup.ClothingState.NOT_WORN;
      V.tshirtState  = NOT_WORN;
      V.jeansState   = NOT_WORN;
      V.shortsState  = NOT_WORN;
      V.skirtState   = NOT_WORN;
      V.braState     = NOT_WORN;
      V.pantiesState = NOT_WORN;
      V.isClothesStolen = 0;
    });

    await goToPassage(page, 'StealClothes');

    expect(await getVar(page, 'isClothesStolen')).toBe(0);
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    expect(fp && fp.loot && fp.loot.clothesStolen).toBeFalsy();
  });

  // -----------------------------------------------------------------
  // Generalized invariant: any path that marks isClothesStolen=1
  // inside an active hunt must also place a clothesStolen stash on
  // the floor plan. This is a meta-test that audits the source so a
  // future steal path doesn't drift back into the bug.
  // -----------------------------------------------------------------

  test('every in-hunt clothes-stealing site pairs markClothesStolen with stashStolenClothes', async () => {
    /* lint-style scan: find each call to markClothesStolen() inside a
       passage that runs during an active hunt and check the same
       passage also runs stashStolenClothes(). The MonkeyPaw "leave"
       wish is exempt because it abandons the run on the same tick --
       so the clothes can't be recovered in-house and the stash would
       be pointless. */
    const fs = require('fs');
    const path = require('path');
    const root = path.resolve(__dirname, '..', 'passages');
    const exempt = new Set([
      // MonkeyPaw "leave" exits to HuntSummary; nothing to recover.
      path.join(root, 'gui', 'widgetText.tw')
    ]);

    function walk(dir) {
      const out = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (/\.(tw|js)$/.test(entry.name)) out.push(p);
      }
      return out;
    }
    const offenders = [];
    for (const file of walk(root)) {
      const src = fs.readFileSync(file, 'utf8');
      if (!/markClothesStolen\s*\(/.test(src)) continue;
      if (exempt.has(file)) continue;
      if (!/stashStolenClothes\s*\(/.test(src)) {
        offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
