// Module hooks so node:test can run the app's TypeScript without new deps.
// - "@/x" resolves to <root>/x (tsconfig paths)
// - extensionless relative imports resolve to .ts or /index.ts
// - project .ts files load as ESM TypeScript (Node strips types)
// - project .json files load as `export default <json>`
import { registerHooks } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = path.join(root, "node_modules");

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function findFile(base) {
  return [base, `${base}.ts`, path.join(base, "index.ts")].find(isFile) ?? null;
}

function inProject(filePath) {
  return filePath.startsWith(root) && !filePath.startsWith(nodeModules);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith("@/")) {
      base = path.join(root, specifier.slice(2));
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base && existsSync(path.dirname(base))) {
      const file = findFile(base);
      if (file && inProject(file)) {
        return { url: pathToFileURL(file).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:")) {
      const file = fileURLToPath(url);
      if (inProject(file) && file.endsWith(".json")) {
        return {
          format: "module",
          source: `export default ${readFileSync(file, "utf8")};`,
          shortCircuit: true,
        };
      }
      if (inProject(file) && file.endsWith(".ts")) {
        return nextLoad(url, { ...context, format: "module-typescript" });
      }
    }
    return nextLoad(url, context);
  },
});
