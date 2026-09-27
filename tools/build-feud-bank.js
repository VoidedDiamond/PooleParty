'use strict';
// Turns protoqa_train.jsonl (iesl/protoqa-data, CC-BY-4.0) into content/feud/bank.json
const fs = require('fs');
const path = require('path');
const { isFamilyFriendly } = require('./family-filter');
const { prep } = require('../games/match');

function sentenceCase(q) {
  let s = String(q || '').trim().replace(/\s+/g, ' ');
  s = s.replace(/\bi\b/g, 'I');
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.?!]$/.test(s)) s += '.';
  return s;
}

function build(rawFile, outFile) {
  const seen = new Set();
  const out = [];
  let total = 0;
  for (const line of fs.readFileSync(rawFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    total++;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const q = sentenceCase(d.question['normalized-question'] || d.question.question);
    const key = q.toLowerCase();
    if (seen.has(key)) continue;

    const sum = d['answer-clusters'].reduce((n, c) => n + c.count, 0);
    const denom = (d.metadata && d.metadata.totalcount) || sum;
    const answers = d['answer-clusters']
      .filter(c => c.answers && c.answers[0])
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(c => [String(c.answers[0]).trim().toLowerCase(), Math.max(1, Math.round((c.count * 100) / denom))]);

    if (answers.length < 4) continue;
    if (answers.some(([t]) => t.length > 28 || t.length < 2)) continue;
    const norm = answers.map(([t]) => prep(t).compact);
    if (new Set(norm).size !== norm.length) continue;
    if (!isFamilyFriendly(q, ...answers.map(a => a[0]))) continue;

    seen.add(key);
    out.push({ q, a: answers });
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ kind: 'feud-bank', source: 'iesl/protoqa-data (CC-BY-4.0)', questions: out }));
  return { read: total, kept: out.length, bytes: fs.statSync(outFile).size };
}

module.exports = { build };
if (require.main === module) {
  const [raw, out] = process.argv.slice(2);
  console.log(build(raw, out));
}
