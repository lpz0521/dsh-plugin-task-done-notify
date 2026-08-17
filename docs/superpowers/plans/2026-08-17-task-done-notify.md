# dsh-plugin-task-done-notify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A DSH web-profile plugin that pops a browser system notification ("任务完成 ✓") whenever an agent turn completes, honoring background-only / min-duration / subagent settings, with a settings row in the DSH General settings page.

**Architecture:** Single npm package with a dual half. Host half (`lib/index.js`) is a no-op Cordis plugin whose sole purpose is to make the package a loader entry (client-modules discovers `dsh.client` bundles by scanning loader entry package names). Browser half (`lib/client.js`) is a hand-built `window.__ModuleLoader__.load(...)` bundle: pure logic lives in `lib/core.js` (unit-tested in Node), the app glue in `lib/app.js`, and `scripts/build-client.mjs` concatenates both into the bundle. Detection subscribes to `ctx.sessions.list` (uSES snapshot) and diffs `running` true→false transitions.

**Tech Stack:** Node >= 20 (`node --test`), ESM, hand-written `__ModuleLoader__` bundle format (no bundler), pnpm 10 for profile install, Cordis 4 client context.

## Global Constraints

- Plugin package name MUST be exactly `dsh-plugin-task-done-notify`.
- `dsh.bundle.patch` MUST point to `./cordis.patch.yml`; the patch inserts exactly ONE host row with `id: task-done-notify` and `name: 'dsh-plugin-task-done-notify'`.
- `dsh.client` MUST be `{ "inject": ["@deepseek-ai/dsh-client-runtime"], "platform": "web", "immediately": true }`; exports MUST include `"./client"` → `./lib/client.js`.
- Notification content is fixed: title `任务完成 ✓`, body `会话：{displayTitle}`. No reply summary.
- Settings keys (localStorage, key `dsh-task-done-notify:settings`): `enabled` (bool, default true), `onlyWhenBackground` (bool, default true), `minDurationSec` (number, default 0), `includeSubagents` (bool, default false).
- The plugin must not require a build step at install time: `lib/client.js` is checked in.
- Client inject list is exactly `["sessions", "slots"]`; settings slot key is `settings.general.item` with id `task-done-notify`.
- Repo root: `D:\.work\dsh\dsh-plugin-task-done-notify` (git repo already initialized on `main`).
- Do NOT restart the user's running `dsh web` on port 3080 during implementation; integration verification uses a second instance on port 3081, killed afterwards. Final activation is a user action (Task 5).

---

### Task 1: Package scaffold

