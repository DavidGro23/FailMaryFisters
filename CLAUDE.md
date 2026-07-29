# CLAUDE.md

Project context for Claude Code. Read `requirements-specification.md` for the full specification — this file covers how to work in the repo and the rules that must never be broken.

---

## What this is

A static website showing nine seasons (2017–2025) of a private fantasy football league. Read-only, no backend, no database. A build pipeline reads raw JSON exports from the NFL Fantasy site and emits finished HTML into `dist/`, which GitHub Pages serves.

**The users are ten friends who will argue about these numbers.** Correctness beats features. A page that renders beautifully with a wrong win percentage is worse than no page.

---

## Where the data actually lives

```
raw-data/
  5613993-failmaryfisters/          league folder: <leagueId>-<slug>
    players.json                    global player registry, all seasons
    2017/ … 2025/                   one folder per season, ten JSON files each
      draft-history.json
      end-roster-history.json
      end-standings-history.json
      managers-history.json
      matchup-history.json
      player-matchup-statistics-history.json
      playoff-history.json
      regular-season-standings-history.json
      settings-history.json
      trade-history.json
```

**Discover the league folder and the season folders by reading the directory. Never hardcode `5613993-failmaryfisters` or the year range** — the loader should work if a 2026 folder appears or a second league is added.

Where rules below say `raw-data/players.json`, the real path is `raw-data/<leagueFolder>/players.json`.

**Not yet present, and expected to be hand-written later:**

| File | When it can be written |
|---|---|
| `raw-data/<leagueFolder>/manager-aliases.json` | Only **after** `npm run audit:managers` reports the real manager list. Never generate it from guesswork — see rule 16. |
| `raw-data/<leagueFolder>/league-rules.json` | Any time. Keeper limits, trade deadline, waiver type. |
| `raw-data/<leagueFolder>/assets/` | Avatar download step, see rule 19. |

Their absence is expected during early stages, not a data error. Stage 1 should report them as missing and continue.

---

## Commands

```bash
npm run build          # full pipeline: load → normalize → aggregate → render → dist/
npm run build:data     # stages 1–3 only, writes dist/data/ and dist/_validation.json
npm run typecheck      # tsc --noEmit on both tsconfigs
npm run test           # unit tests (stage 1 loader today, stage 3 aggregate later)
npm run serve          # local static server on dist/
npm run audit:managers # D2 manager identity report — run this before trusting cross-season data
```

Run `npm run typecheck` and `npm run test` before considering any change done.

**Current state: stage 1 only.** `build` exits 1 by design until stages 2–4 exist, and `build:data` runs the load+validate stage — writing `dist/_validation.json` and `dist/.nojekyll` but not yet `dist/data/`. It exits non-zero if validation reports any error.

---

## Non-negotiable domain rules

These come from real defects found in the 2025 export. Violating any of them produces a page that looks right and is wrong. If a task seems to require breaking one, stop and ask.

1. **`teamId` is season-scoped, and it looks deceptively stable.** Nine of ten `teamId`s map to the same manager in all nine seasons — stable enough to look joinable. But `teamId` 5 changed hands twice: Alex (`2035166`, 2017–2018) → Christian (`21881840`, 2019–2024) → Christian (`19557057`, 2025). Joining on `teamId` merges three different people's careers and produces a wrong all-time table that looks completely plausible. Cross-season identity is `userId` from `managers-history.json`, always. Any unresolvable `(year, teamId)` pair is a build failure, not a warning — stage 1 enforces this.

2. **`matchup-history.json` contains playoff and consolation games too.** Classify by whether the `matchupId` appears in `playoff-history.json`. Summing both files double-counts the playoff weeks — which are 16–17 in most seasons but **15–16 in 2018–2020**, so never hardcode them either.

3. **Regular-season length is derived per season:** `wins + losses + draws` from `regular-season-standings-history.json`. **It really does vary — 15 games, except 14 in 2018, 2019 and 2020.** Never hardcode it. Verified in all nine seasons: weeks 1..N of `matchup-history.json` sum exactly to `pointsFor` for all ten teams.

