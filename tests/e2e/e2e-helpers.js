const { expect } = require('@playwright/test');
const { setVar, getVar } = require('../helpers');

/**
 * Assert that no SugarCube errors are visible on the page.
 */
async function expectNoErrors(page) {
  const errors = await page.evaluate(() => {
    const problems = [];
    document.querySelectorAll('[class*="error"]').forEach(el => {
      if (el.offsetParent !== null) {
        problems.push('error-element: ' + el.textContent.trim().slice(0, 120));
      }
    });
    const passageEl = document.querySelector('.passage');
    if (passageEl) {
      const text = passageEl.textContent;
      const macroLeaks = text.match(/<<\/?[a-zA-Z][^>]*>>/g);
      if (macroLeaks) {
        problems.push('unprocessed-macros: ' + macroLeaks.slice(0, 5).join(', '));
      }
    }
    return problems;
  });
  expect(errors, 'SugarCube errors found on page:\n' + errors.join('\n')).toHaveLength(0);
}

/**
 * Assert that no raw HTML tags or code are visible in the passage text.
 */
async function expectNoVisibleCode(page) {
  const problems = await page.evaluate(() => {
    const issues = [];
    const passageEl = document.querySelector('.passage');
    if (!passageEl) return issues;
    const walker = document.createTreeWalker(passageEl, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent;
      if (/<\/?(?:div|span|img|br|p|table|tr|td|th|ul|ol|li|a|h[1-6]|style|script)\b/i.test(t)) {
        const parent = node.parentElement;
        if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) continue;
        issues.push('visible-html: ' + t.trim().slice(0, 120));
      }
      if (/\$[a-zA-Z_]\w*\.\w+/.test(t)) {
        const parent = node.parentElement;
        if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) continue;
        if (parent && parent.closest && parent.closest('[class*="cheat"]')) continue;
        issues.push('visible-variable: ' + t.trim().slice(0, 120));
      }
    }
    return issues;
  });
  expect(problems, 'Visible code/HTML found on page:\n' + problems.join('\n')).toHaveLength(0);
}

async function expectCleanPassage(page) {
  await expectNoErrors(page);
  await expectNoVisibleCode(page);
}

/**
 * Assign a specific ghost by name and set up the Owaissa house for hunting.
 */
async function setupHunt(page, ghostName) {
  await page.evaluate((name) => {
    const V = SugarCube.State.variables;
    for (let i = 1; i <= SugarCube.setup.GHOST_SLOT_COUNT; i++) {
      if (V['ghost' + i] && V['ghost' + i].name === name) {
        V.ghost = JSON.parse(JSON.stringify(V['ghost' + i]));
        break;
      }
    }
  }, ghostName);

  const assigned = await getVar(page, 'ghost.name');
  if (assigned !== ghostName) {
    throw new Error(`Failed to assign ghost "${ghostName}", got "${assigned}"`);
  }

  await setVar(page, 'ghostHuntingMode', 2);
  await setVar(page, 'isOwaissa', 1);
  await setVar(page, 'isElm', 0);
  await setVar(page, 'isEnigma', 0);
  await setVar(page, 'isIronclad', 0);

  await page.evaluate(() => {
    SugarCube.State.variables.ghostRoom = { name: 'kitchen' };
  });

  await setVar(page, 'hours', 0);
  await setVar(page, 'minutes', 10);
}

/**
 * Set up the rescue quest as if the player has met Rain and has an
 * active quest for a given girl.
 */
async function setupActiveQuest(page, girlName) {
  await setVar(page, 'relationshipWithRain', 3);
  await setVar(page, 'hasQuestForRescue', 1);
  await setVar(page, 'currentRescueGirl', girlName);
  await setVar(page, 'rescueStage', 0);
  await setVar(page, 'randomRescuePhotoNumber', 5);
  await setVar(page, 'rescueQuestCD', 0);
  await setVar(page, 'rescueCD', 0);
  await setVar(page, 'mc.energy', 10);
  await setVar(page, 'hours', 12);
  await setVar(page, 'minutes', 0);
  await page.evaluate(() => {
    const V = SugarCube.State.variables;
    if (!V.tornStyleRandom) {
      V.tornStyleRandom = 'torn-style-1 torn-effect';
    }
  });
}

module.exports = {
  expectNoErrors,
  expectNoVisibleCode,
  expectCleanPassage,
  setupHunt,
  setupActiveQuest,
};
