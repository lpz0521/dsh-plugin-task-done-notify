// ==== app.js — inlined after core.js by scripts/build-client.mjs ====
const React = require("react");

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
    // 注意：不能带 tag —— Chromium 对同 tag 通知走"替换"语义，
    // 队列里已有同 tag 通知时新通知会被静默吞掉，不弹横幅。
    new Notification(title, { body });
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