4. **Team scores come from `matchup-history.json` and nowhere else.** Never recompute a team's score by summing its starters. **72 team-games across all nine seasons don't reconcile** (every year has between 2 and 15), and two lineups carry one starter fewer than the slot count. Every delta points the same way: **the starters sum to *more* than the official team total, never less.** **65 of the 72 are sign loss** — the export drops the minus sign on any negative score, so the sum overshoots by exactly `2 × that player's points` (see rule 14a and D17; stage 2 corrects the player value). Correcting it leaves **7**, which are yardage drift between the `stats` snapshot and the `pts` value and are left alone. Log everything to the validation report; **the team total is never altered.**

5. **`pos` in the roster files is the lineup slot, not the player's position.** A bench player has `pos: "BN"`. Real positions come only from `raw-data/<leagueFolder>/players.json`, a global registry of 725 players (`playerId`, `playerName`, `pos`) covering all seasons. It has no duplicates. Coverage is now measured across every season and reference site: **exactly four ids are missing** — `2506467` (2017), `2553568` (2018), `2555464` (2019), `2572042` (2024). Those go to the validation report and render as `Unknown Player (<id>)`.

5a. **Slot names differ between `settings-history.json` and the roster files.** Settings declare `WRRB_FLEX` and `IR`; the roster and player-stat files spell the same slots `FLEX` and `RES`. The string `WRRB_FLEX` never appears as a `pos` value anywhere in the export. Any code joining declared slots to actual lineup records must map between the two vocabularies — see D16. This bites optimal-lineup logic and starter counting first.

6. **Win % is `(W + 0.5·D) / G`.** Ties exist (`draws` field). Never `W / (W + L)`.

7. **Regular season and postseason are computed and displayed separately, never merged.** This applies to H2H, all-time leaderboards, and every record. Postseason samples are tiny and unevenly distributed; blending them misleads.

8. **PPG is the primary cross-season metric,** not total points. Season length and league size differ across nine years.

9. **Weeks arrive lexically sorted** (1, 10, 11, 12, …, 2, 3). Sort numerically. Always.

10. **`player-matchup-statistics-history.json` has no `year` or `week` field.** Parse both from `matchupId` (`year-week-teamA-teamB`) during normalization and materialize them. Downstream code must never parse that string again.

11. **Resolve roster and scoring rules per season. Never generalise from 2025.** All nine seasons have a populated `dstSettings`, including 2025 which has no DEF roster slot and no DEF player anywhere — vestigial platform default, filter it out by `rosterPositions`. Measured transitions: **K dropped in 2019, IR added in 2020, DEF dropped in 2025**, and `WRRB_FLEX` went 1 → 2 (2021) → 3 (2025). Starter counts are 9, except **8 in 2019 and 2020**. Any position-aware code reads that season's slot definition; nothing hardcodes the position set.

12. **`WRRB_FLEX` accepts WR and RB only.** Not TE. Relevant to any optimal-lineup logic.

13. **Never match on `roundLabel`.** The final is `"Championship"` in **2017–2018** and `"Fantasy Super Bowl"` from **2019 on**. Identify it as `bracketType === "Championship"` with the highest `round` that season. Early consolation rounds have `roundLabel: ""`.

14. **The `stats` object shape varies by season, in three tiers:** 25 keys in 2017–2018, 19 in 2019–2024 (kicking keys drop with the K slot), 11 in 2025 (defensive keys drop with the DEF slot). Type it `Record<string, number>`. **`dstSettings` is incomplete, not just non-1:1:** `pts_allow` maps to seven `pts_allow_*` tier keys, and **`def_st_td` has no scoring key at all — it is worth 6 points**, supplied by the league because the export omits it (verified: it reconciles all 29 affected records). Never assume a stat key has a same-named scoring key, and never assume a missing scoring key means the stat scores nothing.

14a. **The export cannot store a negative number — every negative score appears as its magnitude.** Not a DEF quirk: across 22,637 player-stat records and every end-roster total, the minimum value is 0 and there are no negatives at all. Defenses go negative on the `pts_allow` tiers; **offensive players go negative on `fum_lost: -2` and `pass_int: -2`** (Dak Prescott 1.20/−1.20, AJ Dillon 0.70/−0.70, Chris Olave 1.00/−1.00). **107 records have a negative true score; 106 lost the sign, zero kept it** — DEF 78, RB 16, WR 8, QB 5, of which 65 are starters. Stage 2 recomputes every player score from that season's settings and negates the exported value **only** when the recomputation is negative *and* the export equals its magnitude — never substituting a recomputed value otherwise, never correcting any other discrepancy, never touching a team total. **Guard first: an all-zero stats row means "did not play", not a shutout** — `2022-17-5-6` (the cancelled Bills–Bengals game) would otherwise score +10 off the `pts_allow_0` tier. See D17 and D18.

