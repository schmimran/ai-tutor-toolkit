/**
 * Generates build-info.json with the current Git commit SHA and build timestamp.
 * Called by the API build script before TypeScript compilation.
 * The output file is gitignored — it is regenerated on every build.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "build-info.json");

let commitShort = "unknown";
try {
  commitShort = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
} catch {
  // git may not be available in all environments; fall back gracefully.
}

const info = {
  commitShort,
  builtAt: new Date().toISOString(),
};

writeFileSync(outPath, JSON.stringify(info, null, 2) + "\n");
console.log(`build-info.json: ${info.commitShort} @ ${info.builtAt}`);
