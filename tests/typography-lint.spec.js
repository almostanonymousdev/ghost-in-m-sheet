/**
 * Typography contract lint (Node-only, runs in the `lint` project).
 *
 * The game's fonts go through one source of truth: a set of --font-*
 * custom properties declared in passages/styles/StoryStylesheet.css.
 * The body splits between two of them — the literary serif everywhere
 * (--font-normal) and the original clean system sans while a hunt run
 * is active (--font-haunted), so "haunted houses keep their existing
 * font" and normal locations get their own.
 *
 * This spec keeps that contract honest without a browser:
 *
 *   1. Every required --font-* role is declared in :root.
 *   2. --font-haunted is still the system sans stack (it must NOT drift
 *      to a serif — that would silently change every haunted house).
 *   3. --font-normal is EB Garamond; --font-display is Creepster.
 *   4. The @import pulls EB Garamond + Creepster.
 *   5. The body font split rules exist.
 *   6. StyleController toggles the `hunt-active` body class off the
 *      live hunt run at :passagestart.
 *   7. No CSS under passages/ hard-codes a font-family — every
 *      declaration routes through var(--font-*) or `inherit`.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STYLES_DIR = path.join(ROOT, 'passages', 'styles');
const STYLESHEET = path.join(STYLES_DIR, 'StoryStylesheet.css');
const STYLE_CONTROLLER = path.join(STYLES_DIR, 'StyleController.js');

const stylesheet = fs.readFileSync(STYLESHEET, 'utf8');
const styleController = fs.readFileSync(STYLE_CONTROLLER, 'utf8');

/* Pull the raw value of a `--name:` custom property out of CSS source. */
function cssVar(src, name) {
  const m = src.match(new RegExp('--' + name + '\\s*:\\s*([^;]+);'));
  return m ? m[1].trim() : null;
}

const REQUIRED_VARS = [
  'font-haunted',
  'font-normal',
  'font-display',
  'font-mono',
  'font-script',
  'font-serif',
  'font-typewriter',
];

test.describe('Typography — font variable contract', () => {
  test('every required --font-* role is declared in :root', () => {
    const missing = REQUIRED_VARS.filter((v) => cssVar(stylesheet, v) === null);
    expect(missing).toEqual([]);
  });

  test('--font-haunted is still the clean system sans (haunted houses unchanged)', () => {
    const haunted = cssVar(stylesheet, 'font-haunted');
    expect(haunted).toContain('-apple-system');
    expect(haunted).toContain('sans-serif');
    // Guard against an accidental serif/display drift — that would
    // restyle every haunted house, which the design forbids.
    expect(haunted.toLowerCase()).not.toContain('garamond');
    expect(haunted.toLowerCase()).not.toContain('creepster');
    expect(haunted.toLowerCase()).not.toContain('cormorant');
    // No standalone serif fallback — only "sans-serif" is allowed.
    expect(haunted.toLowerCase().replace(/sans-serif/g, '')).not.toContain('serif');
  });

  test('--font-normal is EB Garamond, --font-display is Creepster', () => {
    expect(cssVar(stylesheet, 'font-normal')).toContain('EB Garamond');
    expect(cssVar(stylesheet, 'font-display')).toContain('Creepster');
  });

  test('@import pulls EB Garamond and Creepster', () => {
    const importLine = stylesheet.split('\n')[0];
    expect(importLine).toContain('fonts.googleapis.com');
    expect(importLine).toContain('EB+Garamond');
    expect(importLine).toContain('Creepster');
  });

  test('body font split rules exist', () => {
    // Default body → normal serif.
    expect(stylesheet).toMatch(/\bbody\s*\{[^}]*font-family:\s*var\(--font-normal\)/);
    // Hunt-active body → haunted sans.
    expect(stylesheet).toMatch(/body\.hunt-active\s*\{[^}]*font-family:\s*var\(--font-haunted\)/);
  });

  test('display titles use the display font', () => {
    expect(stylesheet).toMatch(/#story-title[\s\S]*?font-family:\s*var\(--font-display\)/);
  });
});

test.describe('Typography — hunt-active body class wiring', () => {
  test('StyleController toggles hunt-active off the live run at :passagestart', () => {
    expect(styleController).toContain(":passagestart");
    expect(styleController).toMatch(/toggleClass\(\s*['"]hunt-active['"]/);
    expect(styleController).toContain('setup.HuntController.isActive()');
  });
});

/* --- No hard-coded font families under passages/ ----------------------
   Every font-family declaration in the project's own CSS must route
   through a var(--font-*) token or `inherit`. The --font-* custom
   properties themselves (which legitimately spell out real family
   names) are declarations of `--font-...:`, not `font-family:`, so they
   are not matched. SugarCube's bundled CSS lives outside passages/ and
   is not scanned. */
function walkCss(dir) {
  const out = [];
  (function recur(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { recur(full); continue; }
      if (entry.name.endsWith('.css')) out.push(full);
    }
  })(dir);
  return out;
}

const FONT_FAMILY_RE = /font-family\s*:\s*([^;}]+)/g;

test.describe('Typography — single source of truth', () => {
  test('no CSS under passages/ hard-codes a font-family', () => {
    const violations = [];
    for (const file of walkCss(path.join(ROOT, 'passages'))) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      let m;
      FONT_FAMILY_RE.lastIndex = 0;
      while ((m = FONT_FAMILY_RE.exec(src)) !== null) {
        const value = m[1].trim();
        const ok = value.includes('var(--font-') || value === 'inherit';
        if (!ok) {
          const line = src.slice(0, m.index).split('\n').length;
          violations.push(`${rel}:${line}: font-family: ${value}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