15. **Never use `managerName` as an identifier or a label.** Two different people are named "Christian" (`21881840` through 2024, `19557057` from 2025). The display name is the manager's **latest team name** — verified unique across every manager, with Benjamin the only renamer (LarsVegasRaiders → Saintology). Collisions are a build failure, never auto-numbered.

16. **Display name and slug are different things.** The display name is derived and may change when someone renames a team. The slug is frozen in `raw-data/<leagueFolder>/manager-aliases.json` and never changes — a team-name-derived slug would break every link already shared in the group chat. Emit HTML redirect pages for retired slugs.

17. **The canonical display name is used everywhere, including historical pages.** The 2017 standings read "Saintology", not "LarsVegasRaiders" — in a ten-person league the team name is the person's identity, and nobody remembers the old one. The per-season name lives in `teamsByYear` and is rendered only as muted secondary text where it differs ("Saintology · played as LarsVegasRaiders"). Never use a per-season team name as a primary label.

18. **Keepers are out of scope. Do not attempt to derive them.** The league does use keepers (max 3, from 2018), but they are indistinguishable from ordinary draft picks. The obvious heuristic was tested on 2024 → 2025 and produced 40 candidates with 8 of 10 teams over the limit. If someone asks for keeper display, the answer is a hand-maintained `keepers.json`, not a derivation.

19. **Never fetch from `fantasy.nfl.com` at runtime.** Avatars are downloaded once into `raw-data/<leagueFolder>/assets/`, committed, and referenced locally.

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

**Import extensions differ between the two source trees. This is deliberate, and it is the most common failure mode in this setup.**

`src/web/` is compiled to `.js` and loaded by the browser as native ES modules with no bundler, so relative imports carry the **`.js`** extension:

```ts
import { renderMatrix } from "./matrix.js";   // correct
import { renderMatrix } from "./matrix";      // breaks at runtime, silently
```

`pipeline/` is never compiled — Node runs the `.ts` files directly via native type stripping — so relative imports carry the **`.ts`** extension:

```ts
import { loadRawData } from "./index.ts";     // correct
import { loadRawData } from "./index.js";     // no such file
```

The asymmetry is forced: browsers cannot run `.ts`, and Node's type stripping does not rewrite import specifiers. The web side is the dangerous one, because a wrong extension there fails only at runtime; in `pipeline/` it is a hard `tsc --noEmit` error. Check the web side every time.

