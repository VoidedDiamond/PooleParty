'use strict';
// npm run import-wheel -- path/to/puzzles.csv
// Reads a CSV with a category column and a puzzle column (header names like "Category" and
// "Word to Guess" are detected) and writes content/wheel/puzzles.json.
const fs = require('fs');
const path = require('path');
const { isFamilyFriendly } = require('./family-filter');

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function convert(csvText) {
  const rows = parseCSV(csvText);
  const head = rows[0].map(h => h.trim().toLowerCase());
  const ci = head.findIndex(h => h.includes('category'));
  const pi = head.findIndex(h => h.includes('word') || h.includes('puzzle') || h.includes('phrase'));
  if (ci < 0 || pi < 0) throw new Error(`Could not find category and puzzle columns in header: ${rows[0].join(', ')}`);
  const seen = new Set();
  const puzzles = [];
  for (const r of rows.slice(1)) {
    const cat = (r[ci] || '').trim().toUpperCase();
    const text = (r[pi] || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!cat || !text || text.length > 52 || !/[A-Z]/.test(text)) continue;
    if (!isFamilyFriendly(cat, text) || seen.has(text)) continue;
    seen.add(text);
    puzzles.push({ cat, text });
  }
  return puzzles;
}

module.exports = { convert };
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: npm run import-wheel -- path/to/puzzles.csv'); process.exit(1); }
  const puzzles = convert(fs.readFileSync(file, 'utf8'));
  const out = path.join(__dirname, '..', 'content', 'wheel', 'puzzles.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ kind: 'wheel-puzzles', source: path.basename(file), puzzles }));
  console.log(`Wrote ${puzzles.length} puzzles to ${path.relative(process.cwd(), out)}`);
}
