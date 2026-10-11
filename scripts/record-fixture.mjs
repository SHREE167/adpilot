// `npm run record -- <youtube|groq|gemini|meta>`: ONE real call per source to verify a key,
// then save the response as a mock fixture. Reads .env.local itself; never prints keys.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooks = pathToFileURL(path.join(root, "scripts", "test-hooks.mjs")).href;

/** Minimal KEY=value parser (comments, blank lines, optional quotes). */
function loadEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

const env = {
  ...process.env,
  ...loadEnvFile(path.join(root, ".env.local")),
  // Live call, no cache table, never mock.
  ADPILOT_MOCK_APIS: "",
  POSTGRES_URL: "",
};
const result = spawnSync(
  process.execPath,
  ["--import", hooks, "--conditions=react-server", path.join(root, "scripts", "record-fixture.ts"), ...process.argv.slice(2)],
  { stdio: "inherit", cwd: root, env }
);
process.exit(result.status ?? 1);
