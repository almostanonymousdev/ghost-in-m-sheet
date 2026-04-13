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
