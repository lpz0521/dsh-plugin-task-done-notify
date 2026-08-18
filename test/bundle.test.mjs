import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const BUNDLE_PATH = new URL("../lib/client.js", import.meta.url);

function makeSandbox() {
  const notifications = [];
  const store = new Map();
  let focus = false;
  let listener = null;
  let snapshot = { ids: [], byId: {} };
  let injected = null;
  const sandbox = {
    console,
    Object,
    Symbol,
    Date,
    JSON,
    Math,
    Notification: class {
      static permission = "granted";
      static requestPermission = async () => "granted";
      constructor(title, options) {
        notifications.push({ title, options });
      }
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    document: { hasFocus: () => focus },
    window: {
      __ModuleLoader__: {
        load: (entry) => {
          sandbox.entry = entry;
        },
      },
    },
    ctx: {
      sessions: {
        list: {
          getSnapshot: () => snapshot,
          subscribe: (fn) => {
            listener = fn;
            return () => {
              listener = null;
            };
          },
        },
      },
      slots: {
        inject: (key, cb) => {
          injected = { key, cb };
          return () => {
            injected = null;
          };
        },
      },
    },
  };
  return {
    sandbox,
    setSnapshot(next) { snapshot = next; },
    fire() { if (listener) listener(); },
    notifications,
    setFocus(v) { focus = v; },
    get injected() { return injected; },
  };
}

function loadBundle(sandbox) {
  const code = readFileSync(BUNDLE_PATH, "utf8");
  vm.runInNewContext(code, sandbox);
  assert.ok(sandbox.entry, "bundle must call window.__ModuleLoader__.load");
  assert.equal(sandbox.entry.id, "dsh-plugin-task-done-notify");
  const mod = sandbox.entry.factory((id) => {
    if (id === "react") {
      return {
        useState: (init) => [typeof init === "function" ? init() : init, () => {}],
        useMemo: (fn) => fn(),
        useEffect: () => {},
      };
    }
    throw new Error("unexpected require: " + id);
  });
  return mod;
}

const idle = (id, displayTitle) => ({ id, displayTitle, running: false });
const busy = (id, displayTitle, parentId) => ({ id, displayTitle, running: true, parentId });

test("bundle loads, registers settings row, and disposes cleanly", () => {
  const h = makeSandbox();
  const mod = loadBundle(h.sandbox);
  assert.deepEqual([...mod.inject], ["sessions", "slots"]);
  const dispose = mod.apply(h.sandbox.ctx);
  assert.equal(typeof dispose, "function");
  assert.equal(h.injected.key, "settings.general.item");
  h.fire(); // subscription active: no crash on first event
  dispose();
  h.setSnapshot({ ids: ["a"], byId: { a: busy("a", "A") } });
  h.fire();
  h.setSnapshot({ ids: ["a"], byId: { a: idle("a", "A") } });
  h.fire();
  assert.equal(h.notifications.length, 0, "disposed subscription must not notify");
});

test("turn completion in background fires one notification", () => {
  const h = makeSandbox();
  const mod = loadBundle(h.sandbox);
  mod.apply(h.sandbox.ctx);
  h.setSnapshot({ ids: ["a"], byId: { a: busy("a", "会话A") } });
  h.fire();
  assert.equal(h.notifications.length, 0, "start must not notify");
  h.setSnapshot({ ids: ["a"], byId: { a: idle("a", "会话A") } });
  h.fire();
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].title, "任务完成 ✓");
  assert.equal(h.notifications[0].options.body, "会话：会话A");
  // 回归锁：不能带 tag —— Chromium 同 tag 通知会被静默吞掉、不弹横幅
  assert.equal("tag" in h.notifications[0].options, false);
});

test("focused page does not notify when onlyWhenBackground is on", () => {
  const h = makeSandbox();
  h.sandbox.localStorage.setItem(
    "dsh-task-done-notify:settings",
    JSON.stringify({ onlyWhenBackground: true })
  );
  const mod = loadBundle(h.sandbox);
  mod.apply(h.sandbox.ctx);
  h.setFocus(true);
  h.setSnapshot({ ids: ["a"], byId: { a: busy("a", "A") } });
  h.fire();
  h.setSnapshot({ ids: ["a"], byId: { a: idle("a", "A") } });
  h.fire();
  assert.equal(h.notifications.length, 0);
});

test("notifies even when the page is focused (default)", () => {
  const h = makeSandbox();
  const mod = loadBundle(h.sandbox);
  mod.apply(h.sandbox.ctx);
  h.setFocus(true);
  h.setSnapshot({ ids: ["a"], byId: { a: busy("a", "A") } });
  h.fire();
  h.setSnapshot({ ids: ["a"], byId: { a: idle("a", "A") } });
  h.fire();
  assert.equal(h.notifications.length, 1);
});

test("subagent completion is silent by default, notified when enabled", () => {
  const h = makeSandbox();
  const mod = loadBundle(h.sandbox);
  mod.apply(h.sandbox.ctx);
  h.setSnapshot({ ids: ["s"], byId: { s: busy("s", "S", "parent") } });
  h.fire();
  // parentId is a stable summary field, present in every snapshot
  h.setSnapshot({ ids: ["s"], byId: { s: { id: "s", displayTitle: "S", running: false, parentId: "parent" } } });
  h.fire();
  assert.equal(h.notifications.length, 0);

  const h2 = makeSandbox();
  h2.sandbox.localStorage.setItem(
    "dsh-task-done-notify:settings",
    JSON.stringify({ includeSubagents: true })
  );
  const mod2 = loadBundle(h2.sandbox);
  mod2.apply(h2.sandbox.ctx);
  h2.setSnapshot({ ids: ["s"], byId: { s: busy("s", "S", "parent") } });
  h2.fire();
  h2.setSnapshot({ ids: ["s"], byId: { s: { id: "s", displayTitle: "S", running: false, parentId: "parent" } } });
  h2.fire();
  assert.equal(h2.notifications.length, 1);
});

test("min-duration threshold blocks fast turns and disabled switch blocks all", () => {
  const h = makeSandbox();
  h.sandbox.localStorage.setItem(
    "dsh-task-done-notify:settings",
    JSON.stringify({ minDurationSec: 60 })
  );
  const mod = loadBundle(h.sandbox);
  mod.apply(h.sandbox.ctx);
  h.setSnapshot({ ids: ["a"], byId: { a: busy("a", "A") } });
  h.fire();
  h.setSnapshot({ ids: ["a"], byId: { a: idle("a", "A") } });
  h.fire(); // elapsed < 1s < 60s
  assert.equal(h.notifications.length, 0);

  const h2 = makeSandbox();
  h2.sandbox.localStorage.setItem(
    "dsh-task-done-notify:settings",
    JSON.stringify({ enabled: false })
  );
  const mod2 = loadBundle(h2.sandbox);
  mod2.apply(h2.sandbox.ctx);
  h2.setSnapshot({ ids: ["a"], byId: { a: busy("a", "A") } });
  h2.fire();
  h2.setSnapshot({ ids: ["a"], byId: { a: idle("a", "A") } });
  h2.fire();
  assert.equal(h2.notifications.length, 0);
});

test("notification suppressed when permission is denied", () => {
  const h = makeSandbox();
  h.sandbox.Notification.permission = "denied";
  const mod = loadBundle(h.sandbox);
  mod.apply(h.sandbox.ctx);
  h.setSnapshot({ ids: ["a"], byId: { a: busy("a", "A") } });
  h.fire();
  h.setSnapshot({ ids: ["a"], byId: { a: idle("a", "A") } });
  h.fire();
  assert.equal(h.notifications.length, 0);
});
