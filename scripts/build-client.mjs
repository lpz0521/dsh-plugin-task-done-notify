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
