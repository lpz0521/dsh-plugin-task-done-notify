import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  SETTINGS_KEY,
  normalizeSettings,
  loadSettings,
  saveSettings,
  diffSessions,
  shouldNotify,
} from "../lib/core.js";

test("DEFAULTS and SETTINGS_KEY are stable", () => {
  assert.deepEqual(DEFAULTS, {
    enabled: true,
    onlyWhenBackground: false,
    minDurationSec: 0,
    includeSubagents: false,
  });
  assert.equal(SETTINGS_KEY, "dsh-task-done-notify:settings");
});

test("normalizeSettings fills defaults and rejects bad values", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULTS);
  assert.deepEqual(normalizeSettings("junk"), DEFAULTS);
  assert.deepEqual(normalizeSettings({ enabled: false }), {
    ...DEFAULTS,
    enabled: false,
  });
  const bad = normalizeSettings({ minDurationSec: -5, onlyWhenBackground: "yes" });
  assert.equal(bad.minDurationSec, 0);
  assert.equal(bad.onlyWhenBackground, false);
  const ok = normalizeSettings({ minDurationSec: 12.9 });
  assert.equal(ok.minDurationSec, 12);
});

test("loadSettings tolerates empty and corrupt storage", () => {
  const empty = { getItem: () => null };
  assert.deepEqual(loadSettings(empty), DEFAULTS);
  const corrupt = { getItem: () => "{not json" };
  assert.deepEqual(loadSettings(corrupt), DEFAULTS);
});

test("saveSettings then loadSettings round-trips", () => {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  saveSettings(storage, { ...DEFAULTS, enabled: false, minDurationSec: 30 });
  assert.deepEqual(loadSettings(storage), { ...DEFAULTS, enabled: false, minDurationSec: 30 });
  assert.ok(store.has(SETTINGS_KEY));
});

test("diffSessions records starts and reports completed turns", () => {
  const starts = new Map();
  let t = 1000;
  const now = () => t;
  const idle = { a: { id: "a", displayTitle: "A", running: false } };
  const running = { a: { id: "a", displayTitle: "A", running: true } };

  assert.deepEqual(diffSessions(idle, idle, starts, now), []);
  assert.equal(starts.has("a"), false);

  assert.deepEqual(diffSessions(idle, running, starts, now), []);
  assert.equal(starts.get("a"), 1000);

  t = 60_000;
  const done = diffSessions(running, idle, starts, now);
  assert.equal(done.length, 1);
  assert.equal(done[0].id, "a");
  assert.equal(done[0].displayTitle, "A");
  assert.equal(done[0].startedAt, 1000);
  assert.equal(starts.has("a"), false);
});

test("diffSessions carries parentId and does not double-report", () => {
  const starts = new Map();
  const sub = { s: { id: "s", displayTitle: "S", running: true, parentId: "p" } };
  const subDone = { s: { id: "s", displayTitle: "S", running: false, parentId: "p" } };
  const first = diffSessions({}, sub, starts, () => 5);
  assert.deepEqual(first, []);
  const done = diffSessions(sub, subDone, starts, () => 6);
  assert.equal(done[0].parentId, "p");
  assert.deepEqual(diffSessions(subDone, subDone, starts, () => 7), []);
});

test("diffSessions forgets removed sessions", () => {
  const starts = new Map([["x", 10]]);
  const prev = { x: { id: "x", displayTitle: "X", running: true }, y: { id: "y", displayTitle: "Y", running: false } };
  const next = { y: { id: "y", displayTitle: "Y", running: false } };
  diffSessions(prev, next, starts, () => 11);
  assert.equal(starts.has("x"), false);
  assert.equal(starts.has("y"), false);
});

test("shouldNotify decision chain", () => {
  const base = { parentId: undefined, hasFocus: false, elapsedSec: 0 };
  assert.equal(shouldNotify(DEFAULTS, base), true);
  assert.equal(shouldNotify({ ...DEFAULTS, enabled: false }, base), false);
  // default: notify regardless of page focus
  assert.equal(shouldNotify(DEFAULTS, { ...base, hasFocus: true }), true);
  // the background-only toggle still works when enabled
  assert.equal(shouldNotify({ ...DEFAULTS, onlyWhenBackground: true }, { ...base, hasFocus: true }), false);
  assert.equal(shouldNotify({ ...DEFAULTS, onlyWhenBackground: false }, { ...base, hasFocus: true }), true);
  assert.equal(shouldNotify(DEFAULTS, { ...base, parentId: "p" }), false);
  assert.equal(shouldNotify({ ...DEFAULTS, includeSubagents: true }, { ...base, parentId: "p" }), true);
  assert.equal(shouldNotify({ ...DEFAULTS, minDurationSec: 60 }, { ...base, elapsedSec: 5 }), false);
  assert.equal(shouldNotify({ ...DEFAULTS, minDurationSec: 60 }, { ...base, elapsedSec: 61 }), true);
});
