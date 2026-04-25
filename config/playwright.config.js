const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '../tests',
  globalSetup: require.resolve('../tests/global-setup.js'),
  /* Unit-ish tests finish in <1s. The 10s default absorbs variance in the
     heavier e2e specs (long loops that exercise ghost-ability RNG, or
     passages with dozens of <<do>>/<<redo>> tags) when workers contend for
     CPU. Tests that need more budget raise it individually. */
  timeout: 10_000,
  /* Each spec file shares a page via beforeAll, so tests within a file
     must stay serial — but files themselves are independent.  Let
     Playwright spin up one worker per spec file (up to 75% the cores
     so we don't starve the machine). */
  fullyParallel: false,
  workers: process.env.CI ? 2 : Math.max(1, Math.floor(require('os').cpus().length * 0.75)),
  use: {
    baseURL: `file://${__dirname}/../dist/ghost-in-msheet.html`,
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
     run before any e2e worker spins up. */
  projects: [
    {
      name: 'lint',
      testMatch: /.*-lint\.spec\.js/,
    },
    {
      name: 'chromium',
      testIgnore: /.*-lint\.spec\.js/,
      use: { browserName: 'chromium' },
      dependencies: ['lint'],
    },
  ],
});
