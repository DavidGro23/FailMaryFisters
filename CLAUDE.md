# CLAUDE.md

Project context for Claude Code. Read `requirements-specification.md` for the full specification — this file covers how to work in the repo and the rules that must never be broken.

---

## What this is

A static website showing nine seasons (2017–2025) of a private fantasy football league. Read-only, no backend, no database. A build pipeline reads raw JSON exports from the NFL Fantasy site and emits finished HTML into `dist/`, which GitHub Pages serves.

**The users are ten friends who will argue about these numbers.** Correctness beats features. A page that renders beautifully with a wrong win percentage is worse than no page.

---

## Commands

```bash
npm run build          # full pipeline: load → normalize → aggregate → render → dist/
npm run build:data     # stages 1–3 only, writes dist/data/ and dist/_validation.json
npm run typecheck      # tsc --noEmit on both tsconfigs
npm run test           # unit tests for the aggregate stage
npm run serve          # local static server on dist/
npm run audit:managers # D2 manager identity report — run this before trusting cross-season data
```

Run `npm run typecheck` and `npm run test` before considering any change done.

---

## Non-negotiable domain rules

These come from real defects found in the 2025 export. Violating any of them produces a page that looks right and is wrong. If a task seems to require breaking one, stop and ask.

1. **`teamId` is season-scoped, and it looks deceptively stable.** In both 2017 and 2025, nine of ten `teamId`s map to the same manager — but `teamId` 5 is Alex (`2035166`) in 2017 and Christian (`19557057`) in 2025. Joining on `teamId` merges two different people and produces a wrong all-time table that looks completely plausible. Cross-season identity is `userId` from `managers-history.json`, always. Any unresolvable `(year, teamId)` pair is a build failure, not a warning.

2. **`matchup-history.json` contains playoff and consolation games too.** Classify by whether the `matchupId` appears in `playoff-history.json`. Summing both files double-counts weeks 16–17.

3. **Regular-season length is derived per season:** `wins + losses + draws` from `regular-season-standings-history.json`. Never hardcode 13, 14, or 15. Verified for 2025: 15 games, and weeks 1–15 of `matchup-history.json` sum exactly to `pointsFor` for all ten teams.

4. **Team scores come from `matchup-history.json` and nowhere else.** Never recompute a team's score by summing its starters. Two 2025 matchups and six 2017 matchups genuinely don't reconcile, and one 2017 lineup has 8 starters instead of 9 — post-hoc NFL stat corrections. Log to the validation report; never "fix" the displayed score.

5. **`pos` in the roster files is the lineup slot, not the player's position.** A bench player has `pos: "BN"`. Real positions come only from `raw-data/players.json`, a global registry of 725 players (`playerId`, `playerName`, `pos`) covering all seasons. It has no duplicates and covers 100% of 2025 references — but coverage for 2017–2024 is unverified, so unresolved IDs go to the validation report and render as `Unknown Player (<id>)`.

6. **Win % is `(W + 0.5·D) / G`.** Ties exist (`draws` field). Never `W / (W + L)`.

7. **Regular season and postseason are computed and displayed separately, never merged.** This applies to H2H, all-time leaderboards, and every record. Postseason samples are tiny and unevenly distributed; blending them misleads.

8. **PPG is the primary cross-season metric,** not total points. Season length and league size differ across nine years.

9. **Weeks arrive lexically sorted** (1, 10, 11, 12, …, 2, 3). Sort numerically. Always.

10. **`player-matchup-statistics-history.json` has no `year` or `week` field.** Parse both from `matchupId` (`year-week-teamA-teamB`) during normalization and materialize them. Downstream code must never parse that string again.

11. **Resolve roster and scoring rules per season. Never generalise from 2025.** 2025 has a full `dstSettings` block but no DEF roster slot and no DEF player anywhere — vestigial platform default, filter it out by `rosterPositions`. 2017, by contrast, has `K 1` and `DEF 1` slots, a populated `kickingSettings`, `WRRB_FLEX: 1` instead of 3, and no `IR` slot at all (so no `RES` status). Any position-aware code reads that season's slot definition; nothing hardcodes the position set.

12. **`WRRB_FLEX` accepts WR and RB only.** Not TE. Relevant to any optimal-lineup logic.

13. **Never match on `roundLabel`.** The final is `"Championship"` in 2017 and `"Fantasy Super Bowl"` in 2025. Identify it as `bracketType === "Championship"` with the highest `round` that season. Early consolation rounds have `roundLabel: ""`.

14. **The `stats` object shape varies by season.** 2017 has 14 keys 2025 lacks (`fgm_*`, `xpm`, `sack`, `int`, `safe`, `pts_allow`, `def_td`, `def_st_td`, `fum_rec`, `def_2pt`). Type it `Record<string, number>`. And `pts_allow`/`def_st_td` have no counterpart in `dstSettings` — stat keys and scoring keys are not 1:1, never derive one from the other.

15. **Never use `managerName` as an identifier or a label.** Two different people are named "Christian" (`21881840` through 2024, `19557057` from 2025). The display name is the manager's **latest team name** — verified unique across every manager, with Benjamin the only renamer (LarsVegasRaiders → Saintology). Collisions are a build failure, never auto-numbered.

