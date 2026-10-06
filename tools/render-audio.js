'use strict';
// Developer tool: pre-renders every song and sound effect defined in public/audio.js into MP3
// files in public/audio, plus manifest.json. The TV then just plays those files, which costs
// almost nothing, instead of synthesizing the music live (too much for older laptops: the music
// crackles and drops out).
//
// Run it after changing a theme or a sound effect in public/audio.js:
//   npm install --no-save playwright lamejs      (or have them installed globally)
//   node tools/render-audio.js                   (or: node tools/render-audio.js lobby feud)
//
// Songs are stored with a second of the loop copied before and after it (loopStart/loopEnd in
// the manifest mark the loop), so MP3 padding never lands inside the loop and it stays seamless.
// Anything louder than full scale is scaled down to fit, and the manifest's "gain" restores it.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'audio');
const RATE = 44100;
const MARGIN = 1.0;   // seconds
const KBPS = 128;
const HEADROOM = 0.95;

function load(mod) {
  try { return require(mod); } catch { /* try the global install */ }
  return require(path.join(execSync('npm root -g').toString().trim(), mod));
}

function lame() {
  let file;
  try { file = require.resolve('lamejs/lame.all.js'); } catch { file = path.join(execSync('npm root -g').toString().trim(), 'lamejs', 'lame.all.js'); }
  // The package's main entry has a known bug in Node; the bundled build works.
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${fs.readFileSync(file, 'utf8')};this.lamejs = lamejs;`, sandbox);
  return sandbox.lamejs;
}

const fromB64 = s => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };

function encode(lamejs, channels) {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
  const scale = peak > HEADROOM ? HEADROOM / peak : 1;
  const pcm = channels.map(ch => {
    const o = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) { const v = Math.max(-1, Math.min(1, ch[i] * scale)); o[i] = v < 0 ? v * 32768 : v * 32767; }
    return o;
  });
  const enc = new lamejs.Mp3Encoder(2, RATE, KBPS);
  const parts = [];
  const push = b => { if (b.length) parts.push(Buffer.from(b.buffer, b.byteOffset, b.length)); };
  for (let i = 0; i < pcm[0].length; i += 1152) push(enc.encodeBuffer(pcm[0].subarray(i, i + 1152), pcm[1].subarray(i, i + 1152)));
  push(enc.flush());
  return { mp3: Buffer.concat(parts), gain: +(1 / scale).toFixed(4) };
}

// One song: the loop with MARGIN seconds of itself on each side.
function withMargins(channels) {
  const m = Math.round(MARGIN * RATE);
  return channels.map(p => {
    const out = new Float32Array(p.length + 2 * m);
    out.set(p.subarray(p.length - m), 0);
    out.set(p, m);
    out.set(p.subarray(0, m), m + p.length);
    return out;
  });
}

// One effect: trimmed after its last audible sample.
function trimmed(channels) {
  let last = 0;
  for (const ch of channels) for (let i = ch.length - 1; i > last; i--) if (Math.abs(ch[i]) > 1e-4) { last = i; break; }
  const end = Math.min(channels[0].length, last + Math.round(0.05 * RATE));
  return channels.map(ch => ch.subarray(0, end));
}

(async () => {
  const only = process.argv.slice(2);
  const lamejs = lame();
  const { chromium } = load('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.setContent('<!doctype html><title>render</title>');
  await page.addScriptTag({ path: path.join(ROOT, 'public', 'audio.js') });

  const manifestFile = path.join(OUT, 'manifest.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { music: {}, sfx: {} };
  fs.mkdirSync(path.join(OUT, 'music'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'sfx'), { recursive: true });
  const list = await page.evaluate(() => Sound.exportList());

  for (const name of list.music) {
    if (only.length && !only.includes(name)) continue;
    const t0 = Date.now();
    const r = await page.evaluate(([n, rate]) => Sound.exportAudio('music', n, [], rate), [name, RATE]);
    const loop = r.channels.map(fromB64);
    const { mp3, gain } = encode(lamejs, withMargins(loop));
    const file = `music/${name}.mp3`;
    fs.writeFileSync(path.join(OUT, file), mp3);
    manifest.music[name] = { file, loopStart: MARGIN, loopEnd: MARGIN + loop[0].length / RATE, gain };
    console.log(`music ${name.padEnd(14)} ${(loop[0].length / RATE).toFixed(1)}s loop  ${(mp3.length / 1024).toFixed(0)} KB  gain ${gain}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  for (const [name, ...args] of list.sfx) {
    if (only.length && !only.includes(name)) continue;
    const r = await page.evaluate(([n, a, rate]) => Sound.exportAudio('sfx', n, a, rate), [name, args, RATE]);
    const { mp3, gain } = encode(lamejs, trimmed(r.channels.map(fromB64)));
    const file = `sfx/${[name, ...args].join('_')}.mp3`;
    fs.writeFileSync(path.join(OUT, file), mp3);
    manifest.sfx[r.key] = { file, gain };
  }
  console.log(`sfx: ${Object.keys(manifest.sfx).length} effects`);

  manifest.generated = new Date().toISOString();
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  await browser.close();
  const bytes = dir => fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  console.log(`total: music ${(bytes(path.join(OUT, 'music')) / 1048576).toFixed(1)} MB, sfx ${(bytes(path.join(OUT, 'sfx')) / 1024).toFixed(0)} KB`);
})().catch(e => { console.error(e); process.exit(1); });
