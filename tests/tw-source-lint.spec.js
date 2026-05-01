const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PASSAGES_DIR = path.join(__dirname, '..', 'passages');

/** Recursively collect all .tw files under a directory. */
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

/**
 * Parse a Twee 3 passage header line.
 * Returns { name, tagsRaw, tags, metadataRaw, metadata } or null if not a header.
 */
function parseHeader(line) {
  const match = line.match(/^:: (.+?)(?:\s+(\[.*?\]))?\s*(\{.*\})?\s*$/);
  if (!match) return null;

  const tagsRaw = match[2] || '';
  const tags = tagsRaw ? tagsRaw.slice(1, -1).split(/\s+/).filter(Boolean) : [];

  let metadata = null;
  const metadataRaw = match[3] || '';
  if (metadataRaw) {
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      metadata = undefined; // signals parse failure
    }
  }

  return { name: match[1].trim(), tagsRaw, tags, metadataRaw, metadata };
}

/**
 * Split a .tw file into individual passages.
 * Returns [{ name, tags, tagsRaw, header, body, headerLine, file, metadata, metadataRaw }].
 */
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
      current = {
        ...parsed,
        header: lines[i],
        headerLine: i + 1,
        file: filePath,
        _bodyStart: i + 1,
      };
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

const allFiles = collectTwFiles(PASSAGES_DIR);
const allPassages = allFiles.flatMap(parsePassages);

// ── nobr consistency ─────────────────────────────────────────────

