const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '../tests',
  globalSetup: require.resolve('../tests/global-setup.js'),
  /* Unit-ish tests finish in <1s. The 10s default absorbs variance in the
     heavier e2e specs (long loops that exercise ghost-ability RNG, or
     passages with dozens of <<do>>/<<redo>> tags) when workers contend for
     CPU. Tests that need more budget raise it individually. */
  timeout: 10_000,
  /* Every test gets one retry on failure. Browser specs share a page via
     beforeAll, but the `game` fixture resets SugarCube state between tests
     so a retry starts from a clean slate. */
  retries: 1,
  /* Each spec file shares a page via beforeAll, so tests within a file
     must stay serial — but files themselves are independent.  Let
     Playwright spin up one worker per spec file (up to ~70% the cores
     so we don't starve the machine). */
  fullyParallel: false,
  workers: process.env.CI ? 2 : Math.max(1, Math.floor(require('os').cpus().length * 0.70)),
  use: {
    baseURL: `file://${__dirname}/../ghost-in-msheet.html`,
    /* Run headless so the browser never steals focus from the editor. */
    headless: true,
    /* Skip unnecessary assets — the game is a local HTML file. */
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
  /* Lint specs (asset-filename-lint, tw-source-lint) read files straight
     from disk — no browser needed and sub-second runtime. Putting them
     in a dedicated `lint` project and making `chromium` depend on it
     means the cheap static checks run first; a lint failure fails the
     run before any e2e worker spins up.

     Release specs (`*.release.spec.js`) are exhaustive multi-minute
     sweeps (e.g. passage-walk-coverage walking every passage and
     clicking every link). They live in their own `release` project so
     `npm run test` doesn't pay the cost on every commit — they run via
     `npm run test:release`, which is gated on by the Package Release
     VS Code tasks. */
  projects: [
    {
      name: 'lint',
      testMatch: /.*-lint\.spec\.js/,
    },
    {
      name: 'chromium',
      testIgnore: [/.*-lint\.spec\.js/, /.*\.release\.spec\.js/, /.*\.mobile\.spec\.js/],
      use: { browserName: 'chromium' },
      dependencies: ['lint'],
    },
    {
      name: 'release',
      testMatch: /.*\.release\.spec\.js/,
      use: { browserName: 'chromium' },
      dependencies: ['lint'],
    },
    /* Mobile-rendering + tap-target specs. The desktop chromium project
       runs everything at Playwright's default ~1280×720 viewport; nothing
       there exercises the narrow-width layout or thumb-sized tap targets.
       The mobile project re-runs a curated smoke set at iPhone-13-ish
       dimensions (390×844) so layout overflow + tap-target regressions
       fail loudly. Gated behind `npm run test:mobile` for now because the
       game's CSS has only one @media rule — the initial run is expected
       to surface real defects, not a steady-state pass. */
    {
      name: 'mobile',
      testMatch: /.*\.mobile\.spec\.js/,
      use: { browserName: 'chromium' },
      dependencies: ['lint'],
    },
  ],
});
