import { readFileSync, existsSync } from "fs";
import { resolve, isAbsolute, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Walk up from this file's directory until we find a package.json with a
 * "workspaces" field — that is the monorepo root.  The compiled output lives
 * in packages/core/dist/, so the walk goes:
 *   dist/ → packages/core/ → packages/ → repo root ✓
 */
function findRepoRoot(): string {
  let dir = __dirname;
  while (dir !== "/") {
    const pkgPath = resolve(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
          workspaces?: unknown;
        };
        if (pkg.workspaces) return dir;
      } catch {
        // Not valid JSON — keep walking.
      }
    }
    dir = dirname(dir);
  }
  // Fallback: three levels up from packages/core/dist/
  return resolve(__dirname, "../../..");
}

const repoRoot = findRepoRoot();

const SYSTEM_INSTRUCTIONS_PATH = resolve(repoRoot, "templates/system-instructions.md");

/** Cached system instructions content, loaded once at module init. */
let systemInstructionsCache: string | null = null;
try {
  systemInstructionsCache = readFileSync(SYSTEM_INSTRUCTIONS_PATH, "utf-8");
} catch {
  console.warn(
    "Warning: templates/system-instructions.md not found — global system instructions will not be appended."
  );
}

/**
 * Load a prompt file, stripping template documentation.  If the file contains
 * a "## Begin prompt" marker, everything above it is stripped.
 *
 * Does NOT append global system instructions — use `loadSystemPrompt()` for
 * tutor prompts that need them.
 *
 * Paths resolve relative to the repository root unless absolute.
 */
export function loadPromptFile(filePath: string): string {
  const resolved = isAbsolute(filePath)
    ? filePath
    : resolve(repoRoot, filePath);

  let content: string;
  try {
    content = readFileSync(resolved, "utf-8");
  } catch {
    console.error(`Could not read prompt from ${resolved}`);
    console.error(
      "Set SYSTEM_PROMPT_PATH to the path of your prompt file, relative to the repo root."
    );
    process.exit(1);
  }

  const beginMarker = "## Begin prompt";
  const beginIndex = content.indexOf(beginMarker);
  if (beginIndex !== -1) {
    content = content.substring(beginIndex + beginMarker.length).trim();
  }

  return content;
}

/**
 * Load a tutor system prompt with global system instructions appended.
 *
 * Calls `loadPromptFile()` then appends protocol-level instructions from
 * `templates/system-instructions.md` (sentinel token, image-ref format).
 */
export function loadSystemPrompt(filePath: string): string {
  let content = loadPromptFile(filePath);

  if (systemInstructionsCache) {
    content = content + "\n\n-----\n\n" + systemInstructionsCache;
  }

  return content;
}
