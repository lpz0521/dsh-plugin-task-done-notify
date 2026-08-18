window.__ModuleLoader__.load({
	id: "dsh-plugin-task-done-notify",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * Pure core for the dsh-plugin-task-done-notify client bundle.
   * Zero imports, no browser globals — unit-testable in Node.
   */

  const SETTINGS_KEY = "dsh-task-done-notify:settings";

  const DEFAULTS = {
    enabled: true,
    onlyWhenBackground: false,
    minDurationSec: 0,
    includeSubagents: false,
  };

  /** Coerce an unknown parsed value into a valid settings object. */
  function normalizeSettings(raw) {
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
  function loadSettings(storage) {
    try {
      return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));
    } catch {
      return { ...DEFAULTS };
    }
  }

  /** Persist settings into a localStorage-like store. */
  function saveSettings(storage, settings) {
    storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
  }

  /**
   * Diff two session-list snapshots (records keyed by id) against a mutable
   * start-time map. Returns sessions whose `running` flipped true→false (turn
   * completed), each with the recorded startedAt (0 when unknown).
   */
  function diffSessions(prev, next, starts, now) {
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
   * Notification decision with a human-readable reason (for the debug log).
   * @param info - { parentId?, hasFocus, elapsedSec }
   * @returns { ok: boolean, reason: string | null }
   */
  function notifyDecision(settings, info) {
    if (!settings.enabled) return { ok: false, reason: "总开关已关闭" };
    if (info.parentId !== undefined && !settings.includeSubagents)
      return { ok: false, reason: "子代理会话（默认不通知）" };
    if (settings.onlyWhenBackground && info.hasFocus)
      return { ok: false, reason: "页面聚焦（已开启仅后台模式）" };
    if (info.elapsedSec < settings.minDurationSec)
      return { ok: false, reason: `耗时不足 ${Math.round(info.elapsedSec)}s < ${settings.minDurationSec}s` };
    return { ok: true, reason: null };
  }

  /**
   * Apply the notification decision chain.
   * @param info - { parentId?, hasFocus, elapsedSec }
   */
  function shouldNotify(settings, info) {
    return notifyDecision(settings, info).ok;
  }
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

  // ---- diagnostic log (visible in the settings card) ----
  const recent = [];
  const MAX_RECENT = 10;

  function logEvent(displayTitle, ok, reason) {
    recent.unshift({
      time: new Date().toLocaleTimeString(),
      displayTitle,
      ok,
      reason,
    });
    if (recent.length > MAX_RECENT) recent.pop();
    try {
      console.log(
        `[task-done-notify] 完成检测: ${displayTitle} → ${ok ? "通知" : "跳过 (" + reason + ")"}`
      );
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
    let prevById = list.getSnapshot().byId || {};
    return list.subscribe(() => {
      let next;
      try {
        next = list.getSnapshot();
      } catch {
        return;
      }
      const nextById = next.byId || {};
      const completed = diffSessions(prevById, nextById, starts, Date.now);
      prevById = nextById;
      const settings = loadSettings(localStorage);
      for (const item of completed) {
        const elapsedSec = item.startedAt ? (Date.now() - item.startedAt) / 1000 : 0;
        const decision = notifyDecision(settings, {
          parentId: item.parentId,
          hasFocus: typeof document !== "undefined" ? document.hasFocus() : true,
          elapsedSec,
        });
        logEvent(item.displayTitle, decision.ok, decision.reason);
        if (!decision.ok) continue;
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
      ),
      recent.length > 0
        ? React.createElement(
            "div",
            { style: { marginTop: 4 } },
            React.createElement(
              "div",
              { style: { fontWeight: 600, marginBottom: 4 } },
              "最近检测"
            ),
            React.createElement(
              "ul",
              { style: { margin: 0, paddingLeft: 16, fontSize: 12, opacity: 0.85 } },
              recent.map((e, i) =>
                React.createElement(
                  "li",
                  { key: i },
                  e.time + " " + e.displayTitle + " → " + (e.ok ? "✓ 已通知" : "✗ " + e.reason)
                )
              )
            )
          )
        : null
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
		return module.exports;
	}
});
