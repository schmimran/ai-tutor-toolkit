import { readFileSync, existsSync } from "fs";
import { resolve, isAbsolute, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find the repository root by walking up from this file looking for
 * a package.json with a "workspaces" field.
 */
function findRepoRoot() {
  let dir = __dirname;
  while (dir !== "/") {
    const pkgPath = resolve(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.workspaces) return dir;
      } catch {
        // Not valid JSON, keep looking.
      }
    }
    dir = dirname(dir);
  }
  // Fallback: two levels up from apps/core/
  return resolve(__dirname, "../..");
}

const repoRoot = findRepoRoot();

/**
 * Load a system prompt from a file.  If the file contains a "## Begin prompt"
 * marker, everything above it is stripped — that section holds template
 * variables, not prompt content.
 *
 * Paths are resolved relative to the repository root unless they are absolute.
 */
export function loadSystemPrompt(filePath) {
  const resolved = isAbsolute(filePath)
    ? filePath
    : resolve(repoRoot, filePath);

  let content;
  try {
    content = readFileSync(resolved, "utf-8");
  } catch (err) {
    console.error(`Could not read system prompt from ${resolved}`);
    console.error("Set SYSTEM_PROMPT_PATH in your .env file.");
    process.exit(1);
  }

  const beginMarker = "## Begin prompt";
  const beginIndex = content.indexOf(beginMarker);
  if (beginIndex !== -1) {
    content = content.substring(beginIndex + beginMarker.length).trim();
  }

  return content;
}
