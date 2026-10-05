'use strict';
// The one Claude client for the app, shared by the host voice and the answer judge.
// The API key stays on this laptop: ANTHROPIC_API_KEY, or the first line of
// anthropic-api-key.txt next to server.js. Phones never see it.
// ask() never throws: on any problem it returns null and records a short, readable reason in
// lastError (shown on the host's phone), and the caller falls back to its offline behavior.
const fs = require('fs');
const path = require('path');

const MODEL = 'claude-opus-5-5';
const KEY_FILE = 'anthropic-api-key.txt';

const state = { root: process.cwd(), client: null, lastError: null, pausedUntil: 0 };

function sdk() { return require('@anthropic-ai/sdk').default; }

function init(root) {
  state.root = root;
  return load();
}

// (Re)reads the key, so a fixed key file works without restarting.
function load() {
  state.pausedUntil = 0;
  let key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) {
    try { key = fs.readFileSync(path.join(state.root, KEY_FILE), 'utf8').split(/\r?\n/)[0].trim(); } catch { /* no file */ }
  }
  if (!key) { state.client = null; return false; }
  try {
    const Anthropic = sdk();
    state.client = new Anthropic({ apiKey: key, maxRetries: 0 });
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
    if (e instanceof Anthropic.AuthenticationError) { state.lastError = `The API key was rejected. Fix ${KEY_FILE}, then tap AI again.`; pause(Infinity); }
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

module.exports = {
  MODEL, KEY_FILE, init, load, hasKey, ready, ask,
  get lastError() { return state.lastError; },
  clearError() { state.lastError = null; },
};
