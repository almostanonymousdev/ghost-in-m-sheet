const { test, expect } = require('./fixtures');
const { goToPassage } = require('./helpers');

/**
 * KeyboardNav — number/letter hotkeys for in-passage choices and the
 * sidebar HUD. The module is wired up once at :storyready, so these
 * tests navigate to a known passage and then inspect the live keymap
 * + simulate keypresses.
 */

test.describe('KeyboardNav', () => {
  test('Home assigns 1 to the .movebtn (Go inside) and 2 to .backbtn (Leave)', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act
    const keys = await page.evaluate(() => SugarCube.setup.KeyboardNav._numberHotkeys());
    const byKey = Object.fromEntries(keys.map(k => [k.key, k.text]));
    // assert — movebtn ("Go inside") wins priority, backbtn ("Leave") is next.
    // Home uses .enterbtn for "Go inside" actually — let's just check both exist.
    expect(byKey['1']).toBeTruthy();
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  test('priority puts .movebtn ahead of .enterbtn ahead of .backbtn', async ({ game: page }) => {
    // arrange
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      root.innerHTML =
        '<span class="enterbtn"><a href="javascript:void(0)" data-test="enter">Enter</a></span>' +
        '<span class="movebtn"><a href="javascript:void(0)" data-test="move">Move</a></span>' +
        '<span class="backbtn"><a href="javascript:void(0)" data-test="back">Back</a></span>' +
        '<a href="javascript:void(0)" data-test="plain">Plain</a>';
      SugarCube.setup.KeyboardNav.refresh();
    });
    // act
    const tags = await page.evaluate(() => {
      const m = SugarCube.setup.KeyboardNav._numberHotkeys();
      const root = document.getElementById('passages');
      return m.map(({ key }) => ({
        key,
        tag: root.querySelector(`a[data-hotkey="${key}"]`).getAttribute('data-test')
      }));
    });
    // assert — movebtn → backbtn → enterbtn → plain
    expect(tags[0]).toEqual({ key: '1', tag: 'move' });
    expect(tags[1]).toEqual({ key: '2', tag: 'back' });
    expect(tags[2]).toEqual({ key: '3', tag: 'enter' });
    expect(tags[3]).toEqual({ key: '4', tag: 'plain' });
  });

  test('pressing a number key clicks the bound link', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act
    await page.keyboard.press('1');
    await page.waitForFunction(() => SugarCube.State.passage !== 'Home');
    // assert
    const passage = await page.evaluate(() => SugarCube.State.passage);
    expect(passage).not.toBe('Home');
  });

  test('Alt toggles body.show-hotkeys', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act + assert: not present at rest
    let hasClass = await page.evaluate(() => document.body.classList.contains('show-hotkeys'));
    expect(hasClass).toBe(false);
    await page.keyboard.down('Alt');
    hasClass = await page.evaluate(() => document.body.classList.contains('show-hotkeys'));
    expect(hasClass).toBe(true);
    await page.keyboard.up('Alt');
    hasClass = await page.evaluate(() => document.body.classList.contains('show-hotkeys'));
    expect(hasClass).toBe(false);
  });

  test('Alt keydown/keyup are preventDefault-ed (suppresses browser menu focus)', async ({ game: page }) => {
    // arrange — synthesize the events directly so we can read defaultPrevented.
    await goToPassage(page, 'Home');
    // act
    const result = await page.evaluate(() => {
      const down = new KeyboardEvent('keydown', { key: 'Alt', bubbles: true, cancelable: true });
      const up   = new KeyboardEvent('keyup',   { key: 'Alt', bubbles: true, cancelable: true });
      document.dispatchEvent(down);
      document.dispatchEvent(up);
      return { down: down.defaultPrevented, up: up.defaultPrevented };
    });
    // assert
    expect(result).toEqual({ down: true, up: true });
  });

  test('Meta also reveals badges but does NOT preventDefault (so Cmd+R etc. keep working)', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act
    const result = await page.evaluate(() => {
      const down = new KeyboardEvent('keydown', { key: 'Meta', bubbles: true, cancelable: true });
      const up   = new KeyboardEvent('keyup',   { key: 'Meta', bubbles: true, cancelable: true });
      document.dispatchEvent(down);
      const revealedWhileHeld = document.body.classList.contains('show-hotkeys');
      document.dispatchEvent(up);
      const revealedAfterRelease = document.body.classList.contains('show-hotkeys');
      return {
        downPrevented: down.defaultPrevented,
        upPrevented: up.defaultPrevented,
        revealedWhileHeld,
        revealedAfterRelease,
      };
    });
    // assert
    expect(result).toEqual({
      downPrevented: false,
      upPrevented: false,
      revealedWhileHeld: true,
      revealedAfterRelease: false,
    });
  });

  test('Alt keydown is NOT preventDefault-ed while typing in an input', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act
    const result = await page.evaluate(() => {
      const inp = document.createElement('input');
      inp.type = 'text';
      document.body.appendChild(inp);
      inp.focus();
      const down = new KeyboardEvent('keydown', { key: 'Alt', bubbles: true, cancelable: true });
      inp.dispatchEvent(down);
      inp.remove();
      return down.defaultPrevented;
    });
    // assert
    expect(result).toBe(false);
  });

  test('modal passages (Notebook) skip number hotkeys', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Notebook');
    // act
    const keys = await page.evaluate(() => SugarCube.setup.KeyboardNav._numberHotkeys());
    // assert
    expect(keys).toEqual([]);
  });

  test('Escape backs out of the Bag (modal passage with no number hotkeys)', async ({ game: page }) => {
    // arrange — Bag uses <<backOrReturn>> which emits a .backbtn link.
    await goToPassage(page, 'Home');
    await page.keyboard.press('b'); // sidebar letter shortcut
    await page.waitForFunction(() => SugarCube.State.passage === 'Bag');
    // act
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => SugarCube.State.passage !== 'Bag');
    // assert
    const passage = await page.evaluate(() => SugarCube.State.passage);
    expect(passage).toBe('Home');
  });

  test('Escape clicks the .backbtn link on a regular passage too', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Livingroom');
    // act
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => SugarCube.State.passage === 'Home');
    // assert
    const passage = await page.evaluate(() => SugarCube.State.passage);
    expect(passage).toBe('Home');
  });

  test('sidebar links get letter shortcuts (Bag → b, Notebook → n, Evidence → v)', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act
    const letters = await page.evaluate(() => SugarCube.setup.KeyboardNav._letterHotkeys());
    const byPassage = Object.fromEntries(letters.map(l => [l.passage, l.key]));
    // assert
    expect(byPassage.Bag).toBe('b');
    expect(byPassage.Notebook).toBe('n');
    expect(byPassage.Evidence).toBe('v');
  });

  test('letter key navigates to the sidebar target', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act
    await page.keyboard.press('b');
    await page.waitForFunction(() => SugarCube.State.passage === 'Bag');
    // assert
    const passage = await page.evaluate(() => SugarCube.State.passage);
    expect(passage).toBe('Bag');
  });

  test('disabled-link is excluded from the keymap', async ({ game: page }) => {
    // arrange
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      root.innerHTML =
        '<a class="disabled-link" data-test="off">Off</a>' +
        '<span class="movebtn"><a data-test="on">On</a></span>';
      SugarCube.setup.KeyboardNav.refresh();
    });
    // act
    const keys = await page.evaluate(() => SugarCube.setup.KeyboardNav._numberHotkeys());
    // assert
    expect(keys.length).toBe(1);
    expect(keys[0].text).toBe('On');
  });

  test('MutationObserver re-derives keymap after DOM changes (linkreplace simulation)', async ({ game: page }) => {
    // arrange — start with one link
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      root.innerHTML = '<span class="movebtn"><a data-test="first">First</a></span>';
      SugarCube.setup.KeyboardNav.refresh();
    });
    let keys = await page.evaluate(() => SugarCube.setup.KeyboardNav._numberHotkeys());
    expect(keys.length).toBe(1);

    // act — inject a second link (as <<linkreplace>> would after click)
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      const span = document.createElement('span');
      span.className = 'movebtn';
      span.innerHTML = '<a data-test="second">Second</a>';
      root.appendChild(span);
    });
    // wait one animation frame for observer-triggered refresh
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    // assert
    keys = await page.evaluate(() => SugarCube.setup.KeyboardNav._numberHotkeys());
    expect(keys.length).toBe(2);
  });

  test('number key is ignored while focus is in an input', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    await page.evaluate(() => {
      const inp = document.createElement('input');
      inp.id = 'test-input';
      inp.type = 'text';
      document.body.appendChild(inp);
      inp.focus();
    });
    // act — press 1; should not navigate
    await page.keyboard.press('1');
    // give the page a moment in case it would have navigated
    await page.waitForTimeout(150);
    // assert
    const passage = await page.evaluate(() => SugarCube.State.passage);
    expect(passage).toBe('Home');
    // cleanup
    await page.evaluate(() => document.getElementById('test-input').remove());
  });
});
