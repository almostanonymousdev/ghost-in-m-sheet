const { test, expect } = require('./fixtures');
const { goToPassage } = require('./helpers');

/**
 * KeyboardNav — number/letter hotkeys for in-passage choices and the
 * sidebar HUD. The module is wired up once at :storyready, so these
 * tests navigate to a known passage and then inspect the live keymap
 * + simulate keypresses.
 */

test.describe('KeyboardNav', () => {
  test('Home assigns 1 to .enterbtn (Go inside) and esc to .backbtn (Leave)', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act
    const { numbers, escLink } = await page.evaluate(() => {
      const keys = SugarCube.setup.KeyboardNav._numberHotkeys();
      const root = document.getElementById('passages');
      const esc  = root.querySelector('a[data-hotkey-letter="esc"]');
      return {
        numbers: keys,
        escLink: esc ? (esc.textContent || '').trim() : null
      };
    });
    // assert — backbtn ("Leave") is the esc target; enterbtn ("Go inside") is the sole number.
    expect(numbers.length).toBe(1);
    expect(numbers[0].key).toBe('1');
    expect(numbers[0].text).toBe('Go inside');
    expect(escLink).toBe('Leave');
  });

  test('non-backbtn links sort by visual reading order; backbtn drops out for esc', async ({ game: page }) => {
    // arrange — three block elements with explicit vertical positions
    // and one inline plain link. The visual order is top-down (third
    // → first → second), and DOM order is the inverse — the sort must
    // follow getBoundingClientRect, not DOM order. We have to enter a
    // real passage first so #passages is laid out (otherwise its
    // ancestor chain is display:none and every rect returns zeros).
    await goToPassage(page, 'Home');
    // Wait one frame so Home's :passagedisplay refresh fires and any
    // pending SugarCube transitions commit — otherwise #passages can
    // still be display:none while transitioning and every rect we read
    // back collapses to zero.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      root.innerHTML =
        '<div style="position:absolute; top:300px; left:10px;"><a data-test="bottom">Bottom</a></div>' +
        '<div style="position:absolute; top:100px; left:10px;"><a data-test="top">Top</a></div>' +
        '<div style="position:absolute; top:200px; left:10px;"><a data-test="middle">Middle</a></div>' +
        '<span class="backbtn"><a data-test="back">Back</a></span>';
      // Force a layout pass before the keymap is derived so
      // getBoundingClientRect returns committed coords.
      void root.offsetHeight;
      SugarCube.setup.KeyboardNav.refresh();
    });
    // act
    const { tags, escTag } = await page.evaluate(() => {
      const m = SugarCube.setup.KeyboardNav._numberHotkeys();
      const root = document.getElementById('passages');
      const esc  = root.querySelector('a[data-hotkey-letter="esc"]');
      return {
        tags: m.map(({ key }) => ({
          key,
          tag: root.querySelector(`a[data-hotkey="${key}"]`).getAttribute('data-test')
        })),
        escTag: esc ? esc.getAttribute('data-test') : null
      };
    });
    // assert — purely visual top-to-bottom; backbtn is excluded.
    expect(tags[0]).toEqual({ key: '1', tag: 'top' });
    expect(tags[1]).toEqual({ key: '2', tag: 'middle' });
    expect(tags[2]).toEqual({ key: '3', tag: 'bottom' });
    expect(escTag).toBe('back');
  });

  test('rows tie-break left-to-right', async ({ game: page }) => {
    // arrange — three anchors on the same y, different x. Reverse the
    // DOM order vs. the visual order so DOM-order fallback can't fake
    // the result.
    await goToPassage(page, 'Home');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      root.innerHTML =
        '<a style="position:absolute; top:100px; left:300px;" data-test="right">Right</a>' +
        '<a style="position:absolute; top:100px; left:100px;" data-test="left">Left</a>' +
        '<a style="position:absolute; top:100px; left:200px;" data-test="middle">Middle</a>';
      // Force layout commit before reading rects.
      void root.offsetHeight;
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
    // assert — left → middle → right
    expect(tags[0]).toEqual({ key: '1', tag: 'left' });
    expect(tags[1]).toEqual({ key: '2', tag: 'middle' });
    expect(tags[2]).toEqual({ key: '3', tag: 'right' });
  });

  test('huntNavLink pins to the front of the number list in top-down order', async ({ game: page }) => {
    // arrange — three hunt-nav exits visually BELOW a regular .movebtn
    // link. Reading order alone would put the movebtn first, but the
    // hunt-nav pin keeps the exits at 1/2/3 (top-down) and pushes the
    // movebtn to 4. Real passage first so #passages can lay out.
    await goToPassage(page, 'Home');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      root.innerHTML =
        '<div style="position:absolute; top:50px; left:10px;">' +
          '<span class="movebtn"><a data-test="otherMove">Other</a></span>' +
        '</div>' +
        '<div style="position:absolute; top:400px; left:10px;">' +
          '<span class="movebtn huntNavLink"><a data-test="exit1">Exit1</a></span>' +
        '</div>' +
        '<div style="position:absolute; top:500px; left:10px;">' +
          '<span class="movebtn huntNavLink"><a data-test="exit2">Exit2</a></span>' +
        '</div>' +
        '<div style="position:absolute; top:600px; left:10px;">' +
          '<span class="movebtn huntNavLink"><a data-test="exit3">Exit3</a></span>' +
        '</div>';
      void root.offsetHeight;
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
    // assert — hunt-nav stack pinned to 1/2/3 in top-down order; the
    // other movebtn link drops to 4 even though it's visually higher.
    expect(tags[0]).toEqual({ key: '1', tag: 'exit1' });
    expect(tags[1]).toEqual({ key: '2', tag: 'exit2' });
    expect(tags[2]).toEqual({ key: '3', tag: 'exit3' });
    expect(tags[3]).toEqual({ key: '4', tag: 'otherMove' });
  });

  test('tool anchors get their permanent letter and are never numbered', async ({ game: page }) => {
    // arrange — fake a hunt-style tool card (data-tool on the wrapping
    // span) plus a regular movebtn link. The tool link must take its
    // permanent letter (f for EMF) and stay off the number map; the
    // movebtn link must still get 1.
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      root.innerHTML =
        '<span class="hunt-tool-card-label cardlink" data-tool="emf"><a data-test="emf">Use EMF</a></span>' +
        '<span data-tool="uvl"><a data-test="uvl">Use UVL</a></span>' +
        '<span class="movebtn"><a data-test="move">Move</a></span>';
      SugarCube.setup.KeyboardNav.refresh();
    });
    // act
    const out = await page.evaluate(() => {
      const root = document.getElementById('passages');
      return {
        numbers: SugarCube.setup.KeyboardNav._numberHotkeys(),
        emf:  root.querySelector('a[data-test="emf"]').getAttribute('data-hotkey-letter'),
        uvl:  root.querySelector('a[data-test="uvl"]').getAttribute('data-hotkey-letter'),
        move: root.querySelector('a[data-test="move"]').getAttribute('data-hotkey'),
        emfHotkey: root.querySelector('a[data-test="emf"]').getAttribute('data-hotkey'),
        uvlHotkey: root.querySelector('a[data-test="uvl"]').getAttribute('data-hotkey')
      };
    });
    // assert — tools carry their letter, no number; move is sole number.
    expect(out.emf).toBe('f');
    expect(out.uvl).toBe('u');
    expect(out.emfHotkey).toBeNull();
    expect(out.uvlHotkey).toBeNull();
    expect(out.numbers.length).toBe(1);
    expect(out.move).toBe('1');
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

  test('alwaysShowHotkeys setting inverts the Alt-hold behavior', async ({ game: page }) => {
    // arrange — flip the player setting on, then refresh the visibility.
    await goToPassage(page, 'Home');
    await page.evaluate(() => {
      SugarCube.settings.alwaysShowHotkeys = true;
      SugarCube.setup.KeyboardNav.applyHotkeyVisibility();
    });
    // act + assert: the badges are visible at rest now
    let hasClass = await page.evaluate(() => document.body.classList.contains('show-hotkeys'));
    expect(hasClass).toBe(true);
    // Alt held HIDES them
    await page.keyboard.down('Alt');
    hasClass = await page.evaluate(() => document.body.classList.contains('show-hotkeys'));
    expect(hasClass).toBe(false);
    // Releasing Alt restores visibility
    await page.keyboard.up('Alt');
    hasClass = await page.evaluate(() => document.body.classList.contains('show-hotkeys'));
    expect(hasClass).toBe(true);
    // cleanup so this leak doesn't bleed into the next test
    await page.evaluate(() => {
      SugarCube.settings.alwaysShowHotkeys = false;
      SugarCube.setup.KeyboardNav.applyHotkeyVisibility();
    });
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

  test('sidebar links get letter shortcuts (Bag → b, Notebook → n, Evidence → v, ChangeLog → y)', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act
    const letters = await page.evaluate(() => SugarCube.setup.KeyboardNav._letterHotkeys());
    const byPassage = Object.fromEntries(letters.map(l => [l.passage, l.key]));
    // assert
    expect(byPassage.Bag).toBe('b');
    expect(byPassage.Notebook).toBe('n');
    expect(byPassage.Evidence).toBe('v');
    expect(byPassage.ChangeLog).toBe('y');
  });

  test('companion card link picks up the c in-passage letter shortcut', async ({ game: page }) => {
    // arrange — drop a fake companion card anchor into the passage.
    // The widget rotates through CompanionMain / CompanionFailed /
    // CompanionSucceeded depending on hunt state; they all share the
    // .companion-card-link class, so the selector binding catches
    // whichever the widget rendered this tick.
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      root.innerHTML = '<a class="companion-card-link" data-test="card">card</a>';
      SugarCube.setup.KeyboardNav.refresh();
    });
    // act
    const letter = await page.evaluate(() => {
      const root = document.getElementById('passages');
      const a = root.querySelector('a.companion-card-link');
      return a && a.getAttribute('data-hotkey-letter');
    });
    // assert
    expect(letter).toBe('c');
  });

  test('hunt lights pick up l / o in-passage letter shortcuts', async ({ game: page }) => {
    // arrange — fake the huntFooterLight markup directly so the test
    // doesn't have to drive a real hunt to verify the binding.
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      root.innerHTML =
        '<div class="hunt-run-lights">' +
          '<span class="kbnav-light-on"><a data-test="on">on</a></span>' +
          '<span class="kbnav-light-off"><a data-test="off">off</a></span>' +
        '</div>';
      SugarCube.setup.KeyboardNav.refresh();
    });
    // act
    const map = await page.evaluate(() => {
      const root = document.getElementById('passages');
      const on  = root.querySelector('.kbnav-light-on a');
      const off = root.querySelector('.kbnav-light-off a');
      return {
        on:  on  && on.getAttribute('data-hotkey-letter'),
        off: off && off.getAttribute('data-hotkey-letter')
      };
    });
    // assert
    expect(map.on).toBe('l');
    expect(map.off).toBe('o');
  });

  /* Regression guard: sidebar HUD letter shortcuts and the hunt search-tool
   * key handler are two independent keydown listeners. If their keymaps
   * overlap, pressing the shared key both activates the tool everywhere
   * AND navigates away from the hunt screen — confusing and destructive.
   * This test pins them as disjoint sets. */
  test('sidebar letter shortcuts never overlap with search-tool keys', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act
    const { sidebarKeys, toolKeys } = await page.evaluate(() => {
      const letters = SugarCube.setup.KeyboardNav._letterHotkeys();
      return {
        sidebarKeys: letters.map(l => l.key),
        toolKeys: Object.keys(SugarCube.setup.searchToolKeyMap || {}),
      };
    });
    // assert
    const overlap = sidebarKeys.filter(k => toolKeys.includes(k));
    expect(overlap).toEqual([]);
  });

  test('sidebar letter shortcuts are unique among themselves', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act
    const keys = await page.evaluate(() =>
      SugarCube.setup.KeyboardNav._letterHotkeys().map(l => l.key)
    );
    // assert — no duplicates
    expect(keys.length).toBe(new Set(keys).size);
  });

  test('search-tool keys are unique among themselves', async ({ game: page }) => {
    // arrange
    await goToPassage(page, 'Home');
    // act — the values are the tool names; the keys are the letters.
    // A duplicate would mean two tools both claim the same hotkey.
    const map = await page.evaluate(() => SugarCube.setup.searchToolKeyMap);
    const keys = Object.keys(map);
    const tools = Object.values(map);
    // assert
    expect(keys.length).toBe(new Set(keys).size);
    expect(tools.length).toBe(new Set(tools).size);
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

  /* Regression: .disabled-link is typically applied to the link's
   * parent span (the <<addclass ".cardlink" "disabled-link">> pattern
   * used by hunt-tool-card-label and the in-room <<searchTool>> markup),
   * not the <a> itself. The visibility check must walk ancestors.
   * Same for .disabled-linkSpecial, aria-disabled="true", and the
   * native [disabled] attribute — all four forms must exclude the
   * link from both numbering and the esc/tool letter stamps. */
  test('disabled ancestor forms (parent class, aria, native) all exclude the link', async ({ game: page }) => {
    // arrange
    await page.evaluate(() => {
      const root = document.getElementById('passages');
      root.innerHTML =
        // parent .disabled-link
        '<span class="movebtn disabled-link"><a data-test="parentDisabled">A</a></span>' +
        // parent .disabled-linkSpecial
        '<span class="disabled-linkSpecial"><a data-test="special">B</a></span>' +
        // aria-disabled on the anchor
        '<a aria-disabled="true" data-test="aria">C</a>' +
        // native [disabled] attribute
        '<a disabled data-test="native">D</a>' +
        // grandparent disabled — must still propagate
        '<div class="disabled-link"><span><a data-test="grandparent">E</a></span></div>' +
        // disabled backbtn must NOT get the esc letter
        '<span class="backbtn disabled-link"><a data-test="backDisabled">F</a></span>' +
        // disabled tool anchor must NOT get its tool letter
        '<span data-tool="emf" class="disabled-link"><a data-test="toolDisabled">G</a></span>' +
        // sanity: an enabled link in the same DOM still gets numbered
        '<span class="movebtn"><a data-test="ok">H</a></span>';
      SugarCube.setup.KeyboardNav.refresh();
    });
    // act
    const out = await page.evaluate(() => {
      const root = document.getElementById('passages');
      const tagsByNumber = SugarCube.setup.KeyboardNav._numberHotkeys().map(({ key }) => ({
        key,
        tag: root.querySelector(`a[data-hotkey="${key}"]`).getAttribute('data-test')
      }));
      const letters = ['parentDisabled', 'special', 'aria', 'native', 'grandparent', 'backDisabled', 'toolDisabled']
        .reduce((acc, t) => {
          const a = root.querySelector(`a[data-test="${t}"]`);
          acc[t] = a ? a.getAttribute('data-hotkey-letter') : 'MISSING';
          return acc;
        }, {});
      return { tagsByNumber, letters };
    });
    // assert — only the enabled movebtn link is numbered, and no
    // disabled link picked up an esc / tool letter.
    expect(out.tagsByNumber).toEqual([{ key: '1', tag: 'ok' }]);
    expect(out.letters.parentDisabled).toBeNull();
    expect(out.letters.special).toBeNull();
    expect(out.letters.aria).toBeNull();
    expect(out.letters.native).toBeNull();
    expect(out.letters.grandparent).toBeNull();
    expect(out.letters.backDisabled).toBeNull();
    expect(out.letters.toolDisabled).toBeNull();
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
