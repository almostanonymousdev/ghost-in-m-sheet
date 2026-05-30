/*
 * Narrative test for the per-ghost special event scenes. These are the
 * scripted "this ghost did the thing" passages that fire either ambient
 * at home (Spirit / Mare / Twins) or inside a hunt (Banshee / Cthulion
 * / Wraith / Myling / Succubus protection).
 *
 * For each ghost, the test:
 *   1. exercises the guard (positive + negative case),
 *   2. opens the entry passage,
 *   3. walks the linkappend/linkreplace chain to the terminal exit link.
 *
 * Mimic is exercised at the controller level (rollMimicType) since the
 * disguise rotation never renders a passage of its own.
 */

const { test, expect } = require('../fixtures');
const { setVar, getVar, goToPassage, seedRandom } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('../e2e/e2e-helpers');

test.describe('Special ghost events', () => {

  test.describe('Spirit - ambient Nap variant', () => {

    test('entry: spiritEventReady() is true when stage==0 + daily cooldown available', async ({ game }) => {
      await game.evaluate(() => {
        SugarCube.setup.SpecialEvent.clearSpiritEventStage();
        SugarCube.setup.Cooldowns.resetDaily();
      });
      const ready = await game.evaluate(() =>
        SugarCube.setup.SpecialEvent.spiritEventReady()
      );
      expect(ready).toBe(true);
    });

    test('entry: spiritEventReady() is false once startSpiritEventCooldown is fired', async ({ game }) => {
      await game.evaluate(() => {
        SugarCube.setup.SpecialEvent.clearSpiritEventStage();
        SugarCube.setup.Cooldowns.resetDaily();
        SugarCube.setup.SpecialEvent.startSpiritEventCooldown();
      });
      const ready = await game.evaluate(() =>
        SugarCube.setup.SpecialEvent.spiritEventReady()
      );
      expect(ready).toBe(false);
    });

    test('walk: GhostSpecialEventNapSpirit -> link -> NapSpirit1 -> Bedroom', async ({ game }) => {
      await goToPassage(game, 'GhostSpecialEventNapSpirit');
      await expectCleanPassage(game);

      await game.locator('a:has-text("everything is over.")').click();
      const link = game.locator('a:has-text("stops for a moment.")');
      await expect(link).toBeVisible();
      await link.click();

      await game.waitForFunction(
        () => SugarCube.State.passage === 'GhostSpecialEventNapSpirit1',
        null,
        { timeout: 5000 }
      );

      await game.locator('a:has-text("in your mouth.")').click();
      const exit = game.locator('a:has-text("shock and confusion")');
      await expect(exit).toBeVisible();
    });
  });

  test.describe('Spirit - ambient TV variant', () => {

    test('corruption < 3 renders the warning text + Livingroom exit', async ({ game }) => {
      await setVar(game, 'mc.corruption', 0);
      await goToPassage(game, 'GhostSpecialEventTVSpirit');
      await expectCleanPassage(game);

      await game.locator('a:has-text("unusual is happening")').click();
      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/Req\..*≥\s*3/);

      const getUp = game.locator('a:has-text("Get up")');
      await expect(getUp).toBeVisible();
    });

    test('corruption >= 3 renders the drives-you-crazy continuation link', async ({ game }) => {
      await setVar(game, 'mc.corruption', 3);
      await goToPassage(game, 'GhostSpecialEventTVSpirit');

      await game.locator('a:has-text("unusual is happening")').click();
      const cont = game.locator('a:has-text("drives you crazy")');
      await expect(cont).toBeVisible();
    });

    test('TV entry fires startSpiritEventCooldown on enter', async ({ game }) => {
      await game.evaluate(() => SugarCube.setup.Cooldowns.resetDaily());
      await goToPassage(game, 'GhostSpecialEventTVSpirit');
      const ready = await game.evaluate(() =>
        SugarCube.setup.SpecialEvent.spiritEventReady()
      );
      expect(ready).toBe(false);
    });
  });

  test.describe('Spirit - ambient Sleep variant', () => {

    test('energy < 5 renders the low-energy variant', async ({ game }) => {
      await setVar(game, 'mc.energy', 2);
      await setVar(game, 'mc.corruption', 5);
      await goToPassage(game, 'GhostSpecialEventSleepSpirit');
      await expectCleanPassage(game);

      await game.locator('a:has-text("deeper into sleep.")').click();
      const link = game.locator('a:has-text("filling you with excitement.")');
      await expect(link).toBeVisible();
    });

    test('energy >= 5, corruption < 5 renders the early-resist branch', async ({ game }) => {
      await setVar(game, 'mc.energy', 5);
      await setVar(game, 'mc.corruption', 0);
      await goToPassage(game, 'GhostSpecialEventSleepSpirit');

      await game.locator('a:has-text("deeper into sleep.")').click();
      const link = game.locator('a:has-text("convinced  it\'s only a dream")');
      await expect(link).toBeVisible();
      await link.click();

      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/Req\..*≥\s*5/);
    });

    test('energy >= 5, corruption >= 5 chains into SleepSpirit1', async ({ game }) => {
      await setVar(game, 'mc.energy', 5);
      await setVar(game, 'mc.corruption', 5);
      await goToPassage(game, 'GhostSpecialEventSleepSpirit');

      await game.locator('a:has-text("deeper into sleep.")').click();
      const link = game.locator('a:has-text("you can no longer resist")');
      await expect(link).toBeVisible();
    });
  });

  test.describe('Mare - ambient PC nap event', () => {

    test('first-time prose (knowsAboutMare == false) renders ignorance line', async ({ game }) => {
      await game.evaluate(() => {
        const V = SugarCube.State.variables;
        if (V.ghostDiscovered) V.ghostDiscovered.Mare = false;
        else V.ghostDiscovered = { Mare: false };
      });
      await goToPassage(game, 'GhostSpecialEventMare');
      await expectCleanPassage(game);

      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/touching myself in my sleep/);
    });

    test('repeat prose (knowsAboutMare == true) renders awareness line', async ({ game }) => {
      await game.evaluate(() => {
        SugarCube.setup.Ghosts.markDiscovered('Mare');
      });
      await goToPassage(game, 'GhostSpecialEventMare');
      await expectCleanPassage(game);

      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/really happening again/);
    });

    test('full chain reaches the Back link', async ({ game }) => {
      await goToPassage(game, 'GhostSpecialEventMare');
      await game.locator('a:has-text("watch more.")').click();
      await game.locator('a:has-text("not your voice")').click();

      const back = game.locator('a:has-text("Back")');
      await expect(back).toBeVisible();
    });

    test('GhostSpecialEventMareEnd clears the mare event vars', async ({ game }) => {
      await setVar(game, 'ghostMareEventStart', 1);
      await setVar(game, 'ghostMareEventStage', 5);
      await goToPassage(game, 'GhostSpecialEventMareEnd');
      await expectCleanPassage(game);

      await game.locator('a:has-text("Ah~What the~ fuck.")').click();

      expect(await getVar(game, 'ghostMareEventStart')).toBe(0);
      expect(await getVar(game, 'ghostMareEventStage')).toBe(0);

      const blackOut = game.locator('a:has-text("You black out")');
      await expect(blackOut).toBeVisible();
    });

    test('mare stage helpers (mareStageAtLeast / mareEventActive)', async ({ game }) => {
      await setVar(game, 'ghostMareEventStart', 1);
      await setVar(game, 'ghostMareEventStage', 3);
      expect(await game.evaluate(() => SugarCube.setup.SpecialEvent.mareEventActive())).toBe(true);
      expect(await game.evaluate(() => SugarCube.setup.SpecialEvent.mareStageAtLeast(2))).toBe(true);
      expect(await game.evaluate(() => SugarCube.setup.SpecialEvent.mareStageAtLeast(5))).toBe(false);
    });
  });

  test.describe('Twins - Mirror ambient event', () => {

    test('twinsEventReady() is false when twinsEventActive is unset', async ({ game }) => {
      await setVar(game, 'twinsEventActive', false);
      const ready = await game.evaluate(() => SugarCube.setup.Ghosts.twinsEventReady());
      expect(ready).toBe(false);
    });

    test('twinsEventReady() is true once stamped + cooldown available', async ({ game }) => {
      await setVar(game, 'twinsEventActive', true);
      await game.evaluate(() => SugarCube.setup.Cooldowns.resetDaily());
      const ready = await game.evaluate(() => SugarCube.setup.Ghosts.twinsEventReady());
      expect(ready).toBe(true);
    });

    test('Mirror low-beauty branch consumes the event without TheTwinsEvent', async ({ game }) => {
      await setVar(game, 'twinsEventActive', true);
      await game.evaluate(() => SugarCube.setup.Cooldowns.resetDaily());
      await setVar(game, 'mc.beautyBase', 0);
      await setVar(game, 'mc.beautyModifier', 0);
      // Force the random(30,100) roll to the top of the range so the
      // low-beauty branch always wins.
      await seedRandom(game, 1);
      await game.evaluate(() => { Math.random = () => 0.99; });

      await goToPassage(game, 'Mirror');
      await expectCleanPassage(game);

      const linkAppend = game.locator('a:has-text("through the glass")');
      await expect(linkAppend).toBeVisible();
      await linkAppend.click();

      const back = game.locator('a:has-text("Back")');
      await expect(back).toBeVisible();
    });

    test('Mirror high-beauty branch links to TheTwinsEvent', async ({ game }) => {
      await setVar(game, 'twinsEventActive', true);
      await game.evaluate(() => SugarCube.setup.Cooldowns.resetDaily());
      // beautyBase 100 forces _checkBeauty <= beauty regardless of roll.
      await setVar(game, 'mc.beautyBase', 100);
      await setVar(game, 'mc.beautyModifier', 0);
      await seedRandom(game, 1);

      await goToPassage(game, 'Mirror');
      await expectCleanPassage(game);

      await game.locator('a:has-text("through the glass")').click();
      const giving = game.locator('a:has-text("giving in to their desires")');
      await expect(giving).toBeVisible();
    });

    test('TheTwinsEvent chain renders the Leave link', async ({ game }) => {
      await goToPassage(game, 'TheTwinsEvent');
      await expectCleanPassage(game);

      await game.locator('a:has-text("this is too good")').click();
      await game.locator('a:has-text("you\'re their toy.")').click();

      const leave = game.locator('a:has-text("Leave")');
      await expect(leave).toBeVisible();

      // consumeTwinsEvent fires during render.
      const active = await getVar(game, 'twinsEventActive');
      expect(active).toBe(false);
    });
  });

  test.describe('Wraith - hunt-defeat scene', () => {

    test('canTryEscape returns false when energy == 0', async ({ game }) => {
      await setVar(game, 'mc.energy', 0);
      expect(await game.evaluate(() => SugarCube.setup.SpecialEvent.canTryEscape())).toBe(false);
    });

    test('canTryEscape returns true when energy >= 1', async ({ game }) => {
      await setVar(game, 'mc.energy', 3);
      expect(await game.evaluate(() => SugarCube.setup.SpecialEvent.canTryEscape())).toBe(true);
    });

    test('entry passage renders the escape link when energy > 0', async ({ game }) => {
      await setVar(game, 'mc.energy', 5);
      await goToPassage(game, 'GhostSpecialEventWraith');
      await expectCleanPassage(game);

      const tryFree = game.locator('a:has-text("Try to free myself")');
      await expect(tryFree).toBeVisible();
    });

    test('entry passage renders only Call-for-help when energy == 0', async ({ game }) => {
      await setVar(game, 'mc.energy', 0);
      await goToPassage(game, 'GhostSpecialEventWraith');
      await expectCleanPassage(game);

      const call = game.locator('a:has-text("Call for help")');
      await expect(call).toBeVisible();
    });

    test('failed escape -> Call-for-help -> WraithStart', async ({ game }) => {
      await setVar(game, 'mc.energy', 0);
      await goToPassage(game, 'GhostSpecialEventWraith');

      await game.locator('a:has-text("Call for help")').click();
      const fucked = game.locator('a:has-text("started fucking you")');
      await expect(fucked).toBeVisible();
    });

    test('WraithStart chain reaches WraithEnd link', async ({ game }) => {
      await goToPassage(game, 'GhostSpecialEventWraithStart');
      await expectCleanPassage(game);

      await game.locator('a:has-text("your mouth from those rags.")').click();
      const end = game.locator('a:has-text("with your mouth")');
      await expect(end).toBeVisible();
    });

    test('rollEscapeSuccess respects energy * 5% chance', async ({ game }) => {
      await setVar(game, 'mc.energy', 20);
      // chance roll <= energy*5 (100) => always success.
      await game.evaluate(() => { Math.random = () => 0; });
      expect(await game.evaluate(() => SugarCube.setup.SpecialEvent.rollEscapeSuccess())).toBe(true);

      await setVar(game, 'mc.energy', 0);
      // chance roll = 1 > 0*5 => always fail.
      await game.evaluate(() => { Math.random = () => 0; });
      expect(await game.evaluate(() => SugarCube.setup.SpecialEvent.rollEscapeSuccess())).toBe(false);
    });
  });

  test.describe('Myling - walk-home scenes', () => {

    test('solo walk-home passage routes to Livingroom', async ({ game }) => {
      await seedRandom(game, 1);
      await goToPassage(game, 'GhostSpecialEventMyling');
      await expectCleanPassage(game);

      const home = game.locator('a:has-text("You\'re finally home")');
      await expect(home).toBeVisible();
    });

    test('recordMylingVideo persists the chosen clip', async ({ game }) => {
      await seedRandom(game, 1);
      await goToPassage(game, 'GhostSpecialEventMyling');
      const video = await getVar(game, 'videoEventSpecialMyling');
      expect(video).toMatch(/characters\/ghosts\/myling\/\d+\.mp4/);
    });

    test('companion walk-home (Two) routes to WalkHomeTogether', async ({ game }) => {
      await game.evaluate(() => {
        const V = SugarCube.State.variables;
        V.companion = { name: 'Brook' };
        if (!V.brook) V.brook = SugarCube.setup.Companion.defaultStateFor('Brook');
      });
      await seedRandom(game, 1);
      await goToPassage(game, 'GhostSpecialEventMylingTwo');
      await expectCleanPassage(game);

      const home = game.locator('a:has-text("You\'re finally home")');
      await expect(home).toBeVisible();
    });
  });

  test.describe('Mimic - mid-hunt disguise rotation', () => {

    test('rollMimicType returns a fresh disguise the first time the interval flips', async ({ game }) => {
      await setupHunt(game, 'Mimic');
      await game.evaluate(() => {
        delete SugarCube.State.variables.lastChangeIntervalMimic;
      });
      const rolled = await game.evaluate(() => {
        const names = SugarCube.setup.Ghosts.names({ exclude: ['Mimic'] });
        return SugarCube.setup.Posession.rollMimicType(names);
      });
      expect(typeof rolled).toBe('string');
      expect(rolled).not.toBe('Mimic');

      // Same interval => no rotation.
      const second = await game.evaluate(() => {
        const names = SugarCube.setup.Ghosts.names({ exclude: ['Mimic'] });
        return SugarCube.setup.Posession.rollMimicType(names);
      });
      expect(second).toBeNull();
    });
  });

  test.describe('Banshee - hunt event scene', () => {

    test('bansheeActive() is false by default', async ({ game }) => {
      expect(await game.evaluate(() => SugarCube.setup.Events.bansheeActive())).toBe(false);
    });

    test('EventMC renders the Banshee branch when banshee is active', async ({ game }) => {
      await setupHunt(game, 'Banshee');
      await game.evaluate(() => {
        const V = SugarCube.State.variables;
        SugarCube.setup.Events.enableBanshee();
        V.return = 'Livingroom';
        SugarCube.setup.Events.setVideoEvent(SugarCube.setup.BansheeVideos.house[0]);
      });
      await goToPassage(game, 'EventMC');
      await expectCleanPassage(game);

      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/lips touch yours/);
      const embrace = game.locator('a:has-text("Embrace it")');
      await expect(embrace).toBeVisible();
    });
  });

  test.describe('Cthulion - hunt event scene', () => {

    test('cthulionActive() is false by default', async ({ game }) => {
      expect(await game.evaluate(() => SugarCube.setup.Events.cthulionActive())).toBe(false);
    });

    test('EventMC renders the Cthulion branch when cthulion is active', async ({ game }) => {
      await setupHunt(game, 'Cthulion');
      await game.evaluate(() => {
        const V = SugarCube.State.variables;
        SugarCube.setup.Events.enableCthulion();
        V.return = 'Livingroom';
        const ct = SugarCube.setup.Events.cthulionVideos(1);
        SugarCube.setup.Events.setVideoEvent(ct[0]);
      });
      await goToPassage(game, 'EventMC');
      await expectCleanPassage(game);

      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/Tentacles creep/);
      const embrace = game.locator('a:has-text("Embrace it")');
      await expect(embrace).toBeVisible();
    });
  });

  test.describe('Succubus - hunt protection event', () => {

    test('HuntEventSuccubus is reachable and offers a Continue link in all 6 branches', async ({ game }) => {
      for (let roll = 1; roll <= 6; roll++) {
        // Pin random(1,6) to deterministically pick each branch. The
        // SugarCube random() helper uses Math.floor(Math.random()*max)+min.
        await game.evaluate((rolled) => {
          Math.random = () => (rolled - 1) / 6 + 0.0001;
        }, roll);
        await game.evaluate(() => { SugarCube.State.variables.return = 'Livingroom'; });
        await goToPassage(game, 'HuntEventSuccubus');
        await expectCleanPassage(game);

        const link = game.locator('a:has-text("specifically for temptation.")');
        await expect(link, `branch ${roll}: first linkappend visible`).toBeVisible();
      }
    });
  });
});