**Files:**
- Create: `package.json`
- Create: `cordis.patch.yml`
- Create: `lib/index.js`
- Create: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a package that `dsh plugin --profile web add <path>` can link and that `dsh --profile web --dump-config` composes. Later tasks fill `lib/core.js`, `lib/app.js`, `lib/client.js`, `scripts/build-client.mjs`, `test/*`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "dsh-plugin-task-done-notify",
  "version": "0.1.0",
  "description": "DSH 任务完成通知：agent 每轮回复完成时自动弹出浏览器系统通知",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": [
    "lib/index.js",
    "lib/client.js",
    "cordis.patch.yml",
    "README.md",
    "docs"
  ],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime"
      ],
      "platform": "web",
      "immediately": true
    }
  },
  "scripts": {
    "build": "node scripts/build-client.mjs",
    "test": "node --test test/"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-runtime": ">=0.1.0-rc.6",
    "react": "^18.2.0"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create `cordis.patch.yml`**

```yaml
# dsh-plugin-task-done-notify bundle patch.
# One host row: a no-op Cordis plugin that makes this package a loader entry,
# which is what dsh-client-modules scans to discover the browser half
# (package.json dsh.client -> ./client bundle).

- insert:
    - id: task-done-notify
      name: 'dsh-plugin-task-done-notify'
```

- [ ] **Step 3: Create `lib/index.js`**

```js
/**
 * dsh-plugin-task-done-notify — host half.
 *
 * Intentionally empty. The loader row exists only so dsh-client-modules
 * discovers this package's `dsh.client` declaration (it scans loader-entry
 * package names) and serves lib/client.js to the browser. All behavior lives
 * in the browser half.
 */
export const inject = [];
export function apply() {}
export default { inject, apply };
```

- [ ] **Step 4: Create `README.md`**

````markdown
# dsh-plugin-task-done-notify

DSH 任务完成通知插件：当 agent 完成一轮回复（`running: true → false`）时，
用浏览器系统通知（Windows 右下角 toast）自动弹出"任务完成 ✓"。

- 仅在页面处于后台时通知（可关）
- 最短耗时门槛（秒），短问答不打扰
- 默认不通知子代理会话（可开）
- 设置：DSH 设置 → General → "任务完成通知"

## 安装

```bash
dsh plugin --profile web add D:\.work\dsh\dsh-plugin-task-done-notify
```

然后重启 `dsh web`，打开设置页点"发送测试通知"完成授权。

## 开发

```bash
pnpm test    # node --test：core 单测 + bundle 冒烟
pnpm build   # 重新生成 lib/client.js（core.js + app.js 拼接）
```

## 已知限制

浏览器通知要求 DSH 标签页处于打开状态（后台/最小化即可）；浏览器整体关闭时收不到。
````

- [ ] **Step 5: Verify scaffold**

Run: `node -e "import('./lib/index.js').then(m => console.log(JSON.stringify({inject: m.inject, apply: typeof m.apply})))"`
Expected: `{"inject":[],"apply":"function"}`

Run: `node -e "import('js-yaml').then(y => console.log(y.load(require('node:fs').readFileSync('cordis.patch.yml','utf8'))[0].insert[0].id))"`
Expected: `task-done-notify`

- [ ] **Step 6: Commit**

```bash
git add package.json cordis.patch.yml lib/index.js README.md
git commit -m "feat: scaffold task-done-notify plugin package"
```

---

### Task 2: Pure detection core (TDD)

**Files:**
- Create: `lib/core.js`
- Test: `test/core.test.mjs`

**Interfaces:**
- Consumes: nothing (pure ESM, zero imports, no browser globals).
- Produces (exact signatures used by Task 3's `lib/app.js`):
  - `export const SETTINGS_KEY` — `"dsh-task-done-notify:settings"`
  - `export const DEFAULTS` — `{ enabled: true, onlyWhenBackground: true, minDurationSec: 0, includeSubagents: false }`
  - `export function normalizeSettings(raw: unknown): Settings`
  - `export function loadSettings(storage: { getItem(k: string): string | null }): Settings`
  - `export function saveSettings(storage: { setItem(k: string, v: string): void }, settings: Settings): void`
  - `export function diffSessions(prev: Record<string, Summary>, next: Record<string, Summary>, starts: Map<string, number>, now: () => number): Array<{ id: string; displayTitle: string; parentId?: string; startedAt: number }>`
    - `Summary = { id: string; displayTitle?: string; running: boolean; parentId?: string }`
    - `starts` is mutated: records start times for `false→true`, deletes on completion/removal.
  - `export function shouldNotify(settings: Settings, info: { parentId?: string; hasFocus: boolean; elapsedSec: number }): boolean`

- [ ] **Step 1: Write the failing test `test/core.test.mjs`**

```js
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
    onlyWhenBackground: true,
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
  assert.equal(bad.onlyWhenBackground, true);
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
  assert.equal(shouldNotify(DEFAULTS, { ...base, hasFocus: true }), false);
  assert.equal(shouldNotify({ ...DEFAULTS, onlyWhenBackground: false }, { ...base, hasFocus: true }), true);
  assert.equal(shouldNotify(DEFAULTS, { ...base, parentId: "p" }), false);
  assert.equal(shouldNotify({ ...DEFAULTS, includeSubagents: true }, { ...base, parentId: "p" }), true);
  assert.equal(shouldNotify({ ...DEFAULTS, minDurationSec: 60 }, { ...base, elapsedSec: 5 }), false);
  assert.equal(shouldNotify({ ...DEFAULTS, minDurationSec: 60 }, { ...base, elapsedSec: 61 }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/core.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `../lib/core.js` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation `lib/core.js`**

```js
/**
 * Pure core for the dsh-plugin-task-done-notify client bundle.
 * Zero imports, no browser globals — unit-testable in Node.
 */

export const SETTINGS_KEY = "dsh-task-done-notify:settings";

export const DEFAULTS = {
  enabled: true,
  onlyWhenBackground: true,
  minDurationSec: 0,
  includeSubagents: false,
};

/** Coerce an unknown parsed value into a valid settings object. */
export function normalizeSettings(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : DEFAULTS.enabled,
    onlyWhenBackground:
      typeof o.onlyWhenBackground === "boolean"
        ? o.onlyWhenBackground
        : DEFAULTS.onlyWhenBackground,
    minDurationSec:
      typeof o.minDurationSec === "number" &&
      Number.isFinite(o.minDurationSec) &&
      o.minDurationSec >= 0
        ? Math.floor(o.minDurationSec)
        : DEFAULTS.minDurationSec,
    includeSubagents:
      typeof o.includeSubagents === "boolean"
        ? o.includeSubagents
        : DEFAULTS.includeSubagents,
  };
}

/** Read settings from a localStorage-like store. */
export function loadSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));
  } catch {
    return { ...DEFAULTS };
  }
}