**Pipeline code must be erasable-syntax-only** (`erasableSyntaxOnly` is on): no `enum`, no parameter properties, no experimental decorators. Type stripping removes types, it does not transform code.

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
- All ten per-season files are JSON **arrays** at top level — including `settings-history.json`, which is a one-element array wrapping the settings object, not a bare object.
- `end-roster-history.json` gives **exactly 15 players per team in 2017–2019**, then 14–17 from 2020 once the IR slot exists. Do not assume a fixed roster size.
- `trade-history.json` uses `teamId` for `from`/`to` but `transactionOwnerUserId` for the initiator. Different identifier spaces in the same record.
- Trades include **future-year** draft picks in every season from 2018 onward.
- `roundLabel` in `playoff-history.json` can be an empty string for early consolation rounds. Handle it; don't render a blank heading.
- `transactionDate` is ISO-8601 **without timezone**, in every record. Treat as local, do not convert.
- `transactionWeek` can be `0` — in 2017, 2018, 2019, 2023 and 2024. Do not assume `1..17`.
- 2017 is the only season whose trades move players exclusively; every later season also moves future draft picks. Both shapes are valid.
- `players.json` is incomplete in exactly four places: `2506467` (2017), `2553568` (2018), `2555464` (2019), `2572042` (2024). The `Unknown Player (<id>)` fallback is required.
- `nflTeam` is an empty string on 96 records spread over 2017–2023. Present but empty is valid — those players have no season-accurate team.
- **`pos` is redundant with `status` except for starters.** `status: "BN"` ⟺ `pos: "BN"` and `status: "RES"` ⟺ `pos: "RES"`, with zero violations across 23,414 records. `pos` means something only when `status` is `"ST"`.
- **Two team-seasons end with 7 starters instead of 9**: 2022 team 4 (no QB, no TE) and 2023 team 2 (no DEF, no TE). A final-roster snapshot artefact, separate from the two weekly 8-starter lineups.
- **An all-zero DEF stats row means the game was never played**, not that the defense pitched a shutout. Only occurrence: `2022-17-5-6`, the cancelled Bills–Bengals game of week 17, 2022.
- **The export never stores a negative number.** Minimum value is 0 across all 22,637 player-stat records and every end-roster season total. Negative scores exist in the league's rules but reach the file as their magnitude — see rule 14a. Never read a `pts` value as authoritative without that in mind.
- **~4% of offensive player records disagree with their own `stats`** by whole-yard amounts (multiples of 0.20 for rushing/receiving, 0.02–0.04 for passing), ~95% of them negative. Separate defect from the sign loss, not corrected, not to be "fixed".
- Field names are **identical across all nine seasons** for all ten files. No schema drift — only content drift. Every `year` field agrees with its folder, and every `teamId` reference resolves.
- All IDs (`teamId`, `userId`, `playerId`) are JSON **strings** everywhere. Never compare them as numbers.
- **The league has manager turnover, all of it on `teamId` 5.** The measured chain is Alex (`2035166`) 2017–2018 → Christian (`21881840`) 2019–2024 → Christian (`19557057`) 2025. **Two** handovers, not one, and Alex left after **2018**, not 2024. Every other `teamId` kept the same `userId` for all nine seasons. A new `userId` in a season is a legitimate roster change, not a data error — report it, never fail on it. Run `npm run audit:managers` to reproduce this; do not trust recollection.
- **A manager is a person, not a franchise.** Successive managers of the same `teamId` are separate careers with separate records, even though the incoming one inherits the roster, keepers, and picks. Lineage is displayed via the `succession` field but never affects a computed statistic. See §9.7.
- **Succession is derived by the audit, never hand-written.** Walk each `teamId` chronologically and report every `userId` change. Recollection and the export have already disagreed once — trust the data.
- **Keepers are not flagged in the export.** They appear as ordinary draft picks (every 2025 team has exactly 15 picks and 15 rounds = a full roster), which is *why* rule 18 puts them out of scope. §9.8 describes a derivation that was tested and failed — do not implement it. This entry exists to explain the decision, not to reopen it.
- **Traded picks are best-effort, not reliable.** Diff the actual draft order against the computed snake, then cross-check the previous year's trade file. They disagree: an entire 2024 trade between teams 5 and 4 never appeared in the 2025 draft. Trust the draft order, annotate only where both agree, and log every mismatch. **Do not derive the snake baseline from round 1** — in 2023 round 1 itself contains a traded pick (teamId 4 twice, no teamId 10), so it is not a permutation of the ten teams.
- **`transactionOwnerUserId` is not necessarily a participant.** Six trades across 2018–2024 have a non-participant owner, and it is moritz (`5076030`, team 1) in every one — the commissioner recording them. Use `from`/`to` on the legs to identify participants.
- **Roster shape changes constantly**, five distinct shapes over nine seasons. Always read the season's own `rosterPositions`; the full table is in §7 D7.
- **Draft `pick` is the global pick number (1–150), not the pick within the round.** Round 2 is picks 11–20. Every season is 15 rounds × 10 teams.
- **`settings-history.json` covers scoring and roster slots only.** Keeper limits, trade deadline, and waiver type live in the hand-maintained `raw-data/<leagueFolder>/league-rules.json`. Draft type (snake) and playoff format are derivable — derive them, don't hardcode.
- `players.json` has no `nflTeam` field. Per-record `nflTeam` in `end-roster-history.json` and `player-matchup-statistics-history.json` is season-accurate — use those instead.
- DEF entries in `players.json` use a separate ID space (`1000xx`); player IDs range from 3 to 7 digits. Treat them as opaque strings, never as numbers.

---

## When something is ambiguous

Ask rather than guess. Every metric definition, scope decision, and edge-case rule is written down in `requirements-specification.md` §7 and §9. If the answer is not there, it is an open question — surface it instead of inventing a reasonable-sounding default. A silently invented rule in a stats site is a bug that nobody notices until someone loses an argument with it.

Unresolved data problems go to `dist/_validation.json` and are surfaced on `/about/`. The site is honest about its gaps rather than hiding them.
