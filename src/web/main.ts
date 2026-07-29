// Placeholder so `tsc -p tsconfig.web.json` has an input to compile.
// Stage 4 replaces this with the real progressive-enhancement entry point
// (H2H matrix, table sorting, lazy-loaded box scores).
//
// Reminder for whoever writes that code: relative imports in `src/web/` must
// carry the `.js` extension (`import { x } from "./h2h.js"`) because the
// browser loads these as native ES modules with no bundler. This is the
// opposite of `pipeline/`, which uses `.ts` extensions and runs under Node's
// native type stripping.
export {};
