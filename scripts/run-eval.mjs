// Cross-platform `npm run eval`: runs eval/run.ts with the same TS resolve hooks
// as the tests, in mock mode with every key cleared (offline, zero-key).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooks = pathToFileURL(path.join(root, "scripts", "test-hooks.mjs")).href;

const env = { ...process.env, ADPILOT_MOCK_APIS: "1", POSTGRES_URL: "", ADPILOT_FIXTURE_DIR: "" };
for (const k of Object.keys(env)) {
  if (/_API_KEY$|_ACCESS_TOKEN$/.test(k)) env[k] = "";
}
const result = spawnSync(
  process.execPath,
  ["--import", hooks, "--conditions=react-server", path.join(root, "eval", "run.ts")],
  { stdio: "inherit", cwd: root, env }
);
process.exit(result.status ?? 1);
