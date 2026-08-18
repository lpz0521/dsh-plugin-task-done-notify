/**
 * Pure core for the dsh-plugin-task-done-notify client bundle.
 * Zero imports, no browser globals — unit-testable in Node.
 */

export const SETTINGS_KEY = "dsh-task-done-notify:settings";

export const DEFAULTS = {
  enabled: true,
  onlyWhenBackground: false,
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
 * Notification decision with a human-readable reason (for the debug log).
 * @param info - { parentId?, hasFocus, elapsedSec }
 * @returns { ok: boolean, reason: string | null }
 */
export function notifyDecision(settings, info) {
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
export function shouldNotify(settings, info) {
  return notifyDecision(settings, info).ok;
}