/** Persist settings into a localStorage-like store. */
export function saveSettings(storage, settings) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
}

/**
 * Diff two session-list snapshots (records keyed by id) against a mutable
 * start-time map. Returns sessions whose `running` flipped true→false (turn
 * completed), each with the recorded startedAt (0 when unknown).
 */
export function diffSessions(prev, next, starts, now) {
  const completed = [];
  for (const id of Object.keys(next)) {
    const row = next[id];
    if (typeof row.id !== "string" || typeof row.running !== "boolean") continue;
    if (row.running) {
      if (!starts.has(id)) starts.set(id, now());
      continue;
    }
    if (prev[id] && prev[id].running === true) {
      completed.push({
        id,
        displayTitle: typeof row.displayTitle === "string" ? row.displayTitle : id,
        parentId: row.parentId,
        startedAt: starts.get(id) ?? 0,
      });
    }
    starts.delete(id);
  }
  for (const id of Object.keys(prev)) {
    if (!(id in next)) starts.delete(id);
  }
  return completed;
}

/**
 * Apply the notification decision chain.
 * @param info - { parentId?, hasFocus, elapsedSec }
 */
export function shouldNotify(settings, info) {
  if (!settings.enabled) return false;
  if (info.parentId !== undefined && !settings.includeSubagents) return false;
  if (settings.onlyWhenBackground && info.hasFocus) return false;
  if (info.elapsedSec < settings.minDurationSec) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/core.test.mjs`
Expected: `# pass` on all 8 tests, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add lib/core.js test/core.test.mjs
git commit -m "feat: pure detection core with unit tests"
```

---

### Task 3: Client bundle (build pipeline + app glue + smoke tests)

**Files:**
- Create: `scripts/build-client.mjs`
- Create: `lib/app.js`
- Create: `lib/client.js` (generated by the build script, checked in)
- Test: `test/bundle.test.mjs`

**Interfaces:**
- Consumes: `lib/core.js` exports from Task 2 (inlined into the bundle by the build script, `export ` keywords stripped).
- Produces: the browser bundle `lib/client.js` in `window.__ModuleLoader__.load({ id: "dsh-plugin-task-done-notify", factory })` format, with `module.exports = { inject: ["sessions", "slots"], apply(ctx) }`. `apply` registers a `ctx.sessions.list` subscription and a `settings.general.item` slot contribution, and returns a disposer.

- [ ] **Step 1: Write the failing bundle smoke test `test/bundle.test.mjs`**

```js
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
  assert.deepEqual(mod.inject, ["sessions", "slots"]);
  assert.equal(h.injected.key, "settings.general.item");
  const dispose = mod.apply(h.sandbox.ctx);
  assert.equal(typeof dispose, "function");
  h.fire(); // subscription active: no crash on first event
  dispose();
  assert.equal(h.listener === null ? null : typeof h.listener, "function"); // placeholder, replaced below
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
});

