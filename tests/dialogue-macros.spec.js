const { test, expect } = require('./fixtures');
const { setVar } = require('./helpers');

/*
 * Dialogue markup macros (passages/gui/DialogueController.js). These wrap a
 * line of prose so that spoken words always read as quotes + speaker colour
 * and stage directions stop borrowing the speaker's colour -- the fix for the
 * "can't tell narrator from speaker" feedback on the manager scene.
 *
 * Render each macro into a detached div via SugarCube's $.wiki() and inspect
 * the resulting markup directly (same pattern as lvl-star.spec.js).
 */

const LQ = '“'; // left curly quote
const RQ = '”'; // right curly quote

function render(page, src) {
  return page.evaluate((s) => {
    const $div = jQuery('<div></div>');
    $div.wiki(s);
    return $div.html();
  }, src);
}

// Visible text only -- the wrapper chars (quotes, tildes) are text nodes that
// sit around the body's own <span>, so the raw HTML is never a contiguous
// "~hngh~"; the rendered text is.
function renderText(page, src) {
  return page.evaluate((s) => {
    const $div = jQuery('<div></div>');
    $div.wiki(s);
    return $div.text();
  }, src);
}

test.describe('Dialogue macros', () => {
  test('<<mc>> renders pink quoted speech as a block speech-line', async ({ game: page }) => {
    const html = await render(page, '<<mc>>Hello there.<</mc>>');
    expect(html).toContain('mc-speech');
    expect(html).toContain('speech-line');
    expect(html).toContain(LQ);
    expect(html).toContain(RQ);
    expect(html).toContain('Hello there.');
    // MC is the unlabelled POV character by default.
    expect(html).not.toContain('speaker-name');
  });

  test('<<say>> renders blue quoted speech with no label by default', async ({ game: page }) => {
    const html = await render(page, '<<say>>You are in luck.<</say>>');
    expect(html).toContain('notmc-speech');
    expect(html).toContain('speech-line');
    expect(html).toContain(LQ + ''); // opening quote present
    expect(html).toContain('You are in luck.');
    expect(html).not.toContain('speaker-name');
    expect(html).not.toContain('class="mc-speech'); // not the MC colour
  });

  test('<<say "Name">> renders a bold speaker label in the speech colour', async ({ game: page }) => {
    const html = await render(page, '<<say "Jerry">>You are in luck.<</say>>');
    expect(html).toContain('speaker-name');
    expect(html).toContain('Jerry:');
    // The label sits inside the speaker-coloured span, before the quote.
    expect(html.indexOf('Jerry:')).toBeLessThan(html.indexOf('You are in luck.'));
    expect(html).toContain(LQ);
  });

  test('<<narration>> is narration: italic stage-dir, NOT speaker-coloured, no quotes', async ({ game: page }) => {
    const html = await render(page, '<<narration>>He clears his throat.<</narration>>');
    expect(html).toContain('stage-dir');
    expect(html).toContain('He clears his throat.');
    expect(html).not.toContain(LQ);
    expect(html).not.toContain(RQ);
    expect(html).not.toContain('mc-speech');
    expect(html).not.toContain('notmc-speech');
    expect(html).not.toContain('speech-line');
  });

  test('<<thought>> renders mc-thoughts with no quotes', async ({ game: page }) => {
    const html = await render(page, '<<thought>>Three batteries left.<</thought>>');
    expect(html).toContain('mc-thoughts');
    expect(html).toContain('Three batteries left.');
    expect(html).not.toContain(LQ);
  });

  test('<<vocal mc>> / <<vocal npc>> are speaker-coloured, italic, auto ~tilde~ wrapped', async ({ game: page }) => {
    const mc = await render(page, '<<vocal mc>>mm<</vocal>>');
    expect(mc).toContain('mc-speech');
    expect(mc).toContain('vocal');
    expect(mc).not.toContain(LQ);
    // The macro adds the tildes -- author types the bare moan.
    expect(await renderText(page, '<<vocal mc>>mm<</vocal>>')).toBe('~mm~');

    const npc = await render(page, '<<vocal npc>>Atta girl.<</vocal>>');
    expect(npc).toContain('notmc-speech');
    expect(npc).toContain('vocal');
    expect(npc).not.toContain(LQ);
    expect(await renderText(page, '<<vocal npc>>Atta girl.<</vocal>>')).toBe('~Atta girl.~');
  });

  test('<<vocal>> defaults to the MC voice and auto-wraps in tildes', async ({ game: page }) => {
    const html = await render(page, '<<vocal>>hngh<</vocal>>');
    expect(html).toContain('mc-speech');
    expect(html).toContain('vocal');
    expect(await renderText(page, '<<vocal>>hngh<</vocal>>')).toBe('~hngh~');
  });

  test('macro bodies still render inner macros / expressions', async ({ game: page }) => {
    const html = await render(page, '<<say>>That is <<= 2 + 3>> dollars.<</say>>');
    expect(html).toContain('That is 5 dollars.');
  });

  test('<<mc true>> prefixes the MC name as a label', async ({ game: page }) => {
    await setVar(page, 'mc.name', 'Vera');
    const html = await render(page, '<<mc true>>Fine.<</mc>>');
    expect(html).toContain('speaker-name');
    expect(html).toContain('Vera:');
  });
});
