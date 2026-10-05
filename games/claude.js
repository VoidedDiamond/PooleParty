'use strict';
// The one Claude client for the app, shared by the host voice and the answer judge.
// The API key stays on this laptop and is never sent to phones. It's read from (first found):
//   1. the ANTHROPIC_API_KEY environment variable
//   2. anthropic-api-key.txt on the Desktop (including a OneDrive Desktop)
//   3. anthropic-api-key.txt in the Poole Party folder
// Keeping it on the Desktop keeps it out of the game folder, so updates and GitHub never touch
// it, and everyone who runs their own copy of the game uses their own key the same way.
// ask() never throws: on any problem it returns null and records a short, readable reason in
// lastError (shown on the host's phone), and the caller falls back to its offline behavior.
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODEL = 'claude-opus-5-5';
const KEY_FILE = 'anthropic-api-key.txt';

// Windows hides extensions, so a file renamed to "anthropic-api-key.txt" is often really
// "anthropic-api-key.txt.txt". Accept both.
const KEY_NAMES = [KEY_FILE, `${KEY_FILE}.txt`, KEY_FILE.replace(/\.txt$/, '')];

const state = { root: process.cwd(), client: null, lastError: null, pausedUntil: 0, keyWhere: null, keyHint: null };

function desktops() {
  const home = os.homedir();
  const dirs = [path.join(home, 'Desktop')];
  for (const v of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) if (process.env[v]) dirs.push(path.join(process.env[v], 'Desktop'));
  dirs.push(path.join(home, 'OneDrive', 'Desktop'));
  return [...new Set(dirs)];
}

// -> { key, where } or null. Pulls the sk-ant-... key out of the file even if it was pasted
// with quotes, a label, or extra lines around it.
function findKey() {
  const env = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (env) return { key: env, where: 'the ANTHROPIC_API_KEY setting' };
  const places = [...desktops().map(dir => ({ dir, where: 'your Desktop' })), { dir: state.root, where: 'the Poole Party folder' }];
  for (const { dir, where } of places) {
    for (const name of KEY_NAMES) {
      let text;
      try { text = fs.readFileSync(path.join(dir, name), 'utf8'); } catch { continue; }
      const m = /sk-ant-[A-Za-z0-9_-]{10,}/.exec(text);
      const key = m ? m[0] : text.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim().replace(/^["']|["']$/g, '')).find(Boolean);
      if (key) return { key, where };
    }
  }
  return null;
}

function sdk() { return require('@anthropic-ai/sdk').default; }

function init(root) {
  state.root = root;
  return load();
}

// (Re)reads the key, so a fixed key file works without restarting.
function load() {
  state.pausedUntil = 0;
  const found = findKey();
  state.keyWhere = found ? found.where : null;
  state.keyHint = found ? `…${found.key.slice(-4)}` : null; // for the terminal only, never the full key
  if (!found) { state.client = null; return false; }
  try {
    const Anthropic = sdk();
    state.client = new Anthropic({ apiKey: found.key, maxRetries: 0 });
    state.lastError = null;
    return true;
  } catch (e) {
    state.client = null;
    state.lastError = `Could not load the Claude SDK (${e.message}). Run the Update shortcut.`;
    return false;
  }
}

const hasKey = () => !!state.client;
// Usable right now: a key, and not paused after a bad key or a rate limit.
const ready = () => !!state.client && Date.now() >= state.pausedUntil;

// opts: { system, prompt, wait (ms), schema (JSON schema for a structured reply, optional) }
// Resolves to the reply text (JSON text when a schema is given), or null.
async function ask({ system, prompt, wait = 5000, schema = null }) {
  if (!ready()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), wait);
  try {
    const res = await state.client.beta.messages.create({
      model: MODEL,
      max_tokens: 2048,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: schema ? { effort: 'low', format: { type: 'json_schema', schema } } : { effort: 'low' },
      system,
      messages: [{ role: 'user', content: prompt }],
    }, { signal: ctrl.signal, timeout: wait });
    if (res.stop_reason === 'refusal') return null;
    state.lastError = null;
    return res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim() || null;
  } catch (e) {
    const Anthropic = sdk();
    const pause = ms => { state.pausedUntil = Date.now() + ms; };
    if (e instanceof Anthropic.AuthenticationError) { state.lastError = `The API key was rejected. Check ${KEY_FILE} on your Desktop, then tap AI again.`; pause(Infinity); }
    else if (e instanceof Anthropic.PermissionDeniedError) { state.lastError = 'This API key is not allowed to use the model. Using the offline host and judge.'; pause(Infinity); }
    else if (e instanceof Anthropic.RateLimitError) { state.lastError = 'Rate limited (or out of API credit). Offline for a minute.'; pause(60000); }
    else if (e instanceof Anthropic.APIUserAbortError || ctrl.signal.aborted) { /* just slow this time */ }
    else if (e instanceof Anthropic.APIConnectionError) state.lastError = 'No internet connection to Claude. Using the offline host and judge.';
    else if (e instanceof Anthropic.APIError) state.lastError = `Claude error ${e.status}: ${String(e.message).slice(0, 120)}`;
    else state.lastError = String(e.message || e).slice(0, 140);
    if (state.lastError) console.warn(`Claude: ${state.lastError}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const NO_KEY = `No API key found. Save it as ${KEY_FILE} on your Desktop, then tap again.`;

module.exports = {
  MODEL, KEY_FILE, NO_KEY, init, load, hasKey, ready, ask,
  get lastError() { return state.lastError; },
  get keyWhere() { return state.keyWhere; },
  get keyHint() { return state.keyHint; },
  clearError() { state.lastError = null; },
};
