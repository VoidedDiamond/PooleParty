// Entry point of the downloadable app (PooleParty.exe on Windows, Poole Party on a Mac) that
// tools/build-release.js builds: a Node.js single executable with the whole app, node_modules
// included, packed inside it. On first run, and after an update, the app is unpacked into a
// per-user folder; then the server starts from there exactly as `npm start` would, and the TV
// screen opens in the browser. Nobody has to install Node or run npm.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { createRequire } = require('module');
const sea = require('node:sea');

process.title = 'Poole Party';

const BUILD_ID = sea.getAsset('build-id', 'utf8');
const HOME = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Poole Party')
  : process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Poole Party')
    : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'poole-party');
const APP = path.join(HOME, 'app');
const STAMP = path.join(APP, '.build-id');     // which build is unpacked here
const MANIFEST = path.join(APP, '.files.json'); // the files that build put here

// A crash shouldn't just make the window vanish: say what happened and wait for Enter.
function fail(err) {
  console.error(`\nPoole Party stopped because of an error:\n${(err && err.stack) || err}`);
  if (!process.stdin.isTTY) process.exit(1);
  console.error('\nPress Enter to close this window.');
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(1));
}
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

function unpack() {
  let unpacked = null;
  try { unpacked = fs.readFileSync(STAMP, 'utf8'); } catch { /* first run */ }
  if (unpacked === BUILD_ID) return;
  console.log(unpacked ? 'Updating Poole Party...' : 'Setting up Poole Party (first run only)...');
  fs.rmSync(STAMP, { force: true }); // an unpack that gets interrupted is redone next time
  // Remove what the previous build shipped and nothing else, so settings and anything else
  // the app saved for itself survive an update.
  try {
    for (const f of JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))) fs.rmSync(path.join(APP, f), { force: true });
  } catch { /* nothing unpacked yet */ }

  // Layout, from build-release.js: 4-byte header length, JSON [{ path, size }], file bytes.
  const packed = zlib.gunzipSync(Buffer.from(sea.getAsset('app')));
  const headerEnd = 4 + packed.readUInt32BE(0);
  const files = JSON.parse(packed.subarray(4, headerEnd).toString('utf8'));
  let at = headerEnd;
  for (const { path: rel, size } of files) {
    const dest = path.join(APP, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, packed.subarray(at, at + size));
    at += size;
  }
  fs.mkdirSync(path.join(APP, 'data'), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(files.map(f => f.path)));
  fs.writeFileSync(STAMP, BUILD_ID);
}

// 'free', 'ours' (Poole Party is already running there) or 'taken' (something else is).
function checkPort(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/host', timeout: 3000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(res.statusCode === 200 && body.includes('Poole Party') ? 'ours' : 'taken'));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', e => resolve(e.code === 'ECONNREFUSED' ? 'free' : 'taken'));
  });
}

function openBrowser(url) {
  if (process.env.POOLE_PARTY_NO_BROWSER) return;
  let cmd = 'xdg-open', args = [url];
  if (process.platform === 'darwin') cmd = 'open';
  if (process.platform === 'win32') {
    // Edge when it's there (it is on nearly every Windows PC), as Poole Party.bat does: its
    // "Natural" voices are the only lifelike ones Windows has for the TV host's voice.
    const edge = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA]
      .filter(Boolean)
      .map(dir => path.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
      .find(f => fs.existsSync(f));
    cmd = edge || 'explorer.exe';
  }
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch { /* the address is printed below anyway */ }
}

async function main() {
  unpack();

  let port = Number(process.env.PORT) || 3000;
  for (let tries = 0; ; tries++, port++) {
    const status = await checkPort(port);
    if (status === 'free') break;
    if (status === 'ours') {
      console.log('Poole Party is already running in another window. Opening the TV screen again...');
      openBrowser(`http://localhost:${port}/host`);
      setTimeout(() => process.exit(0), 3000);
      return;
    }
    if (tries === 9) throw new Error(`Ports ${port - 9}-${port} are all in use by other programs.`);
  }

  process.env.PORT = String(port);
  process.chdir(APP);
  createRequire(path.join(APP, 'server.js'))('./server.js');

  const deadline = Date.now() + 60000;
  while (await checkPort(port) !== 'ours') {
    if (Date.now() > deadline) throw new Error(`The game server didn't start on port ${port}.`);
    await new Promise(r => setTimeout(r, 250));
  }
  const tv = `http://localhost:${port}/host`;
  openBrowser(tv);
  console.log('');
  console.log('  Poole Party is running!');
  console.log('');
  console.log(process.env.POOLE_PARTY_NO_BROWSER
    ? `  Open ${tv} in a browser on this computer and put it on the TV.`
    : '  The TV screen just opened in your browser. Put that window on the TV (F11 = full screen).');
  console.log('  Everyone joins by scanning its QR code with their phone, on the same Wi-Fi as this computer.');
  console.log('');
  console.log('  Leave this window open while you play. Close it to end the game.');
  console.log('');
}

main().catch(fail);
