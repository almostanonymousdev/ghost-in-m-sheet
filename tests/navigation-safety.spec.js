const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PASSAGES_DIR = path.join(__dirname, '..', 'passages');

// ── file & passage helpers (shared with tw-source-lint) ─────────

function collectTwFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTwFiles(full));
    } else if (entry.name.endsWith('.tw')) {
      results.push(full);
    }
  }
  return results;
}

function parseHeader(line) {
  const match = line.match(/^:: (.+?)(?:\s+(\[.*?\]))?\s*(\{.*\})?\s*$/);
  if (!match) return null;
  const tagsRaw = match[2] || '';
  const tags = tagsRaw ? tagsRaw.slice(1, -1).split(/\s+/).filter(Boolean) : [];
  return { name: match[1].trim(), tags };
}

function parsePassages(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const passages = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseHeader(lines[i]);
    if (parsed) {
      if (current) {
        current.body = lines.slice(current._bodyStart, i).join('\n');
        passages.push(current);
      }
      current = { ...parsed, file: filePath, headerLine: i + 1, _bodyStart: i + 1 };
    }
  }
  if (current) {
    current.body = lines.slice(current._bodyStart).join('\n');
    passages.push(current);
  }
  return passages;
}

function rel(filePath) {
  return path.relative(PASSAGES_DIR, filePath);
}

function loc(p) {
  return `${rel(p.file)}:${p.headerLine}`;
}

// ── navigation detection ────────────────────────────────────────

