/** Shared filesystem locations, resolved from the repository root. */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `pipeline/` sits one level below the repo root. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const RAW_DATA_DIR = join(REPO_ROOT, "raw-data");
export const DIST_DIR = join(REPO_ROOT, "dist");
export const VALIDATION_REPORT = join(DIST_DIR, "_validation.json");
