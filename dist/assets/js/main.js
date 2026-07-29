/**
 * Browser entry point.
 *
 * Everything here is progressive enhancement: each page renders complete and
 * correctly ordered as static HTML, and this script only adds interaction
 * (NFR-7). Nothing fetches, and no page depends on it having run.
 *
 * Relative imports carry the `.js` extension because the browser loads these as
 * native ES modules with no bundler — the compiled file is what resolves.
 */
import { initTableSort } from "./table-sort.js";
initTableSort();
