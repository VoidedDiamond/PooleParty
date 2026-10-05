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

// Dollars per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing
// (checked 2026-10-05). Thinking counts as output. Used only for the spending meter and the
// per-session budget; the real bill is in the Claude Console.
const PRICES = {
  'claude-opus-5-5': { input: 4, write: 5, read: 0.2, output: 20 },
  'claude-opus-5': { input: 5, write: 6.25, read: 0.5, output: 25 },
  'claude-sonnet-5-5': { input: 2, write: 2.5, read: 0.2, output: 10 },
  'claude-haiku-4-5': { input: 1, write: 1.25, read: 0.1, output: 5 },
  'claude-fable-5-1': { input: 10, write: 12.5, read: 0.25, output: 50 },
};
const priceFor = model => PRICES[Object.keys(PRICES).filter(k => String(model || '').startsWith(k)).sort((a, b) => b.length - a.length)[0]] || PRICES[MODEL];
const USAGE_FILE = 'ai-usage.json';

// Windows hides extensions, so a file renamed to "anthropic-api-key.txt" is often really
// "anthropic-api-key.txt.txt". Accept both.
const KEY_NAMES = [KEY_FILE, `${KEY_FILE}.txt`, KEY_FILE.replace(/\.txt$/, '')];

const state = { root: process.cwd(), client: null, lastError: null, pausedUntil: 0, keyWhere: null, keyHint: null };

// ---- spending ------------------------------------------------------------------------------
// "This session" is since the game was started. The month total is kept on disk.
const spend = { session: 0, requests: 0, byFeature: {}, month: null, budget: null };

function usagePath() { return path.join(state.root, 'data', USAGE_FILE); }
const monthKey = () => new Date().toISOString().slice(0, 7);
function loadUsage() {
  try { return JSON.parse(fs.readFileSync(usagePath(), 'utf8')); } catch { return {}; }
}
let saveTimer = null;
function saveUsage() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(usagePath()), { recursive: true });
      fs.writeFileSync(usagePath(), JSON.stringify(spend.month, null, 2));
    } catch (e) { console.warn(`Could not save ${USAGE_FILE}: ${e.message}`); }
  }, 1000);
}

function record(feature, res) {
  const u = (res && res.usage) || {};
  const p = priceFor(res && res.model);
  const cost = ((u.input_tokens || 0) * p.input + (u.cache_creation_input_tokens || 0) * p.write
    + (u.cache_read_input_tokens || 0) * p.read + (u.output_tokens || 0) * p.output) / 1e6;
  spend.session += cost;
  spend.requests += 1;
  const f = spend.byFeature[feature] || (spend.byFeature[feature] = { cost: 0, requests: 0 });
  f.cost += cost; f.requests += 1;
  if (!spend.month) spend.month = loadUsage();
  const m = spend.month[monthKey()] || (spend.month[monthKey()] = { cost: 0, requests: 0 });
  m.cost += cost; m.requests += 1;
  saveUsage();
  if (overBudget()) {
    state.lastError = `This session's AI budget ($${spend.budget.toFixed(2)}) is used up. Using the offline host and judge.`;
    console.warn(`Claude: ${state.lastError}`);
  }
}

const overBudget = () => spend.budget != null && spend.session >= spend.budget;
function setBudget(dollars) {
  spend.budget = Number.isFinite(dollars) && dollars > 0 ? dollars : null;
  if (!overBudget() && /AI budget/.test(state.lastError || '')) state.lastError = null;
}
function usage() {
  if (!spend.month) spend.month = loadUsage();
  const m = spend.month[monthKey()] || { cost: 0, requests: 0 };
  return { session: spend.session, requests: spend.requests, budget: spend.budget, month: m.cost, byFeature: spend.byFeature };
}

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
// Usable right now: a key, not paused after a bad key or a rate limit, and under budget.
const ready = () => !!state.client && Date.now() >= state.pausedUntil && !overBudget();

// opts: { system, prompt, wait (ms), schema (JSON schema for a structured reply, optional),
//         feature ('host' | 'judge' | 'quiz', for the spending meter) }
// Resolves to the reply text (JSON text when a schema is given), or null.
async function ask({ system, prompt, wait = 5000, schema = null, feature = 'other' }) {
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
    state.lastError = null;
    record(feature, res); // may set the over-budget message
    if (res.stop_reason === 'refusal') return null;
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
  MODEL, KEY_FILE, NO_KEY, init, load, hasKey, ready, ask, usage, setBudget,
  get lastError() { return state.lastError; },
  get keyWhere() { return state.keyWhere; },
  get keyHint() { return state.keyHint; },
  clearError() { state.lastError = null; },
};
