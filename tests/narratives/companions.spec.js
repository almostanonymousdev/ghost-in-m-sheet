/*
 * Narrative test for each companion (Brook, Alice, Blake) and their
 * per-character special-event passages.
 *
 * For each companion this spec exercises:
 *   1. The intro / meet passage that flips `hasMet()` true and unlocks
 *      the contact row + the "Ask her to join" link.
 *   2. The Spirit-bedroom dispatch
 *      (`GhostSpecialEventSpirit` -> activeSpiritEventPassage()).
 *   3. The lust >= 50 walk-home variant
 *      (`WalkHomeTogether` -> walkHomePassage), including the
 *      Continue-passage handoff for the companions that have one.
 *   4. The in-hunt `<<companionHelpOption>>` target passage (BrookHelp /
 *      AliceHelp / BlakeHelp).
 *   5. The "I sent her solo" debrief
 *      (`BrookHuntEndAlone` / `AliceHuntEndAlone` / `BlakeHuntEndAlone`).
 *   6. Per-character unique hooks:
 *        - Brook: `activatePossessionOnHuntTool` (lvl >= 2 + active hunt
 *          flag stamps "Brook possessed at home").
 *        - Alice: `onHuntFail` clears `$aliceWorkDone` unless she was on
 *          a solo run. `huntOverPassage` resolves to `"AliceHuntOver"`.
 *        - Blake: `onHuntFail` returns the carried cursed item to the
 *          Witch's inventory. `triggersPossessionCursedItem === true`.
 */

const { test, expect } = require('../fixtures');
const { setVar, getVar, goToPassage, seedRandom } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('../e2e/e2e-helpers');

async function pickCompanion(game, name) {
  await game.evaluate((n) => {
    SugarCube.setup.Companion.pick(n);
    // pick() resets sanity/lust but doesn't seed a sensualBodyPart map.
    if (!SugarCube.State.variables.sensualBodyPart) {
      SugarCube.State.variables.sensualBodyPart = {
        brain: 0, tits: 0, ass: 0, bottom: 0,
        mouth: 0, pussy: 0, anal: 0,
      };
    }
  }, name);
}

async function unpickCompanion(game) {
  await game.evaluate(() => {
    delete SugarCube.State.variables.companion;
    SugarCube.State.variables.isCompChosen = false;
  });
}

