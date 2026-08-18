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