16. **Display name and slug are different things.** The display name is derived and may change when someone renames a team. The slug is frozen in `raw-data/manager-aliases.json` and never changes — a team-name-derived slug would break every link already shared in the group chat. Emit HTML redirect pages for retired slugs.

17. **The canonical display name is used everywhere, including historical pages.** The 2017 standings read "Saintology", not "LarsVegasRaiders" — in a ten-person league the team name is the person's identity, and nobody remembers the old one. The per-season name lives in `teamsByYear` and is rendered only as muted secondary text where it differs ("Saintology · played as LarsVegasRaiders"). Never use a per-season team name as a primary label.

18. **Keepers are out of scope. Do not attempt to derive them.** The league does use keepers (max 3, from 2018), but they are indistinguishable from ordinary draft picks. The obvious heuristic was tested on 2024 → 2025 and produced 40 candidates with 8 of 10 teams over the limit. If someone asks for keeper display, the answer is a hand-maintained `keepers.json`, not a derivation.

19. **Never fetch from `fantasy.nfl.com` at runtime.** Avatars are downloaded once into `raw-data/assets/`, committed, and referenced locally.

---

## Architecture

```
raw-data/  →  [1 load+validate]  →  [2 normalize]  →  [3 aggregate]  →  [4 render]  →  dist/
```

Stage boundaries are strict:

- **Stage 1 (`pipeline/load/`)** — parse and schema-check. Knows raw file shapes. Unknown fields log a warning; missing required fields are fatal.
- **Stage 2 (`pipeline/normalize/`)** — absorbs *all* per-year weirdness. Builds the manager registry, classifies games, resolves player names. Output is the canonical model in `pipeline/model.ts`. **Knows nothing about pages or HTML.**
- **Stage 3 (`pipeline/aggregate/`)** — pure functions, canonical model in, plain data out. No file I/O. **This is where unit tests live.**
- **Stage 4 (`pipeline/render/`)** — templates to HTML. Contains no arithmetic beyond formatting.

Nine years of exports from a platform that redesigned itself will contain surprises. They belong in stage 2. If you find yourself adding a year-specific `if` in stage 3 or 4, it is in the wrong place.

---

## Code conventions

**TypeScript 7, strict mode is a hard default.** Do not weaken it, do not add `any`, do not use `@ts-ignore`. If types fight you, the model is probably wrong.

**No bundler. Browser code uses native ES modules.** Relative imports in `src/web/` must carry the `.js` extension:

```ts
import { renderMatrix } from "./matrix.js";   // correct
import { renderMatrix } from "./matrix";      // breaks at runtime
```

This is the most common failure mode in this setup. Check it every time.

**No frontend framework, no runtime dependencies in `src/web/`.** Pipeline dependencies are fine (Node, dev-only).

**Naming:** the canonical model uses `a`/`b` for the two sides of a game, ordered by ascending numeric `teamId`. It deliberately does *not* use `home`/`away` or `team1`/`team2` — the raw export's `team1`/`team2` carry no home/away meaning and the naming has misled before.

**Formatting:** points to two decimals, always. Percentages to one decimal. Use tabular figures in CSS so columns align.

---

## Visual design

Direction: **dark NFL broadcast graphics** — black canvas, NFL navy as a structural surface, NFL red as the single accent, medal colours for placings. Full token set in `requirements-specification.md` §12. Read it before writing any CSS.

- All colours come from the custom properties in §12.1. **No hardcoded hex anywhere else.**
- **Navy is a surface colour only** — nav bands, section headers. Never text. The official NFL navy `#013369` and red `#D50A0A` fail contrast on black, which is why §12.1 uses adjusted values. Do not "correct" them back to the brand hex.
- Dark-only. No light mode, no `prefers-color-scheme` block.
- System font stack, no web fonts. Weights 400 and 500 only — 600/700 bloom on black.
- `font-variant-numeric: tabular-nums` on every numeric cell.
- Tables: hairline separators only. No zebra striping, no vertical rules, no outer border.
- Ranks 1–3 get a medal circle; 4+ get a plain muted number. Colour the margin, not the row.
- Red is used only for navigation active state and the champion's name.
- **Forbidden:** gradients, shadows, blur, glow, animation beyond hover/focus, carousels, hero images, icon libraries, emoji, skeleton loaders, light mode.

If a design question comes up that §12 doesn't answer, pick the quieter option.

## Frontend rules

- Everything renders as static HTML at build time. JavaScript is **progressive enhancement only**: H2H matrix interaction, table sorting, lazy-loading box scores. Every page must show its data with JS disabled, except `/h2h/`.
- **Mobile is the primary device, not an afterthought.** Write CSS mobile-first: base styles are the phone layout, media queries add the desktop. Never the reverse.
- **Test at 360px.** Standings, records, and draft boards collapse to stacked cards below 600px — never a horizontally scrolling standings table. The H2H matrix is the only element allowed to scroll horizontally, and it needs a sticky first column.
- All interactive targets ≥ 44px.
- Navigation is one set of markup: CSS moves it from a bottom bar (mobile) to a top band (≥900px). Never duplicate the nav in the DOM.
- No page ships more than ~150 KB of JSON. `player-matchup-statistics` (~9 MB total) is split per season-week and loaded on demand only.
- No animation beyond hover/focus. No carousels, no hero imagery. This is a reference site.