test("focused page does not notify when onlyWhenBackground is on", () => {
  const h = makeSandbox();
  const mod = loadBundle(h.sandbox);
  mod.apply(h.sandbox.ctx);
  h.setFocus(true);
  h.setSnapshot({ ids: ["a"], byId: { a: busy("a", "A") } });
  h.fire();
  h.setSnapshot({ ids: ["a"], byId: { a: idle("a", "A") } });
  h.fire();
  assert.equal(h.notifications.length, 0);
});

test("subagent completion is silent by default, notified when enabled", () => {
  const h = makeSandbox();
  const mod = loadBundle(h.sandbox);
  mod.apply(h.sandbox.ctx);
  h.setSnapshot({ ids: ["s"], byId: { s: busy("s", "S", "parent") } });
  h.fire();
  h.setSnapshot({ ids: ["s"], byId: { s: idle("s", "S") } });
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
  h2.setSnapshot({ ids: ["s"], byId: { s: idle("s", "S") } });
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
```

Note: the first test's `dispose()` assertion is sloppy — replace the placeholder line with a real one in Step 2 (the sandbox exposes `listener` only through the closure). Simplest correct assertion: after `dispose()`, firing again must not notify. See Step 4 note.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bundle.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` / ENOENT for `../lib/client.js` (bundle not built yet).

- [ ] **Step 3: Create `scripts/build-client.mjs`**

```js
/**
 * Build lib/client.js from lib/core.js (pure logic) + lib/app.js (glue).
 * Strips `export ` keywords from core so it can be inlined into the
 * __ModuleLoader__ factory body. Run: node scripts/build-client.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const indent = (text, spaces) =>
  text
    .split("\n")
    .map((line) => (line.trim() === "" ? line : " ".repeat(spaces) + line))
    .join("\n");

const core = readFileSync(join(root, "lib", "core.js"), "utf8")
  .replace(/^export /gm, "")
  .trim();
const app = readFileSync(join(root, "lib", "app.js"), "utf8").trim();

const bundle = `window.__ModuleLoader__.load({
\tid: "dsh-plugin-task-done-notify",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${indent(core, 2)}
${indent(app, 2)}
\t\treturn module.exports;
\t}
});
`;

writeFileSync(join(root, "lib", "client.js"), bundle);
console.log("built lib/client.js");
```

- [ ] **Step 4: Create `lib/app.js` (the rest of the factory body)**

```js
// ==== app.js — inlined after core.js by scripts/build-client.mjs ====
const React = require("react");

const TAG = "dsh-task-done-notify";

function permissionText() {
  if (typeof Notification === "undefined") return "当前环境不支持系统通知";
  if (Notification.permission === "granted") return "已授权";
  if (Notification.permission === "denied") return "权限被拒绝：请在浏览器站点设置中允许通知";
  return "未授权：点击「发送测试通知」授权";
}

function fireNotification(title, body) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: TAG });
  } catch {
    /* ignore */
  }
}

/**
 * Subscribe to the sessions list snapshot and diff running transitions.
 * Settings are re-read from localStorage on every event, so changes made in
 * the settings card take effect immediately.
 * @returns unsubscribe function.
 */
function observe(ctx, notify) {
  const list = ctx.sessions.list;
  const starts = new Map();
  let prev = list.getSnapshot();
  return list.subscribe(() => {
    let next;
    try {
      next = list.getSnapshot();
    } catch {
      return;
    }
    const completed = diffSessions(prev, next, starts, Date.now);
    prev = next;
    const settings = loadSettings(localStorage);
    for (const item of completed) {
      const elapsedSec = item.startedAt ? (Date.now() - item.startedAt) / 1000 : 0;
      if (
        !shouldNotify(settings, {
          parentId: item.parentId,
          hasFocus: typeof document !== "undefined" ? document.hasFocus() : true,
          elapsedSec,
        })
      ) {
        continue;
      }
      notify("任务完成 ✓", "会话：" + item.displayTitle);
    }
  });
}

// ---- settings card ----
const CARD_STYLE = {
  border: "1px solid var(--ui-border-color, rgba(128,128,128,.35))",
  borderRadius: 10,
  padding: "12px 16px",
  margin: "8px 0",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 13,
};
const ROW_STYLE = { display: "flex", alignItems: "center", gap: 8 };
const LABEL_STYLE = { flex: 1 };

function SettingsCard() {
  const [tick, setTick] = React.useState(0);
  const settings = React.useMemo(() => loadSettings(localStorage), [tick]);
  const update = (patch) => {
    saveSettings(localStorage, { ...settings, ...patch });
    setTick((n) => n + 1);
  };
  const [perm, setPerm] = React.useState(permissionText());
  const onTest = async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
    setPerm(permissionText());
    if (Notification.permission === "granted") {
      fireNotification("任务完成 ✓", "这是一条测试通知");
    }
  };
  const checkbox = (checked, onChange) =>
    React.createElement("input", { type: "checkbox", checked, onChange });
  const row = (label, control) =>
    React.createElement(
      "div",
      { style: ROW_STYLE },
      React.createElement("label", { style: LABEL_STYLE }, label),
      control
    );
  return React.createElement(
    "div",
    { style: CARD_STYLE },
    row(
      "总开关",
      checkbox(settings.enabled, (e) => update({ enabled: e.target.checked }))
    ),
    row(
      "仅在页面后台时通知",
      checkbox(settings.onlyWhenBackground, (e) =>
        update({ onlyWhenBackground: e.target.checked })
      )
    ),
    row(
      "包含子代理会话",
      checkbox(settings.includeSubagents, (e) =>
        update({ includeSubagents: e.target.checked })
      )
    ),
    row(
      "最短耗时（秒）",
      React.createElement("input", {
        type: "number",
        min: 0,
        value: settings.minDurationSec,
        onChange: (e) =>
          update({ minDurationSec: Math.max(0, Number(e.target.value) || 0) }),
      })
    ),
    row(
      "系统通知",
      React.createElement(
        "div",
        { style: ROW_STYLE },
        React.createElement("button", { onClick: onTest }, "发送测试通知"),
        React.createElement("span", null, perm)
      )
    )
  );
}

// ---- plugin entry ----
const inject = ["sessions", "slots"];

function apply(ctx) {
  const unsub = observe(ctx, fireNotification);
  let removeCard = () => {};
  if (ctx.slots) {
    removeCard = ctx.slots.inject("settings.general.item", () =>
      ctx.slots.register(
        {
          name: "settings.general.item",
          id: "task-done-notify",
          order: 500,
          label: "任务完成通知",
        },
        SettingsCard
      )
    );
  }
  return () => {
    unsub();
    removeCard();
  };
}

exports.inject = inject;
exports.apply = apply;
```

- [ ] **Step 5: Build the bundle and fix the first test's dispose assertion**

Run: `node scripts/build-client.mjs`
Expected: `built lib/client.js`

Then edit `test/bundle.test.mjs` — replace the placeholder `dispose()` assertion block:

```js
  h.fire(); // subscription active: no crash on first event
  dispose();
  h.setSnapshot({ ids: ["a"], byId: { a: busy("a", "A") } });
  h.fire();
  h.setSnapshot({ ids: ["a"], byId: { a: idle("a", "A") } });
  h.fire();
  assert.equal(h.notifications.length, 0, "disposed subscription must not notify");
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/`
Expected: core tests + all 6 bundle tests PASS, exit code 0.

Run: `node --check lib/client.js`
Expected: no output (syntax valid), exit code 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-client.mjs lib/app.js lib/client.js test/bundle.test.mjs
git commit -m "feat: client bundle with completion detection and settings row"
```

---

### Task 4: Install into the web profile and verify composition

**Files:**
- Modify: `C:\Users\33149\.dsh\profiles\web\package.json` (via `dsh plugin`, not by hand)
- Modify: `C:\Users\33149\.dsh\profiles\web\pnpm-lock.yaml` (via pnpm)
- No repo files changed in this task (the profile lives outside the repo).

**Interfaces:**
- Consumes: the Task 1 package at `D:\.work\dsh\dsh-plugin-task-done-notify`.
- Produces: `dsh-plugin-task-done-notify` appended to `dsh.profile.bundles` in the web profile manifest; the loader row `task-done-notify` composed into the tree.

- [ ] **Step 1: Install the plugin into the web profile**

Run (from any directory):
```bash
dsh plugin --profile web add D:\.work\dsh\dsh-plugin-task-done-notify
```
Expected: pnpm links the folder; `dsh: warning` absent for this package; exit code 0. Then confirm:
```bash
Get-Content C:\Users\33149\.dsh\profiles\web\package.json
```
Expected: `"dsh-plugin-task-done-notify": "link:..."` (or `file:...`) under `dependencies`, and `"dsh-plugin-task-done-notify"` appended to `dsh.profile.bundles`.

- [ ] **Step 2: Verify the row composes into the tree**

Run: `dsh --profile web --dump-config`
Expected: near the end of the dump, a block containing `- id: task-done-notify` with `name: 'dsh-plugin-task-done-notify'`.

- [ ] **Step 3: Verify the client bundle is served (second instance on port 3081)**

Run in background (managed job):
```bash
dsh --profile web --port 3081
```
Wait for the log line indicating it is listening. Then:

```powershell
$r = Invoke-WebRequest http://127.0.0.1:3081/ -UseBasicParsing
$r.Content -match 'dsh-plugin-task-done-notify'
```
Expected: `True` — the boot manifest (`window.__DSH_BOOT__`) carries our entry.

Extract and fetch the bundle URL:
```powershell
$boot = [regex]::Match($r.Content, 'window\.__DSH_BOOT__\s*=\s*(\{.*?\});\s*</script>', 'Singleline').Groups[1].Value
$url = [regex]::Match($boot, '"/plugins/[^"]*dsh-plugin-task-done-notify[^"]*"').Value.Trim('"')
$b = Invoke-WebRequest ("http://127.0.0.1:3081" + $url) -UseBasicParsing
$b.Content -match 'window\.__ModuleLoader__\.load'
```
Expected: `True` for both — the bundle is served and in the module graph.

Then kill the background job (job id from the managed job start).

- [ ] **Step 4: Commit**

The profile directory is outside this repo; there is nothing new to commit here. Skip (or amend README if a step revealed a doc gap — do not otherwise commit).

---

### Task 5: User-side activation and manual verification

**Files:**
- None (user action; the running `dsh web` on port 3080 must be restarted by the user at their convenience).

**Interfaces:**
- Consumes: the installed profile from Task 4.
- Produces: live plugin behavior in the GUI.

- [ ] **Step 1: Restart the web app (user action)**

The current GUI on port 3080 runs the pre-install composition; restart it when convenient:
```bash
# stop the running dsh web, then:
dsh web
```

- [ ] **Step 2: Authorize and test (user action)**

1. Open the DSH GUI → 设置 → General → 任务完成通知.
2. Click 发送测试通知 — the browser asks for notification permission; allow it. A system toast "任务完成 ✓ / 这是一条测试通知" should appear.
3. Switch to another tab/window, send a long task to the agent; on completion a toast "任务完成 ✓ / 会话：<title>" appears.
4. Boundary checks:
   - With the DSH tab focused, a completion produces no toast (background-only default).
   - Set 最短耗时 to 60 and send a quick question → no toast.
   - Subagent turns produce no toast by default; enable 包含子代理会话 to hear them.
   - Deny notification permission → no toasts, settings row shows the denial hint.

---

## Self-Review (run after writing)

1. **Spec coverage:** Goal ✓ (Task 3/5). Background-only + min-duration ✓ (Task 2 `shouldNotify`, Task 3 tests). Title+body fixed copy ✓ (Task 3 `fireNotification`). Settings page row ✓ (Task 3 slots inject, Task 5 manual). No reply summary ✓ (never implemented). Host row for discovery ✓ (Task 1). Install + dump-config + second-instance verify ✓ (Task 4). Not restarting the live GUI ✓ (Task 5 is user-side).
2. **Placeholder scan:** no TBD/TODO; every step has exact code/commands; the one intentionally-loose assertion was replaced in Task 3 Step 5.
3. **Type consistency:** `diffSessions(prev, next, starts, now)` / `shouldNotify(settings, info)` / `loadSettings(storage)` / `saveSettings(storage, settings)` are identical across Task 2 and Task 3. Bundle `inject`/`apply`/`module.exports` shape matches what Task 3's smoke test asserts and what the client runtime expects.