/** True if the text contains a navigation link or goto. */
function hasNavigation(text) {
  return /\[\[/.test(text) ||
    /<<link\s/.test(text) ||
    /<<goto\s/.test(text);
}

/** Tags that mark passages we should skip (not player-facing). */
const SKIP_TAGS = new Set([
  'script', 'stylesheet', 'widget', 'noreturn', 'Twine.image',
]);

function shouldSkip(passage) {
  if (passage.tags.some(t => SKIP_TAGS.has(t))) return true;
  if (passage.name === 'StoryData') return true;
  // Widget containers (file holds <<widget>> definitions)
  if (/<<widget\s/.test(passage.body)) return true;
  return false;
}

// ── if/elseif/else block parser ─────────────────────────────────

/**
 * Find all <<if>>/<<elseif>>/<</if>> blocks in a passage body and
 * return structured data about each block.  Handles nesting correctly
 * via a stack.
 *
 * Returns an array of:
 *   { depth, branches: [{ type, text }], hasElse, line }
 *
 * Each branch is 'if', 'elseif', or 'else'.
 * `text` is the raw source between that keyword and the next.
 */
function parseIfBlocks(body) {
  const blocks = [];
  const stack = []; // open blocks being built

  // Tokenise: find every <<if …>>, <<elseif …>>, <<else>>, <</if>>
  const re = /<<(\/?\s*(?:if|elseif|else))\b[^>]*>>/g;
  let m;
  let lastIndex = 0;

  // We need position-based tracking to split text between tokens.
  const tokens = [];
  while ((m = re.exec(body)) !== null) {
    const raw = m[1].replace(/\s+/g, '');
    let type;
    if (raw === 'if') type = 'if';
    else if (raw === 'elseif') type = 'elseif';
    else if (raw === 'else') type = 'else';
    else if (raw === '/if') type = 'endif';
    else continue;
    tokens.push({ type, pos: m.index, end: m.index + m[0].length });
  }

  // Walk tokens and build block structures
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const nextPos = (i + 1 < tokens.length) ? tokens[i + 1].pos : body.length;

    if (tok.type === 'if') {
      stack.push({
        branches: [{ type: 'if', text: body.slice(tok.end, nextPos) }],
        hasElse: false,
        line: body.slice(0, tok.pos).split('\n').length,
        depth: stack.length,
      });
    } else if (tok.type === 'elseif' && stack.length > 0) {
      stack[stack.length - 1].branches.push({
        type: 'elseif',
        text: body.slice(tok.end, nextPos),
      });
    } else if (tok.type === 'else' && stack.length > 0) {
      stack[stack.length - 1].hasElse = true;
      stack[stack.length - 1].branches.push({
        type: 'else',
        text: body.slice(tok.end, nextPos),
      });
    } else if (tok.type === 'endif' && stack.length > 0) {
      blocks.push(stack.pop());
    }
  }

  return blocks;
}

// ── known issues (pre-existing, tracked for future cleanup) ─────
// These passages have the same missing-<<else>> pattern but are
// believed safe because they're only entered with valid state.
// Remove entries from this list as they get fixed.
const KNOWN_MISSING_ELSE = new Set([
  'gymTrainer',
  'lightPassageGhost',
  'succubusPCEvent',
  'summoningStart',
  'LibrarySearchResult',
  'rescueAshPossessed',
  'rescueJadePossessed1',
  'rescueJadePossessed2',
  'rescueJuliaPossessed',
  'rescueStay',
  'piercing',
  'ghostSpecialEventSpirit',
]);

// ── collect all passages ────────────────────────────────────────

const allFiles = collectTwFiles(PASSAGES_DIR);
const allPassages = allFiles.flatMap(parsePassages);

// ── tests ───────────────────────────────────────────────────────

test.describe('navigation safety', () => {

  test('if/elseif dispatch chains must have <<else>> when they contain the only navigation', () => {
    const violations = [];

    for (const p of allPassages) {
      if (shouldSkip(p)) continue;

      // Build "guaranteed reachable" text by stripping conditional-only
      // parts of if/elseif blocks but KEEPING <<else>> content (which
      // always runs as a fallback) and content outside all blocks.
      let guaranteed = p.body;
      let prev;
      do {
        prev = guaranteed;
        // Remove innermost if blocks that HAVE an <<else>>:
        // keep only the <<else>> branch content (the guaranteed fallback).
        guaranteed = guaranteed.replace(
          /<<if\b[^>]*>>((?:(?!<<if\b)[\s\S])*?)<<else>>((?:(?!<<if\b)[\s\S])*?)<<\/if>>/g,
          (_m, _cond, elseBranch) => elseBranch
        );
        // Remove innermost if blocks that have NO <<else>>:
        // these are entirely conditional, strip them completely.
        guaranteed = guaranteed.replace(
          /<<if\b[^>]*>>(?:(?!<<if\b)[\s\S])*?<<\/if>>/g, ''
        );
      } while (guaranteed !== prev);

      // If guaranteed-reachable text has navigation, the passage is safe.
      if (hasNavigation(guaranteed)) continue;

      // No guaranteed nav: check every if/elseif chain for a fallback.
      const blocks = parseIfBlocks(p.body);
      for (const block of blocks) {
        const hasElseif = block.branches.some(b => b.type === 'elseif');
        if (!hasElseif) continue;

        const branchesWithNav = block.branches.filter(b => hasNavigation(b.text));
        if (branchesWithNav.length === 0) continue;

        if (!block.hasElse && !KNOWN_MISSING_ELSE.has(p.name)) {
          violations.push(
            `${loc(p)} "${p.name}" line ~${block.line}: ` +
            `<<if>>/<<elseif>> chain has navigation links in ` +
            `${branchesWithNav.length} branch(es) but no <<else>> fallback — ` +
            `player may get stuck if no condition matches`
          );
        }
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('linkreplace blocks that remove a Leave/Back link must always provide replacement navigation', () => {
    const violations = [];

    for (const p of allPassages) {
      if (shouldSkip(p)) continue;

      // Find patterns where a span with a Back/Leave link is replaced,
      // and the linkreplace content has only conditional navigation.
      //
      // Pattern: <<replace "#id">><</replace>> inside a <<linkreplace>>
      // followed by <<if>> with navigation but no <<else>>.
      //
      // We detect: <<linkreplace>> blocks whose content has <<if>> with
      // navigation but no <<else>>, AND the passage has a <<replace>>
      // that clears an element containing a Back/Leave link.

      const hasReplaceClearing = /<<replace\s+"#\w+">>[\s]*<\/replace>>/.test(p.body) ||
                                  /<<replace\s+"#\w+">>[\s]*<<\/replace>>/.test(p.body);
      if (!hasReplaceClearing) continue;

      // Find linkreplace blocks
      const lrRe = /<<linkreplace\s+[^>]+>>([\s\S]*?)<<\/linkreplace>>/g;
      let lrMatch;
      while ((lrMatch = lrRe.exec(p.body)) !== null) {
        const lrContent = lrMatch[1];

        // Does this linkreplace clear a span (removing existing navigation)?
        if (!/<<replace\s+"#\w+">>[\s]*<<\/replace>>/.test(lrContent)) continue;

        // Does the linkreplace content have conditional-only navigation?
        const lrBlocks = parseIfBlocks(lrContent);
        const hasUnconditionalNav = hasNavigation(
          lrContent.replace(/<<if\b[\s\S]*?<<\/if>>/g, '')
        );

        if (hasUnconditionalNav) continue;

        // Check if any if block has nav without else
        for (const block of lrBlocks) {
          const branchesWithNav = block.branches.filter(b => hasNavigation(b.text));
          if (branchesWithNav.length > 0 && !block.hasElse) {
            violations.push(
              `${loc(p)} "${p.name}": <<linkreplace>> clears existing navigation ` +
              `and replacement has conditional-only links with no <<else>> fallback`
            );
            break;
          }
        }
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('passages that disable sidebar nav and link to each other must not rely on <<return>>/<<back>>', () => {
    // Build a map of passage name → passage data
    const passageMap = new Map();
    for (const p of allPassages) {
      passageMap.set(p.name, p);
    }

    // Find passages that disable sidebar navigation
    const disablesSidebar = (body) =>
      /<<addclass\s+["'].linkselector["']\s+["']disabled-link["']>>/.test(body);

    // Extract [[link]] targets from a passage body
    function getLinkTargets(body) {
      const targets = new Set();
      // [[display->target]] or [[target]]
      const linkRe = /\[\[(?:[^\]|]*->|[^\]|]*\|)?([^\]|]+)\]\]/g;
      let m;
      while ((m = linkRe.exec(body)) !== null) {
        targets.add(m[1].trim());
      }
      return targets;
    }

    const violations = [];

    for (const p of allPassages) {
      if (shouldSkip(p)) continue;
      if (!disablesSidebar(p.body)) continue;

      const targets = getLinkTargets(p.body);
      for (const targetName of targets) {
        const target = passageMap.get(targetName);
        if (!target) continue;
        if (!disablesSidebar(target.body)) continue;

        // Both passages disable sidebar nav and p links to target.
        // If target only uses <<return>>/<<back>> to exit, clicking
        // back will return to p, and the player may loop.
        const usesOnlyReturnOrBack =
          (/<<return>>|<<back>>/.test(target.body)) &&
          !(/<<goto\s/.test(target.body));

        if (usesOnlyReturnOrBack) {
          violations.push(
            `${loc(p)} "${p.name}" links to "${targetName}" — both disable ` +
            `sidebar navigation, but "${targetName}" relies on <<return>>/<<back>> ` +
            `which can loop between them, trapping the player`
          );
        }
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('passages that disable sidebar nav must have at least one exit link', () => {
    // Passages that are only ever <<include>>-d from other passages;
    // exit navigation is provided by the parent passage.
    const INCLUDED_ONLY = new Set([
      'findStolenClothes',
    ]);

    const violations = [];

    for (const p of allPassages) {
      if (shouldSkip(p)) continue;
      if (INCLUDED_ONLY.has(p.name)) continue;

      const disables = /<<addclass\s+["'].linkselector["']\s+["']disabled-link["']>>/.test(p.body);
      if (!disables) continue;

      // Must have some form of navigation out
      const hasExit = hasNavigation(p.body) ||
        /<<return>>|<<back>>/.test(p.body);

      if (!hasExit) {
        violations.push(
          `${loc(p)} "${p.name}" disables sidebar navigation but has no exit ` +
          `link — player will be trapped`
        );
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});