---

## Implementation details

Full list in `requirements-specification.md` §13. The ones that bite immediately:

- **Site language is English**, `<html lang="en">`. Team and manager names appear exactly as exported.
- **Never call `toLocaleString()` without a locale.** On a German browser 1848.60 renders as `1.848,60`. Use a single shared `Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Points 2 decimals, percentages 1, records as `12–3` with an en dash.
- **`dist/.nojekyll` must exist.** GitHub Pages runs Jekyll, which silently drops underscore-prefixed paths — `_validation.json` would vanish in production with no error.
- **Base path**: publishing as a user site (`<user>.github.io`) keeps it `/`. If it becomes a project site, every absolute URL must go through a `BASE_PATH` constant.
- **`esc()` every interpolated value.** Player names contain apostrophes (`Ja'Marr Chase`). Templating is plain tagged template literals — no engine, no dependency.
- **Never re-sort standings.** Use `overallRank` from the export; it already carries the league's tiebreak. 2025 has three teams at 7-8.
- **Tests use `node:test`.** Do not add vitest or jest.
- `dist/robots.txt` disallows all, plus a `noindex` meta tag. Public for convenience, not for an audience.

## Data quirks worth remembering

- Files are named `*-history.json` but each contains **only its own season**. The pipeline concatenates across folders.
- `end-roster-history.json` gives 15–17 players per team, varying — do not assume a fixed roster size.
- `trade-history.json` uses `teamId` for `from`/`to` but `transactionOwnerUserId` for the initiator. Different identifier spaces in the same record.
- Trades can include **future-year** draft picks (2025 trades move 2026 picks).
- `roundLabel` in `playoff-history.json` can be an empty string for early consolation rounds. Handle it; don't render a blank heading.
- `transactionDate` is ISO-8601 **without timezone**. Treat as local, do not convert.
- `transactionWeek` can be `0` (a 2017 December trade). Do not assume `1..17`.
- 2017 trades move players only; 2025 trades move future draft picks too. Both shapes are valid.
- `players.json` is incomplete: `2506467` is referenced in 2017 but missing from it. The `Unknown Player (<id>)` fallback is required.
- Field names are **identical** between the 2017 and 2025 exports across all ten files. No schema drift — only content drift.
- **The league has manager turnover.** Alex (`2035166`) left after 2024, Christian (`19557057`) took over `teamId` 5 for 2025. A new `userId` in a season is a legitimate roster change, not a data error — report it, never fail on it. Expect more changes in 2018–2024.
- **A manager is a person, not a franchise.** Successive managers of the same `teamId` are separate careers with separate records, even though the incoming one inherits the roster, keepers, and picks. Lineage is displayed via the `succession` field but never affects a computed statistic. See §9.7.
- **Succession is derived by the audit, never hand-written.** Walk each `teamId` chronologically and report every `userId` change. Recollection and the export have already disagreed once — trust the data.
- **Keepers are not flagged in the export.** They appear as ordinary draft picks (every 2025 team has exactly 15 picks and 15 rounds = a full roster). Derive them per §9.8 and validate on 2024 → 2025 before trusting the result.
- **Traded picks are best-effort, not reliable.** Diff the actual draft order against the computed snake, then cross-check the previous year's trade file. They disagree: an entire 2024 trade between teams 5 and 4 never appeared in the 2025 draft. Trust the draft order, annotate only where both agree, and log every mismatch.
- **`transactionOwnerUserId` is not necessarily a participant.** A 2024 trade between teams 5 and 4 carries moritz (team 1), presumably the commissioner. Use `from`/`to` on the legs to identify participants.
- **Roster shape changes constantly.** 2017 had K, DEF and 1 flex; 2024 had DEF, 2 flex and IR; 2025 has 3 flex and no defense. Always read the season's own `rosterPositions`.
- **`settings-history.json` covers scoring and roster slots only.** Keeper limits, trade deadline, and waiver type live in the hand-maintained `raw-data/league-rules.json`. Draft type (snake) and playoff format are derivable — derive them, don't hardcode.
- `players.json` has no `nflTeam` field. Per-record `nflTeam` in `end-roster-history.json` and `player-matchup-statistics-history.json` is season-accurate — use those instead.
- DEF entries in `players.json` use a separate ID space (`1000xx`); player IDs range from 3 to 7 digits. Treat them as opaque strings, never as numbers.

---

## When something is ambiguous

Ask rather than guess. Every metric definition, scope decision, and edge-case rule is written down in `requirements-specification.md` §7 and §9. If the answer is not there, it is an open question — surface it instead of inventing a reasonable-sounding default. A silently invented rule in a stats site is a bug that nobody notices until someone loses an argument with it.

Unresolved data problems go to `dist/_validation.json` and are surfaced on `/about/`. The site is honest about its gaps rather than hiding them.
