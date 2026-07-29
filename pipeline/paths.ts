/** Shared filesystem locations, resolved from the repository root. */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `pipeline/` sits one level below the repo root. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const RAW_DATA_DIR = join(REPO_ROOT, "raw-data");

/**
 * Build output. `docs/` and not `dist/` because GitHub Pages will only serve a
 * branch's root or its `docs/` folder — no other directory is selectable. The
 * name is the platform's, not a preference.
 */
export const OUTPUT_DIR = join(REPO_ROOT, "docs");
export const VALIDATION_REPORT = join(OUTPUT_DIR, "_validation.json");
