/**
 * Tiny .env loader (side-effect import).
 *
 * Reads `.env` from the current working directory and then the repository root
 * (first value wins), copying KEY=VALUE pairs that are not already set on
 * process.env. Supports comments, blank lines, and quoted values.
 *
 * Import this FIRST in the entrypoint, before any module that reads env vars.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const ENV_PATHS = [...new Set([
  resolve(process.cwd(), ".env"),
  resolve(__dirname, "..", "..", "..", ".env"),
])];

for (const envPath of ENV_PATHS) {
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const eq = s.indexOf("=");
      if (eq < 0) continue;
      const key = s.slice(0, eq).trim();
      if (!key || key in process.env) continue;
      let val = s.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn(`[env] could not read ${envPath}:`, err);
    }
  }
}
