const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

test.describe('Alarm clock — bedroom flow', () => {
  test('Bedroom shows the alarm-clock entry and renders without errors', async ({ game: page }) => {
    await goToPassage(page, 'Bedroom');
    await expect(page.locator('#passages')).toContainText('Alarm clock');
    await expectCleanPassage(page);
  });

  test('AlarmClock passage offers an hour and persists the selection', async ({ game: page }) => {
    await goToPassage(page, 'AlarmClock');
    await expectCleanPassage(page);
    await page.locator('.passage').getByRole('link', { name: '06:00' }).click();
    await page.waitForFunction(
      () => SugarCube.State.variables.alarm
        && SugarCube.State.variables.alarm.enabled === true
    );
    expect(await callSetup(page, 'setup.Home.alarmEnabled()')).toBe(true);
    expect(await callSetup(page, 'setup.Home.alarmHour()')).toBe(6);
    await expect(page.locator('#passages')).toContainText('Alarm set for 06:00');
  });

  test('Turn-off link clears the alarm', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(8));
    await goToPassage(page, 'AlarmClock');
    await page.locator('.passage').getByRole('link', { name: 'Turn alarm off' }).click();
    await page.waitForFunction(
      () => SugarCube.State.variables.alarm.enabled === false
    );
    expect(await callSetup(page, 'setup.Home.alarmEnabled()')).toBe(false);
  });

  test('Sleep with alarm set wakes at the alarm hour and zeros minutes', async ({ game: page }) => {
    await setVar(page, 'hours', 23);
    await setVar(page, 'minutes', 37);
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(7));
    await goToPassage(page, 'Bedroom');
    await page.locator('.passage').getByRole('link', { name: 'Sleep', exact: true }).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Sleep');
    await page.locator('.passage').getByRole('link', { name: 'Wake up' }).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Bedroom');
    expect(await getVar(page, 'hours')).toBe(7);
    expect(await getVar(page, 'minutes')).toBe(0);
  });

  test('Sleep with alarm off keeps the legacy 8-hour advance and snaps minutes to 00', async ({ game: page }) => {
    // Wakes always land on HH:00 -- including the alarm-off default.
    await setVar(page, 'hours', 22);
    await setVar(page, 'minutes', 37);
    await goToPassage(page, 'Bedroom');
    await page.locator('.passage').getByRole('link', { name: 'Sleep', exact: true }).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Sleep');
    await page.locator('.passage').getByRole('link', { name: 'Wake up' }).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Bedroom');
    expect(await getVar(page, 'hours')).toBe(6);
    expect(await getVar(page, 'minutes')).toBe(0);
  });
});
