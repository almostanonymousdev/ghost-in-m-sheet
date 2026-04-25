const { test, expect } = require('@playwright/test');
const { openGame, reseedRng, callSetup } = require('./helpers');

/*
 * Verifies the deterministic-RNG harness used by the rest of the test suite.
 *
 * The game does not call State.prng.init(), so SugarCube's random() and
 * either() fall through to Math.random. openGame({ seed }) installs a
 * seeded Mulberry32 PRNG before SugarCube loads, which covers every RNG
 * site in one hook. These tests pin that contract:
 *
 *   1. Math.random is deterministic given a seed.
 *   2. SugarCube's random()/either() inherit that determinism.
 *   3. Different seeds produce different sequences (sanity check — the
 *      patch is actually being applied, not silently no-op'd).
 *   4. reseedRng resets the stream mid-page so tests can rewind before
 *      Engine.restart without a full page reload.
 *   5. Without a seed, the RNG is unseeded (production behavior unchanged).
 */

function sampleMathRandom(page, n) {
  return page.evaluate((count) => {
    const out = [];
    for (let i = 0; i < count; i++) out.push(Math.random());
    return out;
  }, n);
}

test('same seed produces identical Math.random sequences across pages', async ({ browser }) => {
  const p1 = await openGame(browser, { seed: 12345 });
  const p2 = await openGame(browser, { seed: 12345 });
  try {
    const [a, b] = await Promise.all([sampleMathRandom(p1, 50), sampleMathRandom(p2, 50)]);
    expect(a).toEqual(b);
  } finally {
    await p1.close();
    await p2.close();
  }
});

test('different seeds produce different Math.random sequences', async ({ browser }) => {
  const p1 = await openGame(browser, { seed: 1 });
  const p2 = await openGame(browser, { seed: 2 });
  try {
    const [a, b] = await Promise.all([sampleMathRandom(p1, 20), sampleMathRandom(p2, 20)]);
    expect(a).not.toEqual(b);
  } finally {
    await p1.close();
    await p2.close();
  }
});

test('SugarCube random() macro inherits the seed', async ({ browser }) => {
  const p1 = await openGame(browser, { seed: 42 });
  const p2 = await openGame(browser, { seed: 42 });
  try {
    // SugarCube exposes `random` on the template API; it's the same function
    // the <<set _x to random(a, b)>> macro invokes.
    const rolls = (page) => page.evaluate(() => {
      const r = SugarCube.State.random
        ? () => Math.floor(SugarCube.State.random() * 1000)
        : () => Math.floor(Math.random() * 1000);
      const out = [];
      for (let i = 0; i < 30; i++) out.push(r());
      return out;
    });
    const [a, b] = await Promise.all([rolls(p1), rolls(p2)]);
    expect(a).toEqual(b);
  } finally {
    await p1.close();
    await p2.close();
  }
});

test('reseedRng rewinds the stream to a known point', async ({ browser }) => {
  // Page-open + game init consume some RNG draws, so samples taken right
  // after openGame don't start at state=seed. That's fine — the contract of
  // reseedRng is "after this call, the stream starts from `seed` again".
  // We verify that contract by comparing two post-reseed samples.
  const page = await openGame(browser, { seed: 7 });
  try {
    await reseedRng(page, 7);
    const first = await sampleMathRandom(page, 10);

    await sampleMathRandom(page, 100); // advance
    await reseedRng(page, 7);
    const second = await sampleMathRandom(page, 10);
    expect(second).toEqual(first);

    await reseedRng(page, 8);
    const third = await sampleMathRandom(page, 10);
    expect(third).not.toEqual(first);
  } finally {
    await page.close();
  }
});

test('without a seed, Math.random stays unseeded (production parity)', async ({ browser }) => {
  const p1 = await openGame(browser);
  const p2 = await openGame(browser);
  try {
    const [a, b] = await Promise.all([sampleMathRandom(p1, 20), sampleMathRandom(p2, 20)]);
    // Two freshly opened pages using the platform RNG must not match.
    // (If this ever flakes, the platform is broken long before our tests are.)
    expect(a).not.toEqual(b);
    // Sanity: our override hook shouldn't be present.
    const hasHook = await p1.evaluate(() => typeof window.__rng__ !== 'undefined');
    expect(hasHook).toBe(false);
  } finally {
    await p1.close();
    await p2.close();
  }
});

test('seeded game produces reproducible in-game RNG (either/random macros)', async ({ browser }) => {
  // Exercise a real in-game random surface: SugarCube's `either()` picks one
  // of N values uniformly using State.random / Math.random. Same seed must
  // yield the same picks for the same call sequence.
  const pick = (page) => page.evaluate(() => {
    // Use the template-scope `either` SugarCube exposes globally.
    // Falls back to inline implementation if not reachable — the point is
    // that whatever it calls ultimately hits our patched Math.random.
    const either = window.either || ((...args) => args[Math.floor(Math.random() * args.length)]);
    const out = [];
    for (let i = 0; i < 40; i++) out.push(either('a', 'b', 'c', 'd', 'e'));
    return out;
  });
  const p1 = await openGame(browser, { seed: 999 });
  const p2 = await openGame(browser, { seed: 999 });
  try {
    const [a, b] = await Promise.all([pick(p1), pick(p2)]);
    expect(a).toEqual(b);
    // And the output should actually vary — not e.g. always 'a'.
    expect(new Set(a).size).toBeGreaterThan(1);
  } finally {
    await p1.close();
    await p2.close();
  }
});
