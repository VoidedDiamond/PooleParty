// Builds the no-install download: one file that runs Poole Party for people who don't want
// to deal with Node or npm.
//   Windows: dist/PooleParty.exe        macOS and Linux: dist/PooleParty
// It's a Node.js single executable application
// (https://nodejs.org/api/single-executable-applications.html): a copy of the Node binary
// running this script, with tools/launcher.js as its program and the app (server.js, games/,
// public/, content/, data/ and production node_modules) packed inside. It builds for the
// platform it runs on; .github/workflows/downloads.yml runs it on Windows and on a Mac.
// Afterwards it starts the result once to check that it works.
//
//   node tools/build-release.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync, execSync, spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const DIST = path.join(ROOT, 'dist');
// What the app needs at runtime. Everything else in the repo (tools, raw datasets, docs)
// stays out. Only files tracked by git go in, so local keys and settings never ship.
const SHIP = ['server.js', 'package.json', 'package-lock.json', 'games/', 'public/', 'content/', 'data/'];
const SKIP = ['data/raw/'];
// Build-time helpers, pinned. resedit's pe-library dependency is pinned too.
const TOOLS = { postject: '1.0.0-alpha.6', resedit: '3.1.0', 'pe-library': '2.0.1' };
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });

function stage(dir) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(f => f && SHIP.some(s => (s.endsWith('/') ? f.startsWith(s) : f === s)) && !SKIP.some(s => f.startsWith(s)))
    .filter(f => fs.existsSync(path.join(ROOT, f)));
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  run('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', { cwd: dir });
}

// Every regular file under dir as a forward-slash relative path, minus node_modules/.bin
// (command-line shims, and symlinks on Mac/Linux, which the server never uses).
function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory() && p !== 'node_modules/.bin') out.push(...walk(dir, p));
    else if (e.isFile()) out.push(p);
  }
  return out.sort();
}

// The layout tools/launcher.js unpacks: 4-byte header length, JSON [{ path, size }], file bytes.
function pack(dir) {
  const files = walk(dir).map(p => ({ path: p, data: fs.readFileSync(path.join(dir, p)) }));
  const header = Buffer.from(JSON.stringify(files.map(f => ({ path: f.path, size: f.data.length }))));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  return { count: files.length, packed: zlib.gzipSync(Buffer.concat([len, header, ...files.map(f => f.data)]), { level: 9 }) };
}

// Gives the exe Poole Party's icon and name, which the firewall prompt and Task Manager show
// instead of "Node.js JavaScript Runtime". Also drops Node's signature, which the injection
// has already broken.
async function brandWindowsExe(exe, tools) {
  const { NtExecutable, NtExecutableResource, Data, Resource } =
    await import(pathToFileURL(path.join(tools, 'node_modules', 'resedit', 'dist', 'index.js')).href);
  const bin = NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = NtExecutableResource.from(bin);
  const icons = Data.IconFile.from(fs.readFileSync(path.join(ROOT, 'Poole Party.ico'))).icons.map(i => i.data);
  for (const group of Resource.IconGroupEntry.fromEntries(res.entries)) {
    Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icons);
  }
  const [info] = Resource.VersionInfo.fromEntries(res.entries);
  for (const lang of info.getAllLanguagesForStringValues()) {
    info.removeStringValue(lang, 'CompanyName');
    info.setStringValues(lang, {
      FileDescription: 'Poole Party',
      ProductName: 'Poole Party',
      InternalName: 'PooleParty',
      OriginalFilename: 'PooleParty.exe',
    });
  }
  const [major, minor, micro] = pkg.version.split('.').map(n => parseInt(n, 10) || 0);
  info.setFileVersion(major, minor, micro, 0);
  info.setProductVersion(major, minor, micro, 0);
  info.outputToResourceEntries(res.entries);
  res.outputResource(bin);
  fs.writeFileSync(exe, Buffer.from(bin.generate()));
}