test.describe('nobr consistency', () => {

  test('no passage with [nobr] tag should contain <<nobr>> or <</nobr>>', () => {
    const violations = [];
    for (const p of allPassages) {
      if (!p.tags.includes('nobr')) continue;
      if (p.body.includes('<<nobr>>') || p.body.includes('<</nobr>>')) {
        violations.push(`${loc(p)} passage "${p.name}" has [nobr] tag but also contains <<nobr>>/<</nobr>> macros`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('no passage should be fully wrapped by <<nobr>>/<</nobr>> instead of using the [nobr] tag', () => {
    const violations = [];
    for (const p of allPassages) {
      if (p.tags.includes('nobr')) continue;
      const trimmed = p.body.trim();
      if (!trimmed) continue;
      const firstLine = trimmed.split('\n')[0].trim();
      const lastLine = trimmed.split('\n').at(-1).trim();
      if (firstLine === '<<nobr>>' && lastLine === '<</nobr>>') {
        violations.push(`${loc(p)} passage "${p.name}" is fully wrapped by <<nobr>>/<</nobr>>; use the [nobr] tag instead`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('no unmatched <<nobr>> or <</nobr>> macros', () => {
    const violations = [];
    for (const p of allPassages) {
      if (p.tags.includes('nobr')) continue;
      const opens = (p.body.match(/<<nobr>>/g) || []).length;
      const closes = (p.body.match(/<< *\/nobr>>/g) || []).length;
      if (opens !== closes) {
        violations.push(`${loc(p)} passage "${p.name}" has ${opens} <<nobr>> but ${closes} <</nobr>>`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── Twee 3 passage header format ─────────────────────────────────

test.describe('passage headers', () => {

  test('every passage name must be unique', () => {
    const seen = new Map();
    const duplicates = [];
    for (const p of allPassages) {
      if (p.name === 'StoryData') continue;
      const prev = seen.get(p.name);
      if (prev) {
        duplicates.push(`"${p.name}" defined at ${loc(prev)} and ${loc(p)}`);
      } else {
        seen.set(p.name, p);
      }
    }
    expect(duplicates, duplicates.join('\n')).toHaveLength(0);
  });

  test('no duplicate tags within a single passage header', () => {
    const violations = [];
    for (const p of allPassages) {
      const dupes = p.tags.filter((t, i) => p.tags.indexOf(t) !== i);
      if (dupes.length > 0) {
        violations.push(`${loc(p)} passage "${p.name}" has duplicate tag(s): ${[...new Set(dupes)].join(', ')}`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('metadata blocks must be valid JSON', () => {
    const violations = [];
    for (const p of allPassages) {
      if (!p.metadataRaw) continue;
      if (p.metadata === undefined) {
        violations.push(`${loc(p)} passage "${p.name}" has invalid JSON in metadata: ${p.metadataRaw}`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('metadata position must be comma-separated coordinates', () => {
    const violations = [];
    for (const p of allPassages) {
      if (!p.metadata?.position) continue;
      if (!/^\d+,\d+$/.test(p.metadata.position)) {
        violations.push(`${loc(p)} passage "${p.name}" has malformed position: "${p.metadata.position}"`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('metadata size must be comma-separated dimensions', () => {
    const violations = [];
    for (const p of allPassages) {
      if (!p.metadata?.size) continue;
      if (!/^\d+,\d+$/.test(p.metadata.size)) {
        violations.push(`${loc(p)} passage "${p.name}" has malformed size: "${p.metadata.size}"`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('passage names should not contain unescaped link metacharacters', () => {
    const violations = [];
    for (const p of allPassages) {
      if (/(?<!\\)[[\]|]/.test(p.name)) {
        violations.push(`${loc(p)} passage "${p.name}" contains unescaped link metacharacter(s)`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── special passages & tags ──────────────────────────────────────

test.describe('special passages and tags', () => {

  test('StoryData passage must contain valid JSON', () => {
    const storyData = allPassages.find(p => p.name === 'StoryData');
    if (!storyData) return;
    let parsed;
    expect(() => { parsed = JSON.parse(storyData.body.trim()); }).not.toThrow();
    expect(parsed).toHaveProperty('ifid');
  });

  test('[script] passages should only contain JavaScript, not Twee markup', () => {
    const violations = [];
    for (const p of allPassages) {
      if (!p.tags.includes('script')) continue;
      // Strip JS strings and comments before checking for Twee markup,
      // since <<macro>> may legitimately appear inside string literals or comments.
      const stripped = p.body
        .replace(/\/\/.*$/gm, '')          // single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
        .replace(/'(?:[^'\\]|\\.)*'/g, '') // single-quoted strings
        .replace(/"(?:[^"\\]|\\.)*"/g, '') // double-quoted strings
        .replace(/`(?:[^`\\]|\\.)*`/g, '');// template literals
      if (/<<[a-z]/i.test(stripped) || /@@\.[a-z]/i.test(stripped)) {
        violations.push(`${loc(p)} passage "${p.name}" is tagged [script] but appears to contain Twee/SugarCube markup`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('[stylesheet] passages should only contain CSS, not Twee markup', () => {
    const violations = [];
    for (const p of allPassages) {
      if (!p.tags.includes('stylesheet')) continue;
      if (/<<[a-z]/.test(p.body) || /@@\.[a-z]/.test(p.body)) {
        violations.push(`${loc(p)} passage "${p.name}" is tagged [stylesheet] but appears to contain Twee/SugarCube markup`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── JavaScript inside <<script>> / [script] ──────────────────────

test.describe('script-block JS hygiene', () => {

  /** Blank strings/comments so tokens inside them don't register as code. */
  function stripStringsAndComments(js) {
    return js
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  }

  /**
   * Yield every chunk of JavaScript found in a passage:
   *   - the full body of a [script]-tagged passage, or
   *   - each <<script>>…<</script>> span inside a regular passage.
   * Each chunk carries the absolute line number of its first line so
   * violation messages can point at the offending source.
   */
  function* scriptChunks(passage) {
    if (passage.tags.includes('script')) {
      yield { code: passage.body, startLine: passage.headerLine + 1 };
      return;
    }
    const re = /<<script>>([\s\S]*?)<<\/script>>/g;
    let m;
    while ((m = re.exec(passage.body)) !== null) {
      const before = passage.body.slice(0, m.index);
      const openLineOffset = before.split('\n').length; // 1-based within body
      yield {
        code: m[1],
        startLine: passage.headerLine + openLineOffset, // line of <<script>>
      };
    }
  }

  test('no references to bare `T` — SugarCube 2 has no T shorthand; use State.temporary', () => {
    // `T` is a SugarCube 3 / Snowman-ism. In SugarCube 2 it's undefined,
    // so `T.foo = ...` throws ReferenceError at runtime and the surrounding
    // macro logic silently falls through. The bug that prompted this test
    // was FreezeHunt.tw writing to T._freezeSlot and then <<switch _freezeSlot>>
    // always hitting <<default>>. Matches `T` as a standalone identifier
    // (not preceded by a word char or `$`) immediately followed by `.` or `[`.
    const badRefRe = /(?<![A-Za-z0-9_$.])T\s*[.\[]/;
    const violations = [];
    for (const p of allPassages) {
      for (const { code, startLine } of scriptChunks(p)) {
        const lines = stripStringsAndComments(code).split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (badRefRe.test(lines[i])) {
            const absLine = startLine + i;
            violations.push(
              `${rel(p.file)}:${absLine} "${p.name}": script references bare \`T\` — ` +
              `SugarCube 2 has no T shorthand, use \`State.temporary\` instead`
            );
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── indentation (nobr passages only — whitespace is cosmetic) ───

test.describe('indentation', () => {

  /**
   * Block macros whose <<name>> … <</name>> pairs must align.
   * Only macros that genuinely open a multi-line block belong here;
   * purely inline macros (<<set>>, <<run>>, etc.) are excluded.
   */
  const BLOCK_MACROS = new Set([
    'if', 'for', 'switch', 'widget', 'button',
    'done', 'capture', 'nobr', 'timed', 'repeat',
    'silently', 'script',
    'link', 'linkappend', 'linkprepend', 'linkreplace',
    'replace', 'append', 'prepend',
    'createplaylist', 'actions', 'type',
  ]);

  /** Mid-block markers that share their parent block's indent. */
  const MID_BLOCK = new Set(['else', 'elseif', 'case', 'default']);

  /** Leading whitespace of a line (the raw string, not a count). */
  function leadingWS(line) {
    return line.match(/^(\s*)/)[1];
  }

  /**
   * Find every block-macro tag on a line.  Returns an array of
   * { type: 'open'|'close'|'mid', name, pos }.
   *
   * Same-line open+close pairs (e.g. <<link …>><</link>>) are
   * detected: the open becomes type 'selfclose' (ignored for stack
   * purposes) and the close is omitted entirely.
   */
  function scanBlockMacros(line) {
    const raw = [];
    const re = /<<\s*(\/?)\s*([a-z]\w*)/gi;
    let m;
    while ((m = re.exec(line)) !== null) {
      const isClose = m[1] === '/';
      const name = m[2].toLowerCase();
      if (isClose) {
        if (BLOCK_MACROS.has(name)) raw.push({ type: 'close', name, pos: m.index });
      } else if (MID_BLOCK.has(name)) {
        raw.push({ type: 'mid', name, pos: m.index });
      } else if (BLOCK_MACROS.has(name)) {
        raw.push({ type: 'open', name, pos: m.index });
      }
    }
    // Pair same-line open+close: walk backwards so innermost pairs match first.
    const paired = new Set();
    for (let i = raw.length - 1; i >= 0; i--) {
      if (raw[i].type !== 'close') continue;
      for (let j = i - 1; j >= 0; j--) {
        if (raw[j].type === 'open' && raw[j].name === raw[i].name && !paired.has(j)) {
          paired.add(j);
          paired.add(i);
          break;
        }
      }
    }
    return raw.filter((_, idx) => !paired.has(idx));
  }

  /**
   * Walk through the body of a passage and return indentation
   * violations.  Each violation has a `type` ('align' or 'depth')
   * and a `msg` string.
   *
   * - align: a closing / mid-block tag's indent doesn't match its
   *          opening tag.
   * - depth: a line inside a block macro is not indented deeper
   *          than the enclosing block tag.
   *
   * Lines inside <style> HTML blocks and <<script>> SugarCube blocks
   * are exempt from all checks (CSS / JS have their own rules).
   */
  function findIndentViolations(passage) {
    const lines = passage.body.split('\n');
    const stack = [];      // { name, indent, line }
    const violations = [];
    let insideHtmlStyle = false;
    let insideBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];

      // Blank out `/* … */` block comments (across lines) and `// …`
      // trailing comments so `<<link>>`/`<<if>>` mentions inside a
      // descriptive comment don't register as real block-macro opens.
      // Replacing with spaces preserves column positions so indent /
      // leading-whitespace checks still line up.
      let working = raw;
      if (insideBlockComment) {
        const end = working.indexOf('*/');
        if (end === -1) continue;
        working = ' '.repeat(end + 2) + working.slice(end + 2);
        insideBlockComment = false;
      }
      for (;;) {
        const start = working.indexOf('/*');
        if (start === -1) break;
        const end = working.indexOf('*/', start + 2);
        if (end === -1) {
          working = working.slice(0, start)
            + ' '.repeat(working.length - start);
          insideBlockComment = true;
          break;
        }
        working = working.slice(0, start)
          + ' '.repeat(end + 2 - start)
          + working.slice(end + 2);
      }
      const lineComment = working.indexOf('//');
      if (lineComment !== -1) {
        working = working.slice(0, lineComment)
          + ' '.repeat(working.length - lineComment);
      }

      const trimmed = working.trim();
      if (!trimmed) continue;

      const indent  = leadingWS(working);
      const absLine = passage.headerLine + 1 + i;

      // ── track <style>…</style> regions ────────────────────────
      if (insideHtmlStyle) {
        if (/<\/style\s*>/i.test(trimmed)) insideHtmlStyle = false;
        continue;
      }
      if (/^<style[\s>]/i.test(trimmed)) {
        insideHtmlStyle = !/<\/style\s*>/i.test(trimmed);
      }

      // ── skip everything inside <<script>> ─────────────────────
      const insideScript = stack.length > 0 && stack[stack.length - 1].name === 'script';
      if (insideScript) {
        // only process <</script>> close to pop the stack
        const macros = scanBlockMacros(trimmed);
        for (const mc of macros) {
          if (mc.type === 'close' && mc.name === 'script') {
            for (let s = stack.length - 1; s >= 0; s--) {
              if (stack[s].name === 'script') { stack.length = s; break; }
            }
          }
        }
        continue;
      }

      // ── scan all block macros on this line ────────────────────
      const macros = scanBlockMacros(trimmed);
      const first  = macros[0] || null;
      // "leading" = the first macro is also the first non-ws token
      const leading = first && trimmed.startsWith('<<');

      // ── indent checks ─────────────────────────────────────────
      // Close / mid tags get an *alignment* check (must match opener).
      // Everything else gets a *depth* check (must be deeper than
      // the enclosing block).  The two are mutually exclusive per line.
      if (leading && first.type === 'close') {
        // alignment: close must match its opener
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].name === first.name) {
            if (indent !== stack[s].indent) {
              violations.push({ type: 'align', msg:
                `line ${absLine}: <</${first.name}>> indented ` +
                `${indent.length} but its <<${first.name}>> at line ` +
                `${stack[s].line} is indented ${stack[s].indent.length}`,
              });
            }
            break;
          }
        }
      } else if (leading && first.type === 'mid') {
        if (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (indent !== top.indent) {
            violations.push({ type: 'align', msg:
              `line ${absLine}: <<${first.name}>> indented ` +
              `${indent.length} but its <<${top.name}>> at line ` +
              `${top.line} is indented ${top.indent.length}`,
            });
          }
        }
      } else if (stack.length > 0 && !insideHtmlStyle) {
        // depth: content / nested opens must be deeper
        const top = stack[stack.length - 1];
        if (indent.length <= top.indent.length) {
          violations.push({ type: 'depth', msg:
            `line ${absLine}: content inside <<${top.name}>> ` +
            `(line ${top.line}) must be indented deeper`,
          });
        }
      }

      // ── update stack with ALL macros on this line ─────────────
      for (const mc of macros) {
        if (mc.type === 'close') {
          for (let s = stack.length - 1; s >= 0; s--) {
            if (stack[s].name === mc.name) { stack.length = s; break; }
          }
        } else if (mc.type === 'open') {
          stack.push({ name: mc.name, indent, line: absLine });
        }
        // mid-block markers don't change the stack
      }
    }

    return violations;
  }

  /** Filter helper. */
  function passageViolations(type) {
    const violations = [];
    for (const p of allPassages) {
      if (!p.tags.includes('nobr')) continue;
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      for (const v of findIndentViolations(p)) {
        if (v.type === type) violations.push(`${loc(p)} "${p.name}": ${v.msg}`);
      }
    }
    return violations;
  }

  test('block macro close / mid-block tags must align with their opening tag (nobr passages)', () => {
    const v = passageViolations('align');
    expect(v, v.join('\n')).toHaveLength(0);
  });

  test('content inside block macros must be indented deeper than the enclosing tag (nobr passages)', () => {
    const v = passageViolations('depth');
    expect(v, v.join('\n')).toHaveLength(0);
  });

  test('no line should contain multiple unpaired block-macro tags (nobr passages)', () => {
    const violations = [];
    for (const p of allPassages) {
      if (!p.tags.includes('nobr')) continue;
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      const lines = p.body.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        const macros = scanBlockMacros(trimmed);
        if (macros.length > 2) {
          const absLine = p.headerLine + 1 + i;
          const tags = macros.map(mc =>
            mc.type === 'close' ? `<</${mc.name}>>` :
            `<<${mc.name}>>`
          ).join(', ');
          violations.push(
            `${loc(p)} "${p.name}": line ${absLine} has ${macros.length} ` +
            `unpaired block macros on one line (${tags}) — add line breaks`
          );
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── HTML tag balance ─────────────────────────────────────────────

test.describe('html tag balance', () => {

  /** Container tags whose opens must be matched by closes within the same passage. */
  const CONTAINER_TAGS = [
    'span', 'div', 'p', 'a', 'section', 'article', 'nav',
    'header', 'footer', 'main', 'aside',
    'table', 'tr', 'td', 'th', 'thead', 'tbody',
    'ul', 'ol', 'li', 'label', 'form', 'button',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  ];

  /**
   * Strip block comments, HTML comments, and quoted strings so HTML tags
   * appearing inside <<link>> arguments, @src/@class expressions, and
   * /* ... *\/ comments are not counted.
   *
   * String-stripping is constrained to a single line to keep a stray
   * apostrophe in natural-language text (e.g. "doesn't") from pairing
   * with a quote many lines away and eating real markup in between.
   */
  function stripNonMarkup(body) {
    return body
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/`(?:[^`\\\n]|\\.)*`/g, '')
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, '')
      // Strip SugarCube <<macros>> so e.g. <<label '$x'>> isn't counted as an HTML <label>.
      // Dot doesn't match newline by default, which is what we want (macros on one line).
      .replace(/<<[^>]*?>>/g, '');
  }

  test('every opening HTML container tag has a matching closing tag within the same passage', () => {
    const violations = [];
    for (const p of allPassages) {
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      const stripped = stripNonMarkup(p.body);
      for (const tag of CONTAINER_TAGS) {
        const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi');
        const closeRe = new RegExp(`</\\s*${tag}\\s*>`, 'gi');
        const opens = (stripped.match(openRe) || []).length;
        const closes = (stripped.match(closeRe) || []).length;
        if (opens !== closes) {
          violations.push(
            `${loc(p)} "${p.name}" has ${opens} <${tag}> but ${closes} </${tag}>`
          );
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── raw <video>/<img> tags are forbidden; use <<video>>/<<image>> ───

test.describe('media element macros', () => {

  // Matches a real opening `<video` or `<img` HTML tag — guards against
  // false positives from `<<video …>>` macro calls and `<videoToggle …>`
  // widget calls by requiring a space/`>` directly after the tag name.
  const RAW_VIDEO = /(^|[^<])<video[\s>]/;
  const RAW_IMG   = /<img[\s>]/;

  test('no raw <video> tags — use the <<video>> macro', () => {
    const violations = [];
    for (const p of allPassages) {
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      const lines = p.body.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (RAW_VIDEO.test(lines[i])) {
          const absLine = p.headerLine + 1 + i;
          violations.push(`${loc(p)} "${p.name}": line ${absLine} contains a raw <video> tag — use <<video "path">> instead`);
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('no raw <img> tags — use the <<image>> macro', () => {
    const violations = [];
    for (const p of allPassages) {
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      const lines = p.body.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (RAW_IMG.test(lines[i])) {
          const absLine = p.headerLine + 1 + i;
          violations.push(`${loc(p)} "${p.name}": line ${absLine} contains a raw <img> tag — use <<image "path">> instead`);
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── stray macro delimiters ───────────────────────────────────────

test.describe('macro delimiters', () => {

  test('no tripled << or >> (stray macro delimiters)', () => {
    const violations = [];
    for (const p of allPassages) {
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      const lines = p.body.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const absLine = p.headerLine + 1 + i;
        // Match 3+ consecutive < or > which indicate a doubled << or >>
        // e.g. <<<<set  or  >>>>  or  <<<<<
        if (/<<</.test(line) || />>>/.test(line)) {
          violations.push(
            `${loc(p)} "${p.name}": line ${absLine} contains stray ` +
            `macro delimiters (<<< or >>>)`
          );
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── deferred-callback temp variable capture ─────────────────────

test.describe('deferred macro callbacks must capture temp vars', () => {

  /**
   * SugarCube's deferred macros — <<link>>, <<button>>, <<linkappend>>,
   * <<linkprepend>>, <<linkreplace>> — wikify their body contents at
   * *click* time, not at render time. Temp variables (`_foo`) referenced
   * inside the body are looked up in `State.temporary` at click time.
   *
   * Inside a <<widget>> body, `_args` and any temp vars set from `_args`
   * live in the surrounding passage's temp scope. When the widget is
   * called multiple times in one passage (e.g. <<ghostInfoCard "Phantom">>
   * … <<ghostInfoCard "Raiju">>), each invocation overwrites the previous
   * one's temp values — so by the time a deferred callback fires, every
   * one of those callbacks reads whatever the *last* invocation wrote.
   *
   * This is exactly how the WitchSale "Buy ghost info" flow broke:
   * clicking Buy on Phantom marked Raiju as discovered (last widget call
   * in WitchSale.tw) and re-charged the player without removing the card.
   *
   * The fix is to wrap deferred-callback blocks in <<capture>>, which
   * snapshots the listed temp vars into the link's payload closure.
   *
   * This test flags any widget body whose deferred-callback payload
   * references a temp variable that the widget itself sets, unless that
   * deferred macro is inside a <<capture>> block listing the variable.
   */

  const DEFERRED_MACROS = ['link', 'button', 'linkappend', 'linkprepend', 'linkreplace'];

  /** Find every <<widget "name">> … <</widget>> block in a passage body. */
  function findWidgets(body) {
    const widgets = [];
    const re = /<<widget\s+"([^"]+)"[^>]*>>([\s\S]*?)<<\/widget>>/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      widgets.push({ name: m[1], body: m[2], offset: m.index });
    }
    return widgets;
  }

  /** Temp vars assigned with <<set _name to/= …>> at any depth in the body. */
  function tempVarsAssigned(body) {
    const names = new Set();
    const re = /<<set\s+_([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let m;
    while ((m = re.exec(body)) !== null) names.add(m[1]);
    return names;
  }

  /** Find each <<capture _a, _b, …>> … <</capture>> block, return [{vars, start, end}]. */
  function findCaptureBlocks(body) {
    const blocks = [];
    const re = /<<capture\s+([^>]+)>>([\s\S]*?)<<\/capture>>/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const varList = new Set(
        [...m[1].matchAll(/_([A-Za-z_][A-Za-z0-9_]*)/g)].map(v => v[1])
      );
      blocks.push({ vars: varList, start: m.index, end: m.index + m[0].length });
    }
    return blocks;
  }

  /** Find each deferred-macro block in the body, return [{macro, payload, start}]. */
  function findDeferredBlocks(body) {
    const blocks = [];
    for (const macro of DEFERRED_MACROS) {
      // Bodyless self-closing forms (<<link "x" "Pass">><</link>>) are still matched
      // — the payload is just empty, so any inner-temp-var references are absent.
      const re = new RegExp(`<<${macro}\\b[^>]*>>([\\s\\S]*?)<</${macro}>>`, 'g');
      let m;
      while ((m = re.exec(body)) !== null) {
        blocks.push({ macro, payload: m[1], start: m.index });
      }
    }
    return blocks;
  }

  /** Temp-var refs inside a payload string. */
  function tempVarsRefd(text) {
    const names = new Set();
    // Match _foo not preceded by another identifier char.
    const re = /(?<![A-Za-z0-9_])_([A-Za-z_][A-Za-z0-9_]*)/g;
    let m;
    while ((m = re.exec(text)) !== null) names.add(m[1]);
    return names;
  }

  test('widget bodies must <<capture>> any temp vars used in deferred-macro callbacks', () => {
    // `_args*` are SugarCube widget intrinsics; flagging them would just
    // spam the same fix everywhere, and they'd typically be copied into
    // a named temp var first anyway (which IS what we check here).
    const INTRINSICS = new Set(['args', 'argsArray', 'argsString']);
    const violations = [];

    for (const p of allPassages) {
      if (!p.tags.includes('widget')) continue;
      for (const w of findWidgets(p.body)) {
        const assigned = tempVarsAssigned(w.body);
        if (assigned.size === 0) continue;
        const captures = findCaptureBlocks(w.body);
        for (const d of findDeferredBlocks(w.body)) {
          const refd = tempVarsRefd(d.payload);
          // Limit to vars the widget itself sets (i.e. closure-captured
          // by intent). Vars defined inside the same callback don't count.
          const localSets = tempVarsAssigned(d.payload);
          const risky = [...refd].filter(v =>
            assigned.has(v) && !localSets.has(v) && !INTRINSICS.has(v)
          );
          if (risky.length === 0) continue;

          // Is this deferred block enclosed by a <<capture>> that lists
          // every risky var?
          const enclosing = captures.find(c => d.start >= c.start && d.start < c.end);
          const captured = enclosing ? enclosing.vars : new Set();
          const missing = risky.filter(v => !captured.has(v));
          if (missing.length === 0) continue;

          // Compute approximate line number within the file.
          const before = p.body.slice(0, w.offset + d.start);
          const lineWithin = before.split('\n').length;
          const absLine = p.headerLine + lineWithin;
          violations.push(
            `${rel(p.file)}:${absLine} <<widget "${w.name}">> — <<${d.macro}>> ` +
            `payload references temp var(s) ${missing.map(v => '_' + v).join(', ')} ` +
            `set in the widget body. Wrap the deferred macro in ` +
            `<<capture ${missing.map(v => '_' + v).join(', ')}>> … <</capture>> — ` +
            `otherwise the callback fires after the widget exits and reads ` +
            `whatever the last widget invocation left in temp scope.`
          );
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── widget / passage temp-var leak ──────────────────────────────

test.describe('temp vars (`_foo`) must not leak across widget/passage boundaries', () => {

  /**
   * Temporary variables (`_foo`) live in `State.temporary`, which
   * SugarCube resets on every passage navigation but NOT between
   * widget invocations or `<<include>>` boundaries inside a single
   * passage. That makes them a subtle but real leak surface:
   *
   *   <<widget "cthulionAbility">>
   *     <<set _videoList to setup.Events.cthulionVideos(_args[0])>>
   *   <</widget>>
   *
   *   :: BrookHelp
   *     <<cthulionAbility 4>>
   *     <<video _videoList[random(0, _videoList.length - 1)]>>
   *
   * The widget's only purpose is to write `_videoList` into temp
   * scope so the caller can read it. That's an implicit handshake
   * that breaks the moment a second caller re-uses the widget under a
   * different name, or the widget gets renamed/inlined. Worse, every
   * other widget invocation in the same passage clobbers the temp
   * value, so the leak is order-dependent.
   *
   * The same anti-pattern shows up across `<<include>>` boundaries:
   * a child passage sets `_x` purely so the including passage can
   * branch on it (`<<if _x is false>>…<</if>>` after the include).
   *
   * Both cases should go through a controller method instead — a
   * named getter on `setup.X` makes the contract explicit, the
   * shared state survives passage transitions when it needs to, and
   * the linter below stays useful as a guard against regression.
   *
   * Rule: every `<<set _foo …>>` inside a widget body or passage
   * body must be matched by at least one *read* of `_foo` within the
   * same scope. If a temp var is only ever written, the only way it
   * gets used is via leakage — flag it.
   */

  // SugarCube widget intrinsics — always present in widget temp scope,
  // never something the widget body "sets" in the leaky sense.
  const TEMP_INTRINSICS = new Set(['args', 'argsArray', 'argsString']);

  /** Count `<<set _name …>>` assignments per name in `body`. */
  function tempVarSetCounts(body) {
    const counts = new Map();
    const re = /<<set\s+_([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const name = m[1];
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  }

  /** Count every `_name` token in `body` (incl. set-LHS occurrences). */
  function tempVarTotalCounts(body) {
    const counts = new Map();
    const re = /(?<![A-Za-z0-9_])_([A-Za-z_][A-Za-z0-9_]*)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const name = m[1];
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  }

  /** Approximate line number for the first `<<set _name>>` in `body`. */
  function lineOfFirstSet(body, name) {
    const idx = body.search(new RegExp(`<<set\\s+_${name}\\b`));
    if (idx < 0) return 1;
    return body.slice(0, idx).split('\n').length;
  }

  test('widget bodies must consume every temp var they set (or hand it to a sibling widget)', () => {
    const violations = [];
    for (const p of allPassages) {
      if (!p.tags.includes('widget')) continue;
      const widgets = [];
      const re = /<<widget\s+"([^"]+)"[^>]*>>([\s\S]*?)<<\/widget>>/g;
      let m;
      while ((m = re.exec(p.body)) !== null) {
        widgets.push({ name: m[1], body: m[2], offset: m.index });
      }
      // Container widgets routinely hand context to a sibling widget
      // they wikify via `_contents` (e.g. <<roomShell>> sets shared
      // context for <<roomFooter>>). That's a deliberate widget-level
      // contract within the same passage file, so a temp var set in
      // one widget body is allowed when another widget in the same
      // passage reads it. The cross-file leak (widget here, passage
      // elsewhere) is what we're catching.
      const totalsByPassage = tempVarTotalCounts(p.body);
      const setsByPassage = tempVarSetCounts(p.body);
      for (const w of widgets) {
        const sets = tempVarSetCounts(w.body);
        if (sets.size === 0) continue;
        const total = tempVarTotalCounts(w.body);
        for (const [name, setCount] of sets) {
          if (TEMP_INTRINSICS.has(name)) continue;
          // Widget body reads it itself? OK.
          if ((total.get(name) || 0) > setCount) continue;
          // Read by a sibling widget in the same passage file? Also OK
          // (deliberate parent→child container handshake). Compare the
          // file-wide total against file-wide set count: any extra
          // reference is a real read somewhere outside <<set …>>.
          if ((totalsByPassage.get(name) || 0) > (setsByPassage.get(name) || 0)) continue;
          const lineWithin = lineOfFirstSet(w.body, name);
          const before = p.body.slice(0, w.offset).split('\n').length;
          const absLine = p.headerLine + before + lineWithin - 1;
          violations.push(
            `${rel(p.file)}:${absLine} <<widget "${w.name}">> sets _${name} ` +
            `but never reads it — the value is only reachable via leakage ` +
            `into the caller's temp scope. Move the work into a controller ` +
            `method (e.g. setup.X.fooBar() returning the value) and have the ` +
            `caller use that instead, or have the widget consume the value itself.`
          );
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('passage bodies must consume every temp var they set (no <<include>> handshakes)', () => {
    const violations = [];
    for (const p of allPassages) {
      // Widget-defining passages are checked by the per-widget rule above.
      if (p.tags.includes('widget')) continue;
      // [script] / [stylesheet] passages contain JS / CSS, not Twee macros.
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      // Strip widget bodies from the passage — those have their own scope.
      const stripped = p.body.replace(
        /<<widget\s+"[^"]+"[^>]*>>[\s\S]*?<<\/widget>>/g,
        ''
      );
      const sets = tempVarSetCounts(stripped);
      if (sets.size === 0) continue;
      const total = tempVarTotalCounts(stripped);
      for (const [name, setCount] of sets) {
        if (TEMP_INTRINSICS.has(name)) continue;
        if ((total.get(name) || 0) > setCount) continue;
        const lineWithin = lineOfFirstSet(stripped, name);
        const absLine = p.headerLine + lineWithin;
        violations.push(
          `${rel(p.file)}:${absLine} passage "${p.name}" sets _${name} ` +
          `but never reads it — if the value is meant for an including passage ` +
          `or following <<widget>> call, route it through a controller method ` +
          `(setup.X.markFooBar() / setup.X.fooBar()) instead of leaking via ` +
          `temp scope.`
        );
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── @@ styled markup (SugarCube custom style markup) ────────────

test.describe('styled markup (@@...@@)', () => {

  /**
   * Blank out sources of `@@` that don't reach the SugarCube styled-markup
   * parser: `/* ... *\/` block comments and `<!-- ... -->` HTML comments
   * are removed during parsing, so any `@@` inside them is inert.
   * Content is replaced with same-length whitespace (newlines preserved)
   * so line numbers and offsets remain meaningful.
   * Quoted strings are NOT blanked because macros (linkappend, replace,
   * etc.) can re-emit their contents to the renderer, where `@@` inside
   * the emitted text is still parsed as styled markup.
   */
  function stripInertZones(body) {
    const blank = s => s.replace(/[^\n]/g, ' ');
    return body
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(/<!--[\s\S]*?-->/g, blank);
  }

  /**
   * Parse a passage body into a list of @@...@@ blocks by pairing
   * `@@` tokens left-to-right. Returns { blocks, unpaired } where
   * blocks is [{ start, end, inner, lineOfStart }] and unpaired is
   * true when the final `@@` has no match.
   */
  function parseAtBlocks(body) {
    const stripped = stripInertZones(body);
    const positions = [];
    const re = /@@/g;
    let m;
    while ((m = re.exec(stripped)) !== null) positions.push(m.index);

    const blocks = [];
    const pairs = Math.floor(positions.length / 2);
    for (let i = 0; i < pairs; i++) {
      const start = positions[i * 2];
      const end   = positions[i * 2 + 1];
      blocks.push({
        start,
        end,
        inner: body.slice(start + 2, end),
        lineOfStart: body.slice(0, start).split('\n').length,
      });
    }
    return { blocks, unpaired: positions.length % 2 !== 0 };
  }

  /** Collect every CSS class defined in a [stylesheet] passage. */
  function collectDefinedClasses() {
    const classes = new Set();
    const classRe = /\.([A-Za-z_][\w-]*)/g;
    for (const p of allPassages) {
      if (!p.tags.includes('stylesheet')) continue;
      let m;
      while ((m = classRe.exec(p.body)) !== null) classes.add(m[1]);
    }
    return classes;
  }

  const definedClasses = collectDefinedClasses();

  test('every passage has an even number of @@ markers (no unclosed styled blocks)', () => {
    const violations = [];
    for (const p of allPassages) {
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      const { unpaired } = parseAtBlocks(p.body);
      if (unpaired) {
        const count = (p.body.match(/@@/g) || []).length;
        violations.push(`${loc(p)} "${p.name}" has ${count} @@ markers (odd — at least one styled block is unclosed)`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('no stray run of exactly three @ characters (indicates a typo or missing/extra @)', () => {
    // Runs of 2 @s are a styled-markup marker and 4 @s is a valid
    // back-to-back close+open.  A lone `@` is valid Twee attribute
    // shorthand (e.g. `@src="..."`).  Exactly 3 in a row, however,
    // cannot be produced by any legitimate combination of those forms.
    const violations = [];
    const strayRe = /(?<!@)@@@(?!@)/g;
    for (const p of allPassages) {
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      const lines = stripInertZones(p.body).split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (strayRe.test(lines[i])) {
          const absLine = p.headerLine + 1 + i;
          violations.push(`${loc(p)} "${p.name}": line ${absLine} contains @@@ — check for a missing or extra @ around a styled block`);
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('@@ selector markup must have a valid identifier followed by a ; separator', () => {
    // When a @@...@@ block begins with `.` or `#`, SugarCube parses
    // everything before the first `;` as the style selector.  Missing
    // the `;` means the "class" is silently treated as content, so the
    // styling never applies — exactly the class of typo this guards.
    const violations = [];
    const selectorRe = /^([.#])([A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*)?/;
    for (const p of allPassages) {
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      const { blocks } = parseAtBlocks(p.body);
      for (const b of blocks) {
        if (!/^[.#]/.test(b.inner)) continue;
        const absLine = p.headerLine + b.lineOfStart;
        const snippet = b.inner.slice(0, 40).replace(/\n/g, ' ');

        const m = b.inner.match(selectorRe);
        if (!m || !m[2]) {
          violations.push(`${loc(p)} "${p.name}": line ${absLine} has empty/invalid @@${m ? m[1] : ''} selector near "@@${snippet}..."`);
          continue;
        }
        // Selector chain must be followed by `;`, `.`, or end-of-selector
        // char.  The character immediately after m[0] must be `;` (to
        // separate styles from content) or one of `;`, `:` (chained
        // CSS rule).  If there's no `;` anywhere in the inner, the
        // selector was swallowed into content.
        if (!b.inner.includes(';')) {
          violations.push(`${loc(p)} "${p.name}": line ${absLine} has @@${m[1]}${m[2]} without a ; separator — style is treated as content ("@@${snippet}...")`);
          continue;
        }
        const after = b.inner.charAt(m[0].length);
        if (after && !/[;:\s]/.test(after)) {
          violations.push(`${loc(p)} "${p.name}": line ${absLine} has malformed selector @@${m[1]}${m[2]}${after} — expected ; or : after identifier`);
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('every @@.className; references a class defined in the stylesheet', () => {
    // Catches typos like @@.mc-thoguhts; vs @@.mc-thoughts;.
    // Skipped if no stylesheet was parsed (e.g. running tests against
    // a partial tree) to avoid noisy false positives.
    if (definedClasses.size === 0) return;

    const violations = [];
    for (const p of allPassages) {
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      const { blocks } = parseAtBlocks(p.body);
      for (const b of blocks) {
        if (!b.inner.startsWith('.')) continue;
        // Grab the selector chain up to the first `;`.
        const semi = b.inner.indexOf(';');
        if (semi < 0) continue; // already flagged by the previous test
        const chain = b.inner.slice(0, semi);
        // A chain like ".foo.bar" may reference multiple classes.
        const names = chain.split('.').filter(Boolean);
        for (const name of names) {
          if (!/^[A-Za-z_][\w-]*$/.test(name)) continue; // not a plain ident, skip
          if (definedClasses.has(name)) continue;
          const absLine = p.headerLine + b.lineOfStart;
          const lower = name.toLowerCase();
          const hint = [...definedClasses].find(c => c.toLowerCase() === lower);
          const hintMsg = hint ? ` — did you mean ".${hint}"?` : '';
          violations.push(`${loc(p)} "${p.name}": line ${absLine} @@.${name}; references a class not defined in any [stylesheet] passage${hintMsg}`);
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── DOM-mutation selector targets ────────────────────────────────

test.describe('replace/append/prepend selector targets', () => {

  /**
   * Collect every id defined by a static `id="foo"` / `id='foo'` HTML
   * attribute anywhere in the project. Attributes whose value contains
   * interpolation markers (e.g. `id="foo<<= $x>>"`) are skipped — those
   * are computed at render time and can't be validated statically.
   *
   * Returns a Set<string> of case-sensitive id values.
   */
  function collectDefinedIds() {
    const ids = new Set();
    const attrRe = /\bid\s*=\s*(?:"([^"<>$`]*?)"|'([^'<>$`]*?)')/g;
    for (const p of allPassages) {
      let m;
      while ((m = attrRe.exec(p.body)) !== null) {
        const val = (m[1] ?? m[2]).trim();
        // Skip empty, whitespace-containing, or interpolation-marker values.
        if (val && !/\s/.test(val) && !/[+_`]/.test(val)) {
          ids.add(val);
        }
      }
    }
    return ids;
  }

  /**
   * Extract the leading id from a CSS selector string — the characters
   * after '#' up to the first space, '.', '#', '>', '[', ',' or ':'.
   * Returns null if the selector doesn't start with '#' or the id is
   * built from interpolation.
   */
  function extractLeadingId(selector) {
    if (!selector.startsWith('#')) return null;
    const id = selector.slice(1).split(/[\s.#>\[,:]/)[0];
    if (!id) return null;
    // Skip computed ids like "#' + meterId + '" (already excluded by the
    // outer static-only filter, but be defensive).
    if (/[+`$]/.test(id)) return null;
    return id;
  }

  /**
   * Find every static `<<replace|append|prepend "selector">>` call in
   * every passage. "Static" = the argument uses plain single or double
   * quotes with no $variable, _temp, backtick, or + concatenation.
   *
   * Returns [{ passage, line, macro, selector }].
   */
  function collectSelectorUsages() {
    const usages = [];
    // Matches <<replace "..."> / <<append '...'>> etc., only when the
    // argument is a single quoted literal with no interpolation inside.
    const macroRe = /<<(replace|append|prepend)\s+(?:"([^"$`+_<>]*)"|'([^'$`+_<>]*)')\s*>>/g;
    for (const p of allPassages) {
      if (p.tags.includes('script') || p.tags.includes('stylesheet')) continue;
      const lines = p.body.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m;
        macroRe.lastIndex = 0;
        while ((m = macroRe.exec(line)) !== null) {
          usages.push({
            passage: p,
            line: p.headerLine + 1 + i,
            macro: m[1],
            selector: (m[2] ?? m[3]).trim(),
          });
        }
      }
    }
    return usages;
  }

  const definedIds = collectDefinedIds();
  const usages = collectSelectorUsages();

  test('every <<replace/append/prepend "#id">> must reference an existing id (case-sensitive)', () => {
    const violations = [];
    for (const u of usages) {
      const id = extractLeadingId(u.selector);
      if (id === null) continue;
      if (definedIds.has(id)) continue;

      // Report with a case-insensitive hint so typical PascalCase vs.
      // camelCase mismatches (the class of bug that motivated this test)
      // are obvious at a glance.
      const lower = id.toLowerCase();
      const hint = [...definedIds].find(d => d.toLowerCase() === lower);
      const hintMsg = hint ? ` — did you mean "#${hint}"?` : '';
      violations.push(
        `${rel(u.passage.file)}:${u.line} <<${u.macro} "#${id}">> ` +
        `references an id that is not defined anywhere${hintMsg}`
      );
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});

// ── general file hygiene ─────────────────────────────────────────

test.describe('file hygiene', () => {

  test('every .tw file must contain at least one passage header', () => {
    const violations = [];
    for (const f of allFiles) {
      const passages = allPassages.filter(p => p.file === f);
      if (passages.length === 0) {
        violations.push(`${rel(f)} contains no passage headers`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('no triple-or-more consecutive blank lines in .tw files', () => {
    const violations = [];
    for (const f of allFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      const lines = content.split('\n');
      let streak = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '') {
          streak++;
          if (streak >= 3) {
            violations.push(`${rel(f)}:${i + 1} 3+ consecutive blank lines`);
            break; // report only the first occurrence per file
          }
        } else {
          streak = 0;
        }
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  test('.tw files must be valid UTF-8', () => {
    const violations = [];
    for (const f of allFiles) {
      try {
        const buf = fs.readFileSync(f);
        const text = buf.toString('utf-8');
        // Round-trip: re-encode and compare bytes to detect replacement characters
        if (Buffer.from(text, 'utf-8').compare(buf) !== 0) {
          violations.push(`${rel(f)} is not valid UTF-8`);
        }
      } catch {
        violations.push(`${rel(f)} could not be read`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

});
