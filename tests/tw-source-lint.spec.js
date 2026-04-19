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

    for (let i = 0; i < lines.length; i++) {
      const raw   = lines[i];
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const indent  = leadingWS(raw);
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
