const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 5_000,
  /* Each spec file shares a page via beforeAll, so tests within a file
     must stay serial — but files themselves are independent.  Let
     Playwright spin up one worker per spec file (up to 75% the cores
     so we don't starve the machine). */
  fullyParallel: false,
  workers: process.env.CI ? 2 : Math.max(1, Math.floor(require('os').cpus().length * 0.75)),
  use: {
    baseURL: `file://${__dirname}/ghost-in-msheet.html`,
    /* Run headless so the browser never steals focus from the editor. */
    headless: true,
    /* Skip unnecessary assets — the game is a local HTML file. */
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