// Starts the built app the way a double-click would (with a throwaway home folder and a
// spare port), checks the TV page and socket.io load, then checks a second launch notices it.
async function check(exe) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'poole-party-check-'));
  const port = 39517;
  const env = { ...process.env, POOLE_PARTY_NO_BROWSER: '1', PORT: String(port), LOCALAPPDATA: home, HOME: home, XDG_DATA_HOME: home };
  const get = p => new Promise(resolve => {
    http.get({ host: '127.0.0.1', port, path: p }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', () => resolve(null));
  });
  const launch = () => {
    const child = spawn(exe, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.output = '';
    child.stdout.on('data', d => { child.output += d; });
    child.stderr.on('data', d => { child.output += d; });
    child.exited = new Promise(resolve => child.on('exit', resolve));
    return child;
  };
  const within = (ms, promise) => Promise.race([promise, new Promise(r => setTimeout(() => r('timeout'), ms))]);

  const first = launch();
  let problem = null;
  try {
    let tv = null;
    for (const until = Date.now() + 90000; Date.now() < until && !(tv && tv.status === 200);) {
      if (await within(500, first.exited) !== 'timeout') break;
      tv = await get('/host');
    }
    const client = await get('/socket.io/socket.io.js');
    if (!tv || tv.status !== 200 || !tv.body.includes('Poole Party')) problem = 'the TV page never came up';
    else if (!client || client.status !== 200) problem = 'socket.io client did not load';
    else {
      const second = launch();
      const code = await within(20000, second.exited);
      if (code !== 0 || !second.output.includes('already running')) {
        second.kill();
        problem = `a second launch didn't notice the first one (exit ${code}):\n${second.output}`;
      }
    }
  } finally {
    first.kill();
    await within(10000, first.exited);
    try { fs.rmSync(home, { recursive: true, force: true, maxRetries: 5 }); } catch { /* still in use */ }
  }
  if (problem) throw new Error(`Check failed: ${problem}\n--- app output ---\n${first.output}`);
  console.log('Check passed: it starts, serves the TV page, and a second launch reuses the first.');
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 12)) throw new Error('Building needs Node 20.12 or newer.');

  fs.rmSync(BUILD, { recursive: true, force: true, maxRetries: 5 });
  fs.mkdirSync(path.join(BUILD, 'app'), { recursive: true });
  fs.mkdirSync(DIST, { recursive: true });

  console.log('Staging the app...');
  stage(path.join(BUILD, 'app'));
  const { count, packed } = pack(path.join(BUILD, 'app'));
  const buildId = `${pkg.version}-${crypto.createHash('sha256').update(packed).digest('hex').slice(0, 12)}`;
  console.log(`Packed ${count} files (${(packed.length / 1e6).toFixed(1)} MB), build ${buildId}`);
  fs.writeFileSync(path.join(BUILD, 'app.gz'), packed);
  fs.writeFileSync(path.join(BUILD, 'build-id.txt'), buildId);
  fs.copyFileSync(path.join(__dirname, 'launcher.js'), path.join(BUILD, 'launcher.js'));
  fs.writeFileSync(path.join(BUILD, 'sea-config.json'), JSON.stringify({
    main: path.join(BUILD, 'launcher.js'),
    output: path.join(BUILD, 'sea.blob'),
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets: { app: path.join(BUILD, 'app.gz'), 'build-id': path.join(BUILD, 'build-id.txt') },
  }));
  execFileSync(process.execPath, ['--experimental-sea-config', path.join(BUILD, 'sea-config.json')], { stdio: 'inherit' });

  const tools = path.join(BUILD, 'tools');
  const want = Object.keys(TOOLS).filter(t => WIN || t === 'postject');
  run(`npm install --prefix "${tools}" --no-save --ignore-scripts --no-audit --no-fund ${want.map(t => `${t}@${TOOLS[t]}`).join(' ')}`);
  const { inject } = require(path.join(tools, 'node_modules', 'postject'));

  const exe = path.join(DIST, WIN ? 'PooleParty.exe' : 'PooleParty');
  fs.rmSync(exe, { force: true });
  fs.copyFileSync(process.execPath, exe);
  fs.chmodSync(exe, 0o755);
  if (MAC) execFileSync('codesign', ['--remove-signature', exe], { stdio: 'inherit' });
  await inject(exe, 'NODE_SEA_BLOB', fs.readFileSync(path.join(BUILD, 'sea.blob')), {
    sentinelFuse: SEA_FUSE,
    ...(MAC ? { machoSegmentName: 'NODE_SEA' } : {}),
  });
  // After injecting, not before: resedit then only rewrites the resource section, which
  // postject has already moved to the end of the file.
  if (WIN) await brandWindowsExe(exe, tools);
  if (MAC) execFileSync('codesign', ['--sign', '-', exe], { stdio: 'inherit' });
  console.log(`Built ${path.relative(ROOT, exe)} (${(fs.statSync(exe).size / 1e6).toFixed(0)} MB)`);

  await check(exe);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