test.describe('Companions', () => {

  // ---------- Brook ----------

  test.describe('Brook', () => {

    test('catalogue: helpPassage / walkHomePassage / spiritEventPassage are wired', async ({ game }) => {
      const cfg = await game.evaluate(() => {
        const c = SugarCube.setup.Companion.getByName('Brook');
        return {
          help: c.helpPassage, walk: c.walkHomePassage,
          spirit: c.spiritEventPassage, info: c.infoPassage,
          alone: c.huntEndAlonePassage,
          homeContinue: c.homeContinuePassage,
        };
      });
      expect(cfg).toEqual({
        help: 'BrookHelp', walk: 'BrookWalkHome',
        spirit: 'BrookSpiritEvent', info: 'BrookInfo',
        alone: 'BrookHuntEndAlone',
        homeContinue: null,
      });
    });

    test('intro: LibraryBrook renders the first-meeting trade dialogue when hasMet is false', async ({ game }) => {
      await game.evaluate(() => {
        SugarCube.State.variables.meetBrook = undefined;
        delete SugarCube.State.variables.brookLibraryAfterIntro;
      });
      expect(await game.evaluate(() => SugarCube.setup.Library.hasMetBrook())).toBe(false);

      await goToPassage(game, 'LibraryBrook');
      await expectCleanPassage(game);

      const body = await game.locator('.passage').textContent();
      expect(body).toMatch(/I'm Brook, by the way/);
      expect(body).toMatch(/I copy the page, you take me on a hunt/);
    });

    test('intro: visiting LibraryBrook flips hasMetBrook + discovers Mimic', async ({ game }) => {
      await game.evaluate(() => {
        SugarCube.State.variables.meetBrook = undefined;
        SugarCube.State.variables.ghostDiscovered = {};
      });

      await goToPassage(game, 'LibraryBrook');
      await expectCleanPassage(game);

      expect(await game.evaluate(() => SugarCube.setup.Library.hasMetBrook())).toBe(true);
      expect(await game.evaluate(() => SugarCube.setup.Ghosts.hasDiscovered('Mimic'))).toBe(true);
    });

    test('intro: post-meeting LibraryBrook shows the "Ask Brooke to join" link', async ({ game }) => {
      await game.evaluate(() => SugarCube.setup.Library.meetBrookFirstTime());
      await goToPassage(game, 'LibraryBrook');
      const ask = game.locator('a:has-text("Ask Brooke to join you for ghost hunting tonight.")');
      await expect(ask).toBeVisible();
    });

    test('pick(Brook) stamps the companion marker and resets stats', async ({ game }) => {
      await pickCompanion(game, 'Brook');
      expect(await getVar(game, 'companion.name')).toBe('Brook');
      expect(await game.evaluate(() => SugarCube.setup.Companion.activeCompanionName())).toBe('Brook');
      expect(await game.evaluate(() => SugarCube.setup.Companion.sanity())).toBe(100);
      expect(await game.evaluate(() => SugarCube.setup.Companion.lust())).toBe(0);
    });

    test('spirit event: GhostSpecialEventSpirit -> BrookSpiritEvent when Brook is active', async ({ game }) => {
      await pickCompanion(game, 'Brook');
      expect(
        await game.evaluate(() => SugarCube.setup.SpecialEvent.activeSpiritEventPassage())
      ).toBe('BrookSpiritEvent');

      await goToPassage(game, 'GhostSpecialEventSpirit');
      const body = await game.locator('.passage').textContent();
      expect(body).toMatch(/What the~/);
      // Brook-specific opening: friend wakes with the MC and sees the figure.
      expect(body).toMatch(/big dick/i);
    });

    test('spirit event: chain terminates at the Sleep link', async ({ game }) => {
      await pickCompanion(game, 'Brook');
      await goToPassage(game, 'BrookSpiritEvent');
      await expectCleanPassage(game);

      await game.locator('a:has-text("What the~")').click();
      await game.locator('a:has-text("one after the other")').first().click();
      await game.locator('a:has-text("to do whatever he wants.")').click();
      await game.locator('a:has-text("suck his cock in turns to catch your breath.")').click();
      await game.locator('a:has-text("cums on you.")').click();
      const sleep = game.locator('a:has-text("Sleep")');
      await expect(sleep).toBeVisible();
    });

    test('walk-home: WalkHomeTogether at lust >= 50 dispatches to BrookWalkHome', async ({ game }) => {
      await pickCompanion(game, 'Brook');
      await game.evaluate(() => SugarCube.setup.Companion.setActiveLust(60));
      // Force hunt mode out of ACTIVE so the ghost-following branch
      // doesn't intercept us.
      await game.evaluate(() => {
        SugarCube.setup.HuntController.setHuntMode(
          SugarCube.setup.HuntController.HuntMode.NONE
        );
      });

      await goToPassage(game, 'WalkHomeTogether');
      await expectCleanPassage(game);

      const body = await game.locator('.passage').textContent();
      expect(body).toMatch(/strap-on/);
      const trigger = game.locator('a:has-text("this strap-on.")');
      await expect(trigger).toBeVisible();
    });

    test('walk-home: lust < 50 falls through to the generic thanks line', async ({ game }) => {
      await pickCompanion(game, 'Brook');
      await game.evaluate(() => SugarCube.setup.Companion.setActiveLust(10));
      await game.evaluate(() => {
        SugarCube.setup.HuntController.setHuntMode(
          SugarCube.setup.HuntController.HuntMode.NONE
        );
      });

      await goToPassage(game, 'WalkHomeTogether');
      await expectCleanPassage(game);

      const body = await game.locator('.passage').textContent();
      expect(body).toMatch(/Thanks for walking me back/);
    });

    test('help: BrookHelp renders the high-sanity variant when both sanities are >= 50', async ({ game }) => {
      await setupHunt(game, 'Shade');
      await pickCompanion(game, 'Brook');
      await setVar(game, 'mc.sanity', 80);
      await game.evaluate(() => {
        const c = SugarCube.setup.Companion.activeState();
        c.sanity = 80; c.lust = 60;
      });
      // Force the random(1,3) Cthulion roll to NOT trigger (>1).
      await game.evaluate(() => { Math.random = () => 0.9; });

      await goToPassage(game, 'BrookHelp');
      await expectCleanPassage(game);

      const body = await game.locator('.passage').textContent();
      expect(body).toMatch(/cheap whore/);
      // helpEventEaseActive fires during render: sanity bumped, lust zeroed.
      expect(await game.evaluate(() => SugarCube.setup.Companion.lust())).toBe(0);
    });

    test('help: Continue link routes back to the prior passage', async ({ game }) => {
      await setupHunt(game, 'Shade');
      await pickCompanion(game, 'Brook');
      await setVar(game, 'mc.sanity', 80);
      await game.evaluate(() => {
        const c = SugarCube.setup.Companion.activeState();
        c.sanity = 80; c.lust = 60;
      });
      await game.evaluate(() => { Math.random = () => 0.9; });

      await goToPassage(game, 'BrookHelp');
      const cont = game.locator('a:has-text("Continue")');
      await expect(cont).toBeVisible();
    });

    test('solo-hunt debrief: BrookHuntEndAlone renders the Back link and pays out on success', async ({ game }) => {
      await pickCompanion(game, 'Brook');
      await game.evaluate(() => {
        const b = SugarCube.State.variables.brook;
        b.lvl = 4;
        b.chooseOwaissa = 1;
        b.goingSolo = 2;
        b.soloChanceOwaissa = 100; // guarantee success
      });
      const before = await getVar(game, 'mc.money');
      // Pin random(1,100) low so _check <= stateChance.
      await game.evaluate(() => { Math.random = () => 0; });

      await goToPassage(game, 'BrookHuntEndAlone');
      await expectCleanPassage(game);

      const after = await getVar(game, 'mc.money');
      expect(after - before).toBe(50); // Owaissa payout

      const body = await game.locator('.passage').textContent();
      expect(body).toMatch(/I correctly identified the ghost/);

      const back = game.locator('a:has-text("Back")');
      await expect(back).toBeVisible();
    });

    test('activatePossessionOnHuntTool: lvl >= 2 + active flag stamps "Brook possessed at home"', async ({ game }) => {
      await pickCompanion(game, 'Brook');
      await game.evaluate(() => {
        SugarCube.State.variables.brook.lvl = 2;
        SugarCube.State.variables.isCompChosen = true;
      });
      // Pre-condition: no possessed-active flag yet.
      await game.evaluate(() => SugarCube.setup.Home.clearBrookePossession());
      await game.evaluate(() => SugarCube.setup.Companion.maybeActivatePossessionOnHuntTool());

      expect(
        await game.evaluate(() => SugarCube.setup.Home.isBrookePossessed())
      ).toBe(true);
    });

    test('activatePossessionOnHuntTool: lvl < 2 is a no-op', async ({ game }) => {
      await pickCompanion(game, 'Brook');
      await game.evaluate(() => {
        SugarCube.State.variables.brook.lvl = 1;
        SugarCube.State.variables.isCompChosen = true;
      });
      await game.evaluate(() => SugarCube.setup.Home.clearBrookePossession());
      await game.evaluate(() => SugarCube.setup.Companion.maybeActivatePossessionOnHuntTool());

      expect(
        await game.evaluate(() => SugarCube.setup.Home.isBrookePossessed())
      ).toBe(false);
    });
  });

  // ---------- Alice ----------

  test.describe('Alice', () => {

    test('catalogue: helpPassage / walkHomePassage / spiritEventPassage + huntOverPassage are wired', async ({ game }) => {
      const cfg = await game.evaluate(() => {
        const c = SugarCube.setup.Companion.getByName('Alice');
        return {
          help: c.helpPassage, walk: c.walkHomePassage,
          spirit: c.spiritEventPassage, info: c.infoPassage,
          alone: c.huntEndAlonePassage,
          homeContinue: c.homeContinuePassage,
          huntOver: c.huntOverPassage,
        };
      });
      expect(cfg).toEqual({
        help: 'AliceHelp', walk: 'AliceWalkHome',
        spirit: 'AliceSpiritEvent', info: 'AliceInfo',
        alone: 'AliceHuntEndAlone',
        homeContinue: 'AliceContinue',
        huntOver: 'AliceHuntOver',
      });
    });

    test('intro: MeetAlice flips hasMet + marks meetAlice', async ({ game }) => {
      await game.evaluate(() => { delete SugarCube.State.variables.meetAlice; });
      expect(await game.evaluate(() => SugarCube.setup.Companion.hasMet('Alice'))).toBe(false);

      await goToPassage(game, 'MeetAlice');
      await expectCleanPassage(game);

      const body = await game.locator('.passage').textContent();
      expect(body).toMatch(/I'm Alice/);
      expect(await game.evaluate(() => SugarCube.setup.Companion.hasMet('Alice'))).toBe(true);
      expect(await getVar(game, 'meetAlice')).toBe(true);
    });

    test('spirit event: GhostSpecialEventSpirit -> AliceSpiritEvent when Alice is active', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      expect(
        await game.evaluate(() => SugarCube.setup.SpecialEvent.activeSpiritEventPassage())
      ).toBe('AliceSpiritEvent');

      await goToPassage(game, 'GhostSpecialEventSpirit');
      const body = await game.locator('.passage').textContent();
      expect(body).toMatch(/big dick/i);
    });

    test('spirit event: AliceSpiritEvent terminates at the Sleep link', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      await goToPassage(game, 'AliceSpiritEvent');
      await expectCleanPassage(game);

      await game.locator('a:has-text("What the~")').click();
      await game.locator('a:has-text("started fucking you.")').click();
      await game.locator('a:has-text("in turn.")').click();
      await game.locator('a:has-text("every drop of his sperm.")').click();
      const sleep = game.locator('a:has-text("Sleep")');
      await expect(sleep).toBeVisible();
    });

    test('walk-home: lust >= 50 dispatches to AliceWalkHome and exposes the Continue link', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      await game.evaluate(() => SugarCube.setup.Companion.setActiveLust(60));
      await game.evaluate(() => {
        SugarCube.setup.HuntController.setHuntMode(
          SugarCube.setup.HuntController.HuntMode.NONE
        );
      });

      await goToPassage(game, 'WalkHomeTogether');
      await expectCleanPassage(game);

      await game.locator('a:has-text("let\'s do it.")').click();
      const cont = game.locator('a:has-text("take a shower")');
      await expect(cont).toBeVisible();
    });

    test('help: AliceHelp renders without error at sanity >= 50', async ({ game }) => {
      await setupHunt(game, 'Shade');
      await pickCompanion(game, 'Alice');
      await setVar(game, 'mc.sanity', 80);
      await game.evaluate(() => {
        const c = SugarCube.setup.Companion.activeState();
        c.sanity = 80; c.lust = 60;
      });
      await game.evaluate(() => { Math.random = () => 0.9; });

      await goToPassage(game, 'AliceHelp');
      await expectCleanPassage(game);

      const cont = game.locator('a:has-text("Continue")');
      await expect(cont).toBeVisible();
      // helpEventEaseActive ran.
      expect(await game.evaluate(() => SugarCube.setup.Companion.lust())).toBe(0);
    });

    test('onHuntFail: clears aliceWorkDone when goingSolo === 0', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      await game.evaluate(() => {
        SugarCube.State.variables.aliceWorkDone = true;
        SugarCube.State.variables.alice.goingSolo = 0;
      });
      await game.evaluate(() => SugarCube.setup.Companion.runHuntFailHooks());

      expect(await getVar(game, 'aliceWorkDone')).toBe(false);
    });

    test('onHuntFail: preserves aliceWorkDone when Alice was on a solo run', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      await game.evaluate(() => {
        SugarCube.State.variables.aliceWorkDone = true;
        SugarCube.State.variables.alice.goingSolo = 1;
      });
      await game.evaluate(() => SugarCube.setup.Companion.runHuntFailHooks());

      expect(await getVar(game, 'aliceWorkDone')).toBe(true);
    });

    test('huntOverPassage: activeHuntOverPassage returns AliceHuntOver when she is in the run', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      await game.evaluate(() => { SugarCube.State.variables.isCompChosen = true; });

      expect(
        await game.evaluate(() => SugarCube.setup.Companion.activeHuntOverPassage())
      ).toBe('AliceHuntOver');
    });

    test('huntOverPassage: null when the companion flag is off', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      await game.evaluate(() => { SugarCube.State.variables.isCompChosen = false; });

      expect(
        await game.evaluate(() => SugarCube.setup.Companion.activeHuntOverPassage())
      ).toBeNull();
    });

    test('solo-hunt debrief: AliceHuntEndAlone reaches the Back link', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      await game.evaluate(() => {
        const a = SugarCube.State.variables.alice;
        a.lvl = 4;
        a.chooseOwaissa = 1;
        a.goingSolo = 2;
        a.soloChanceOwaissa = 100;
      });
      await game.evaluate(() => { Math.random = () => 0; });

      await goToPassage(game, 'AliceHuntEndAlone');
      await expectCleanPassage(game);

      const back = game.locator('a:has-text("Back")');
      await expect(back).toBeVisible();
    });
  });

  // ---------- Blake ----------

  test.describe('Blake', () => {

    test('catalogue: helpPassage / walkHomePassage / spiritEventPassage + triggersPossessionCursedItem are wired', async ({ game }) => {
      const cfg = await game.evaluate(() => {
        const c = SugarCube.setup.Companion.getByName('Blake');
        return {
          help: c.helpPassage, walk: c.walkHomePassage,
          spirit: c.spiritEventPassage, info: c.infoPassage,
          alone: c.huntEndAlonePassage,
          homeContinue: c.homeContinuePassage,
          triggersCursed: !!c.triggersPossessionCursedItem,
        };
      });
      expect(cfg).toEqual({
        help: 'BlakeHelp', walk: 'BlakeWalkHome',
        spirit: 'BlakeSpiritEvent', info: 'BlakeInfo',
        alone: 'BlakeHuntEndAlone',
        homeContinue: 'BlakeContinue',
        triggersCursed: true,
      });
    });

    test('intro gate: blakeUnlocked requires Alice lvl >= 2', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      await game.evaluate(() => { SugarCube.State.variables.alice.lvl = 1; });
      expect(await game.evaluate(() => SugarCube.setup.Mall.blakeUnlocked())).toBe(false);

      await game.evaluate(() => { SugarCube.State.variables.alice.lvl = 2; });
      expect(await game.evaluate(() => SugarCube.setup.Mall.blakeUnlocked())).toBe(true);
    });

    test('intro: AdultSectionBlake renders the first-meeting greeting once Alice lvl >= 2', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      await game.evaluate(() => {
        SugarCube.State.variables.alice.lvl = 2;
        delete SugarCube.State.variables.dialogBlake;
        SugarCube.State.variables.relationshipBlake = 0;
      });
      // Clear the active companion so the "ask Blake to join" block stays hidden.
      await unpickCompanion(game);

      await goToPassage(game, 'AdultSectionBlake');
      await expectCleanPassage(game);

      const body = await game.locator('.passage').textContent();
      expect(body).toMatch(/I'm Blake/);
    });

    test('intro: AdultSectionBlake exposes the "Ask Blake to join" link at relationship >= 5', async ({ game }) => {
      await pickCompanion(game, 'Alice');
      await game.evaluate(() => {
        SugarCube.State.variables.alice.lvl = 2;
        SugarCube.State.variables.dialogBlake = 1;
        SugarCube.State.variables.relationshipBlake = 5;
      });
      await unpickCompanion(game);

      await goToPassage(game, 'AdultSectionBlake');
      const ask = game.locator('a:has-text("Ask Blake to join you for ghost hunting tonight.")');
      await expect(ask).toBeVisible();
    });

    test('spirit event: GhostSpecialEventSpirit -> BlakeSpiritEvent when Blake is active', async ({ game }) => {
      await pickCompanion(game, 'Blake');
      expect(
        await game.evaluate(() => SugarCube.setup.SpecialEvent.activeSpiritEventPassage())
      ).toBe('BlakeSpiritEvent');

      await goToPassage(game, 'GhostSpecialEventSpirit');
      const body = await game.locator('.passage').textContent();
      expect(body).toMatch(/touching you/);
    });

    test('spirit event: chain hands off to spiritBlake', async ({ game }) => {
      await pickCompanion(game, 'Blake');
      await goToPassage(game, 'BlakeSpiritEvent');
      await expectCleanPassage(game);

      await game.locator('a:has-text("touching you.")').click();
      await game.locator('a:has-text("What the~")').click();
      await game.locator('a:has-text("one after the other")').click();
      await game.locator('a:has-text("to do whatever he wants.")').click();
      await game.locator('a:has-text("in turn.")').click();
      const handoff = game.locator('a:has-text("fucking you")');
      await expect(handoff).toBeVisible();
    });

    test('walk-home: lust >= 50 dispatches to BlakeWalkHome and hands off to BlakeContinue', async ({ game }) => {
      await pickCompanion(game, 'Blake');
      await game.evaluate(() => SugarCube.setup.Companion.setActiveLust(60));
      await game.evaluate(() => {
        SugarCube.setup.HuntController.setHuntMode(
          SugarCube.setup.HuntController.HuntMode.NONE
        );
      });

      await goToPassage(game, 'WalkHomeTogether');
      await expectCleanPassage(game);

      await game.locator('a:has-text("let\'s do it.")').click();
      const cont = game.locator('a:has-text("cum at the same time.")');
      await expect(cont).toBeVisible();
    });

    test('help: BlakeHelp renders without error at sanity >= 50', async ({ game }) => {
      await setupHunt(game, 'Shade');
      await pickCompanion(game, 'Blake');
      await setVar(game, 'mc.sanity', 80);
      await game.evaluate(() => {
        const c = SugarCube.setup.Companion.activeState();
        c.sanity = 80; c.lust = 60;
      });
      await game.evaluate(() => { Math.random = () => 0.9; });

      await goToPassage(game, 'BlakeHelp');
      await expectCleanPassage(game);

      const cont = game.locator('a:has-text("Continue")');
      await expect(cont).toBeVisible();
      expect(await game.evaluate(() => SugarCube.setup.Companion.lust())).toBe(0);
    });

    test('onHuntFail: drops the carried cursed item when Blake was active', async ({ game }) => {
      await pickCompanion(game, 'Blake');
      await game.evaluate(() => {
        SugarCube.State.variables.isCompChosen = true;
        SugarCube.setup.Witch.setCursedItemHeld();
      });
      expect(await game.evaluate(() => SugarCube.setup.Witch.hasCursedItemToTurnIn())).toBe(true);

      await game.evaluate(() => SugarCube.setup.Companion.runHuntFailHooks());

      expect(await game.evaluate(() => SugarCube.setup.Witch.hasCursedItemToTurnIn())).toBe(false);
    });

    test('onHuntFail: no-op when isCompChosen is false', async ({ game }) => {
      await pickCompanion(game, 'Blake');
      await game.evaluate(() => {
        SugarCube.State.variables.isCompChosen = false;
        SugarCube.setup.Witch.setCursedItemHeld();
      });
      await game.evaluate(() => SugarCube.setup.Companion.runHuntFailHooks());

      expect(await game.evaluate(() => SugarCube.setup.Witch.hasCursedItemToTurnIn())).toBe(true);
    });

    test('activeHuntCarriesCursedItem: true when Blake is active + flag set + cursed item held', async ({ game }) => {
      await pickCompanion(game, 'Blake');
      await game.evaluate(() => {
        SugarCube.State.variables.isCompChosen = true;
        SugarCube.setup.Witch.setCursedItemHeld();
      });
      expect(
        await game.evaluate(() => SugarCube.setup.Companion.activeHuntCarriesCursedItem())
      ).toBe(true);
    });

    test('activeHuntCarriesCursedItem: false when the active companion is Brook', async ({ game }) => {
      await pickCompanion(game, 'Brook');
      await game.evaluate(() => {
        SugarCube.State.variables.isCompChosen = true;
        SugarCube.setup.Witch.setCursedItemHeld();
      });
      expect(
        await game.evaluate(() => SugarCube.setup.Companion.activeHuntCarriesCursedItem())
      ).toBe(false);
    });

    test('solo-hunt debrief: BlakeHuntEndAlone reaches the Back link', async ({ game }) => {
      await pickCompanion(game, 'Blake');
      await game.evaluate(() => {
        const b = SugarCube.State.variables.blake;
        b.lvl = 4;
        b.chooseOwaissa = 1;
        b.goingSolo = 2;
        b.soloChanceOwaissa = 100;
      });
      await game.evaluate(() => { Math.random = () => 0; });

      await goToPassage(game, 'BlakeHuntEndAlone');
      await expectCleanPassage(game);

      const back = game.locator('a:has-text("Back")');
      await expect(back).toBeVisible();
    });
  });

  // ---------- Shared catalogue / dispatch behaviour ----------

  test.describe('Shared dispatch', () => {

    test('activeSpiritEventPassage: returns null with no companion attached', async ({ game }) => {
      await unpickCompanion(game);
      expect(
        await game.evaluate(() => SugarCube.setup.SpecialEvent.activeSpiritEventPassage())
      ).toBeNull();
    });

    test('Companion.list() exposes Brook, Alice, Blake in catalogue order', async ({ game }) => {
      const names = await game.evaluate(() =>
        SugarCube.setup.Companion.list().map(c => c.name)
      );
      expect(names).toEqual(['Brook', 'Alice', 'Blake']);
    });

    test('pick(X) clears any previously-active marker and replaces it', async ({ game }) => {
      await pickCompanion(game, 'Brook');
      expect(await getVar(game, 'companion.name')).toBe('Brook');
      await pickCompanion(game, 'Alice');
      expect(await getVar(game, 'companion.name')).toBe('Alice');
      expect(await game.evaluate(() => SugarCube.setup.Companion.activeCompanionName())).toBe('Alice');
    });
  });
});
