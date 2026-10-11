// Cross-platform `npm test`: finds tests/**/*.test.ts and runs node:test with
// the TS resolve hooks and the react-server condition (so "server-only" is a no-op).
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = path.join(root, "tests");

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const files = collect(testsDir).sort();
if (!files.length) {
  console.error("No tests found in tests/");
  process.exit(1);
}

const hooks = pathToFileURL(path.join(root, "scripts", "test-hooks.mjs")).href;
// Tests always run in zero-key mode: no Postgres, no LLM, no live APIs.
const env = { ...process.env, ADPILOT_MOCK_APIS: "", POSTGRES_URL: "" };
for (const k of Object.keys(env)) {
  if (/_API_KEY$|_ACCESS_TOKEN$/.test(k)) env[k] = "";
}
const result = spawnSync(
  process.execPath,
  ["--import", hooks, "--conditions=react-server", "--test", ...files],
  { stdio: "inherit", cwd: root, env }
);
process.exit(result.status ?? 1);
