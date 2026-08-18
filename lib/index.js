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
