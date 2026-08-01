# Requirements Specification — Fantasy Football League Website

**Status:** Draft v2
**Date:** 2026-07-28
**Supersedes:** v1 (2026-07-28)

> **Changes vs v1:** data model defined from real export; manager identity resolved via `userId`; playoff/regular-season boundary rule defined; page inventory added; aggregation output schema defined; architecture changed from client-side JSON rendering to build-time HTML pre-rendering; metric definitions added; seven data-integrity rules added.

---

## 1. Purpose

A public, read-only website displaying historical data for a private fantasy football league, seasons 2017–2025. Source data was exported from the NFL Fantasy website as JSON.

## 2. Scope

**In scope:** static data display, cross-season aggregation, browsing by season and by manager, head-to-head comparison, draft history, trade log, playoff brackets, scoring-settings history.

**Out of scope:** user accounts, live/current-season data entry, write operations, admin UI, real-time NFL sync, projections, any "what if" simulation.

## 3. Target Audience

The league members (private friend group). Site is public, no login. **Mobile is the primary consumption device** — the site will be shared by link in a group chat.

---

## 4. Functional Requirements

| ID | Requirement | Status | Acceptance criteria |
|----|-------------|--------|---------------------|
| FR-1 | League standings per season | Ready | For each year 2017–2025: regular-season table (rank, W-L-D, PF, PA, PPG) and final standings (rank 1–N). Spot-check 2025: Railgunners 12-3, PF 1848.60, final rank 1. |
| FR-2a | Team performance per season | Ready | Per manager per season: record, PF, PA, PPG, highest/lowest weekly score, average margin, luck index (§9.3). |
| FR-2b | Player-level stats per season | Ready | Weekly box score per matchup: starters + bench, position, points. Player name resolved via `players.json`. |
| FR-3 | Head-to-head between managers | Ready | Any manager pair: W-L-D, PF/PA, average margin, biggest win, full game list. **Split into regular season and postseason, shown separately** (§9.1). |
| FR-4 | All-time records across seasons | Ready | Leaderboards by PPG (primary), total points, win %, championships, playoff appearances, final-rank average. Single-game and single-season records (§9.4). Each leaderboard available in both scopes (§9.1). |
| FR-5 | Draft history | Ready | Per year: full board by round/pick, drafting team, player. Marks picks that were acquired by trade where determinable (§9.5). |
| FR-6 | Playoff brackets per season | **New** | Championship and consolation bracket per year: seeds, round labels, scores, winners. |
| FR-7 | Trade log | **New** | All trades across all seasons: date, week, participants, players and draft picks exchanged. |
| FR-8 | Scoring & roster settings history | **New** | Per season: roster slots and scoring rules **that were actually in effect** (§8, finding D6). |
| FR-9 | Manager career page | **New** | Per manager: seasons played, all team names used, championships, career record, season-by-season table, best/worst season. |

---

## 5. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Fully public, no authentication |
| NFR-2 | Read-only; no runtime write operations, no database |
| NFR-3 | Hosting free (GitHub Pages — decided, §11) |
| NFR-4 | No paid or locally installed software required beyond Node.js and a browser |
| NFR-5 | Any page loads in < 1 s on a mobile connection. No page ships more than ~150 KB of JSON. |
| NFR-6 | **Mobile-first.** Mobile is the primary device, desktop the enhancement. All layouts must work at 360 px width and scale up cleanly to a desktop browser. Touch targets ≥ 44 px. |
| NFR-7 | Site must work with JavaScript disabled for all pages except the H2H matrix and the box-score expansion (progressive enhancement) |
| NFR-8 | No runtime dependency on `fantasy.nfl.com` (assets vendored locally, §8 finding D7) |
| NFR-9 | Pipeline is fully deterministic: same inputs → byte-identical outputs |

---

## 6. Data Source

### 6.1 Layout

```
raw-data/
  players.json              <- global player registry (see 6.3)
  2017/ … 2025/             <- one folder per season, identical file set:
    managers-history.json
    settings-history.json
    regular-season-standings-history.json
    end-standings-history.json
    matchup-history.json
    playoff-history.json
    draft-history.json
    end-roster-history.json
    player-matchup-statistics-history.json
    trade-history.json
```

> **Naming warning:** despite the `-history` suffix, each file contains **only its own season's** records. The pipeline concatenates across folders. Every record carries a `year` field except `player-matchup-statistics-history.json` (see D-parse below).

### 6.2 Verified schemas (from 2025 export)

**`managers-history.json`** — the identity anchor.
```ts
{ year: number; managerName: string; userId: string;
  coManagerName: string | null; coUserId: string | null;
  teamName: string; teamId: string; teamImgUrl: string }
```

**`regular-season-standings-history.json`**
```ts
{ year: number; divisionId: number; divisionName: string; teamId: string;
  divisionRank: number; overallRank: number;
  wins: number; losses: number; draws: number;
  pointsFor: number; pointsAgainst: number }
```
2025 has a single division named "Regular Season". Do not assume this for all years — handle multiple divisions.

**`end-standings-history.json`**
```ts
{ year: number; rank: number; teamId: string; teamName: string }
```

**`matchup-history.json`** — contains **all** games, including playoffs and consolation.
```ts
{ year: number; week: number; matchupId: string;
  team1Id: string; team2Id: string;
  team1Points: number; team2Points: number }
```
`matchupId` = `` `${year}-${week}-${lowerTeamId}-${higherTeamId}` ``. `team1`/`team2` carry **no** home/away meaning — they are ordered by numeric `teamId`. The canonical model renames them `teamA`/`teamB` to prevent false semantics.

**`playoff-history.json`** — authoritative for game classification.
```ts
{ year: number; week: number; round: number; roundLabel: string;
  bracketType: "Championship" | "Consolation";
  team1Id: string; team1Seed: number;
  team2Id: string; team2Seed: number;
  team1Points: number; team2Points: number; winner: string }
```
`roundLabel` may be `""` (empty) for early consolation rounds. Known 2025 labels: `Semifinal`, `Fantasy Super Bowl`, `3rd Place Game`, `5th Place Game`, `7th Place Game`.

**`draft-history.json`**
```ts
{ year: number; round: number; pick: number; teamId: string;
  teamName: string; playerId: string; playerName: string }
```
15 rounds × 10 teams = 150 picks in **every** season 2017–2025. `pick` is the **global** pick number across the whole draft (1–150), *not* the pick number within the round — round 2 runs from pick 11 to pick 20. Verified in all nine seasons.

**`end-roster-history.json`** — final roster snapshot.
```ts
{ year: number; teamId: string; playerId: string;
  status: "ST" | "BN" | "RES"; pos: string; nflTeam: string; pts: number }
```
`pts` = season total for that player. **`pos` is the lineup slot, not the player's position** (see D3), and it uses `FLEX`/`RES` where settings say `WRRB_FLEX`/`IR` (see D16).

**`pos` is redundant with `status` except for starters.** Verified across all 23,414 roster and player-stat records, with zero violations: `status: "BN"` ⟺ `pos: "BN"`, and `status: "RES"` ⟺ `pos: "RES"`. `pos` carries real information **only** when `status` is `"ST"`. Do not model them as two independent dimensions.

**Two team-seasons end with 7 starters instead of 9:** 2022 team 4 (no QB, no TE) and 2023 team 2 (no DEF, no TE). This is why the season-end `pos` counts fall short of 90 — it is a snapshot artefact of the final roster, and it is distinct from the two *weekly* 8-starter lineups noted in D6.

**`player-matchup-statistics-history.json`** — the large file (~1 MB/season).
```ts
{ matchupId: string; teamId: string; playerId: string;
  pos: string; nflTeam: string; status: "ST" | "BN" | "RES";
  pts: number; stats: Record<StatKey, number> }
```
**No `year` or `week` field** — both must be parsed from `matchupId` and materialized during normalization. Observed `StatKey`s (all present on every record): `pass_yd`, `pass_td`, `pass_int`, `pass_2pt`, `rush_yd`, `rush_td`, `rec`, `rec_yd`, `rec_td`, `fum_lost`, `fum_rec_td`.

**`trade-history.json`**
```ts
{ year: number; transactionDate: string;            // ISO, no timezone
  transactionWeek: number;
  transactionOwnerUserId: string;                   // userId, NOT teamId — and NOT necessarily a participant
  transaction: Array<{
    from: string; to: string;                       // teamId
    sends: Array<
      | { type: "player"; playerId: string }
      | { type: "draftPick"; draftPick: { year: number; round: number } }>
  }> }
```
Future-year draft picks are tradeable, and are traded in **every season from 2018 onward** — not just recently. **2017 is the only season whose trades move players exclusively**, which matches the league running as a redraft season that year.

**`transactionOwnerUserId` is not reliably a participant.** Six trades across 2018–2024 carry an owner who is not on either side of any leg, and in **every one of those six** the owner is `5076030` (moritz, team 1) — consistent with the commissioner recording trades on others' behalf. Never infer trade participants from this field; use `from`/`to` on the legs.

**`settings-history.json`** — note this file is a **one-element array** wrapping the object below, not a bare object.
```ts
[{ year: number;
   rosterPositions: Record<string, { count: number }>;
   offenseSettings: Record<string, number>;
   kickingSettings: Record<string, number>;
   dstSettings: Record<string, number>;
   otherSettings: Record<string, string> }]
```
2025 roster: `QB 1, RB 2, WR 2, TE 1, WRRB_FLEX 3, BN 6, IR 2`. **`WRRB_FLEX` accepts WR, RB and TE despite its name — see D19.** Scoring is 0.5 PPR, no kicker, no defense.

**Slot names differ between this file and the roster files — see D16.** `rosterPositions` uses `WRRB_FLEX` and `IR`; the same slots appear as `FLEX` and `RES` in the `pos`/`status` fields of `end-roster-history.json` and `player-matchup-statistics-history.json`.

`otherSettings` keys also drift: `Def 2-point Return` is present 2017–2020 and absent from 2021.

### 6.3 `players.json` — VERIFIED

Global registry at the root of `raw-data/`, covering all seasons (not per-season).

```ts
Array<{ playerId: string; playerName: string; pos: string }>
```

Verified against the 2025 export:

| Property | Value |
|---|---|
| Entries | 725, no duplicate `playerId` |
| Coverage of 2025 references | 242 of 242 — complete |
| Name conflicts vs `draft-history.json` | none |
| Positions | `RB` 251, `WR` 247, `TE` 92, `QB` 71, `DEF` 32, `K` 32 |
| ID format | numeric strings, 3–7 digits; DEF entries use a separate `1000xx` space |

**This file is the sole source of truth for player position**, since the roster files only carry the lineup slot (D3). It resolves FR-2b and §9.6.

Notes:

- No `nflTeam` field. Per-record `nflTeam` is available in `end-roster-history.json` and `player-matchup-statistics-history.json` and is season-accurate there, so use those rather than trying to attach a team to the registry.
- **Coverage is incomplete, in four places.** Measured across every reference site (draft, end roster, player stats, traded players) in all nine seasons, exactly four ids are referenced but missing: `2506467` (2017), `2553568` (2018), `2555464` (2019), `2572042` (2024). 2020–2023 and 2025 resolve completely. The `Unknown Player (<id>)` fallback plus a validation-report entry is required, not optional.
- 2017 references 285 players including 28 DEF and 27 K; 2025 references 242 with none of either.
- The presence of exactly 32 `DEF` and 32 `K` entries (one per NFL team) indicates the league used kickers and defenses in earlier seasons. See D7.

---

### 6.4 `league-rules.json` — hand-maintained, not exported

`settings-history.json` covers **scoring and roster slots only**. Several league rules are not in the export at all and must be maintained by hand:

```ts
Array<{
  year: number;
  keeperLimit: number | null;   // null = no keepers (2017)
  tradeDeadlineWeek?: number;
  waiverType?: string;
  notes?: string;
}>
```

Known: the league ran as a standard redraft league in **2017**, and switched to **keepers with a maximum of 3 per manager from 2018 onward**.

Two things that look like league rules are in fact **derivable** and must not be duplicated here:

- **Draft type** — verified snake in both 2017 and 2025 (round 2 is the exact reverse of round 1). Derive it; don't hardcode it.
- **Playoff format** — 4-team championship bracket plus 4-team consolation, derivable from `playoff-history.json`.

### 6.5 Manager display names and slugs

**Display name = the manager's most recent team name.** Verified across 2017, 2024 and 2025: every manager keeps a stable team name, all latest names are unique, and no team name has ever been used by two different `userId`s.

| userId | Manager | Team names | Display name |
|---|---|---|---|
| `2035166` | Alex | Soft Gay Fisting | Soft Gay Fisting |
| `9062581` | Benjamin | LarsVegasRaiders → Saintology | Saintology |
| `21881840` | Christian | Crazy caught carps | Crazy caught carps |
| `19557057` | Christian | NHS Bengalz | NHS Bengalz |

Alex played 2017–2018 only and used one team name throughout. Benjamin is the only manager who renamed. The rule resolves the "Christian" collision (D14) without any manual entry.

**Measured across all nine seasons, the identity picture is remarkably stable:**

- **No `userId` ever changed `teamId`** — each is bound to exactly one team for its entire life.
- **No `userId` ever changed `managerName`.**
- **Exactly one team name ever changed:** `9062581` (Benjamin), in 2018, `LarsVegasRaiders` → `Saintology`.
- **All turnover is on `teamId` 5**, which carries **three separate careers**: Alex (`2035166`) 2017–2018 → Christian (`21881840`) 2019–2024 → Christian (`19557057`) 2025. Contiguous, no overlapping seasons, no gaps.

**The league owner has confirmed all three are different people.** The export cannot distinguish "a new manager took over" from "the same person opened a new account" — both boundaries look identical in the data — so this is recorded knowledge, not a derivation. **No career merging is ever correct**, and `userId` is therefore sufficient as the identity key.

#### Display name vs slug — they are different things

| | Source | Stability |
|---|---|---|
| Display name | Derived: latest team name | Changes when a manager renames — desirable |
| URL slug | Frozen in `manager-aliases.json` | **Never changes** |

A slug derived from the team name would break every previously shared link on a rename — Benjamin's rename would have 404'd `/managers/larsvegasraiders/`. The slug is therefore seeded from a slugified latest team name on first build and then frozen in the alias file. The pipeline reports any drift between current display name and frozen slug so it is noticed before publishing.

**Retired slugs get redirects.** The render stage emits a minimal HTML redirect page for every superseded slug, so old links in the group chat keep working indefinitely. Cheap on static hosting and permanent.

#### `manager-aliases.json`

```ts
Array<{
  userId: string;
  slug: string;                 // frozen, unique, URL-safe
  displayNameOverride?: string; // only if the derived name is unwanted
  retiredSlugs?: string[];      // emit redirects for these
  note?: string;
}>
```

The pipeline fails the build if two managers resolve to the same display name or the same slug. It never auto-numbers a collision.

Confirmed franchise chain on `teamId` 5: Alex (`2035166`) → Christian (`21881840`) → Christian (`19557057`).

#### The canonical name is used everywhere

**One name per manager, on every page, in every season.** The 2017 standings show "Saintology", not "LarsVegasRaiders".

Rationale: in a ten-person league the team name *is* the person's identity. Most members will not remember that Saintology was once called LarsVegasRaiders, so rendering the historical name would confuse more readers than it informs. It also keeps the render stage free of context-dependent name switching.

**The historical name is retained and shown as secondary detail.** Where a season's team name differs from the canonical one, the season page and the manager career page display it in muted text alongside:

> **Saintology** · played as LarsVegasRaiders

This only ever appears for Benjamin, so it adds no noise elsewhere. The `Manager.teamsByYear` model already carries the per-season names — they are displayed as annotation, never used as the primary label.

## 7. Data Integrity Rules

These are **mandatory** pipeline behaviours. Each one, if ignored, produces a page that looks correct and is wrong.

| # | Rule |
|---|------|
| D1 | **`teamId` is season-scoped, and it is a trap.** Verified across 2017 and 2025: nine of ten `teamId`s map to the *same* manager in both years — stable enough to look joinable. But `teamId` 5 is Alex (`2035166`) in 2017 and Christian (`19557057`) in 2025. A naive join on `teamId` silently merges two different people's careers and produces a plausible, wrong all-time table. All cross-season joins go through `userId`, resolved via `(year, teamId) → userId` from `managers-history.json`. Unresolvable pairs are a hard build failure. |
| D2 | **Verify manager identity across all 9 seasons before trusting it.** Emit a manager audit: any `userId` appearing under multiple `managerName`s, and any `managerName` under multiple `userId`s. If NFL Fantasy re-issued IDs at any point, add a manual `manager-aliases.json` override. Do not silently merge or split. **A new `userId` appearing in a season is a legitimate roster change, not an error** — the league has confirmed turnover (§9.7). Report it, do not fail on it. |
| D3 | **`pos` in roster files is the lineup slot, not the player position.** Bench players have `pos: "BN"` — no position information. Real positions come from `players.json` only. |
| D16 | **Slot names are not the same in `settings-history.json` and the roster files.** `rosterPositions` declares `WRRB_FLEX` and `IR`; those same slots appear as **`FLEX`** and **`RES`** in the `pos` and `status` fields of `end-roster-history.json` and `player-matchup-statistics-history.json`. Verified in all nine seasons: the string `WRRB_FLEX` never occurs as a `pos` value anywhere in the export, and `FLEX` never occurs as a `rosterPositions` key. Any code that joins a season's declared slots to actual lineup records — optimal lineup (§9.6), position filters, roster displays, starter counting — must map between the two vocabularies. Stage 2 owns that mapping; stage 1 records both verbatim. Counting starters as "every `rosterPositions` slot except `BN` and `IR`" gives 9 in 2017–18 and 2021–25 and 8 in 2019–20, which matches the lineups. |
| D4 | **Playoff and consolation games are duplicated in `matchup-history.json`.** Find them by `matchupId` membership in `playoff-history.json`; never sum both files. Membership alone only proves the game is post-regular-season — split the two brackets with D20. |
| D5 | **Regular season length is derived, not hardcoded.** `regularSeasonWeeks = wins + losses + draws` from `regular-season-standings-history.json`. **It genuinely varies: 15 games in 2017 and 2021–2025, but 14 in 2018, 2019 and 2020** — so the playoffs are weeks 16–17 in most years and weeks **15–16** in 2018–2020. Verified in all nine seasons: weeks `1..regularSeasonWeeks` of `matchup-history.json` sum to `pointsFor` **exactly** for all ten teams, every year. Any game with `week <= regularSeasonWeeks` that also appears in `playoff-history.json`, or any game beyond it that does not, goes to the validation report — measured zero violations in either direction across the whole export. |
| D6 | **`matchup-history` points are authoritative.** Never recompute a team score from player stats. Measured across all nine seasons: **72 team-games** do not reconcile against the sum of their starters — 2017:6, 2018:9, 2019:7, 2020:8, 2021:5, 2022:9, 2023:11, 2024:15, 2025:2. **Every delta has the same sign: `matchupPoints − starterSum` is always negative**, i.e. the starters sum to *more* than the official team total, never less. These are **two distinct populations**: **65 of the 72 are sign loss (D17)**, a provable defect that stage 2 corrects — applying it across all positions leaves **7**. The remaining 7 are **yardage drift**, not stat corrections: the `stats` snapshot and the `pts` value disagree by whole-yard amounts. League-wide this affects 544 offensive records with deltas that are always whole-yard multiples (0.20 = 2 rushing/receiving yards; 0.02–0.04 = passing yards) and are **~95% negative** — a bidirectional correction process would not produce that skew. These records are **left exactly as exported**. Two of the 7 survivors do not fit even the drift pattern (`2024-9-6-10` at −2.00 and `2023-4-5-6` at −1.00) and are accepted as unexplained rather than chased. Separately, two lineups carry one starter fewer than that season's slot count: `2017-15-2-3` (team 3) and `2024-14-3-5` (team 3). Unreconciled games go to the validation report; **the team total in `matchup-history.json` is never altered, under any circumstance.** |
| D7 | **Roster and scoring rules are resolved per season, never league-wide.** 2025 has a populated `dstSettings`, an empty `kickingSettings`, no K or DEF roster slot, and no K/DEF player in any lineup — so its DST rules are a vestigial platform default. **All nine seasons measured, five distinct roster shapes:**

| Slot | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|---|---|
| QB / RB / WR / TE | 1/2/2/1 | 1/2/2/1 | 1/2/2/1 | 1/2/2/1 | 1/2/2/1 | 1/2/2/1 | 1/2/2/1 | 1/2/2/1 | 1/2/2/1 |
| K | 1 | 1 | — | — | — | — | — | — | — |
| DEF | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | — |
| WRRB_FLEX | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 3 |
| BN | 6 | 6 | 7 | 7 | 6 | 6 | 6 | 6 | 6 |
| IR | — | — | — | 2 | 2 | 2 | 2 | 2 | 2 |
| **Starters** | **9** | **9** | **8** | **8** | **9** | **9** | **9** | **9** | **9** |

Exact transitions: **kickers dropped in 2019** (and `kickingSettings` is empty from 2019 on), **IR added in 2020**, **defenses dropped in 2025**, and the flex count grew in 2021 and again in 2025. `dstSettings` is populated in all nine seasons, including 2025 where no DEF slot exists — so it must be filtered by `rosterPositions`, never trusted on its own. Never generalise a roster shape from any single season; always read that season's `rosterPositions`. FR-8 renders only rules for slots present in that season's `rosterPositions`, and any position-aware logic (§9.6, position filters, roster displays) must read the season's slot definition rather than a hardcoded set. |
| D8 | **Weeks are lexically sorted in the export** (1, 10, 11, 12, …, 2, 3). Sort numerically everywhere. |
| D9 | **Ties are possible** (`draws` field). Win % = `(W + 0.5·D) / G`. Never `W / (W + L)`. |
| D14 | **Never use `managerName` as an identifier or a label.** Two different people are named "Christian" (`21881840` through 2024, `19557057` from 2025). Display names come from the latest team name (§6.5); slugs are frozen in `manager-aliases.json`. Any collision in either is a **build failure**, never a silently numbered fallback. |
| D15 | **The canonical display name is used on every page, including historical ones.** The 2017 standings show "Saintology", not "LarsVegasRaiders" — the team name is the manager's identity in this league. The per-season name is retained in `teamsByYear` and rendered only as muted secondary text where it differs. Never use a per-season team name as a primary label. |
| D11 | **Never match on `roundLabel`.** The title game is labelled `"Championship"` in **2017–2018** and `"Fantasy Super Bowl"` from **2019 onward** — the label changed mid-history, which is exactly why it cannot be matched on. Identify the final as `bracketType === "Championship"` with the highest `round` in that season. Early consolation rounds have `roundLabel: ""`. Only two `bracketType` values ever occur: `Championship` and `Consolation`. |
| D12 | **The `stats` object shape varies by season, in three tiers.** **25 keys in 2017–2018**, **19 in 2019–2024** (the `fgm_*`/`xpm` kicking keys drop when the K slot does), and **11 in 2025** (the defensive keys `sack`, `int`, `safe`, `pts_allow`, `def_td`, `def_st_td`, `fum_rec`, `def_2pt` drop with the DEF slot). Type it as `Record<string, number>`, never a fixed interface. **`dstSettings` is incomplete, not merely non-1:1 with the stat keys.** `pts_allow` maps to the seven `pts_allow_*` tier keys rather than to a single key, and **`def_st_td` has no counterpart at all** — its value is **6 points**, supplied by the league owner because it is absent from the export. Verified: applying 6 reconciles **all 29** records containing a special-teams touchdown and reduces the unexplained DEF population from 31 to 2. Never assume a stat key has a same-named scoring key, and never assume the absence of a scoring key means the stat is worth nothing. |
| D17 | **The export cannot represent a negative number. Every negative score is stored as its magnitude.** This is a property of the export as a whole, not of any one position: across **22,637** `player-matchup-statistics-history.json` records and every `end-roster-history.json` season total, the minimum value is **0** and there is not a single negative number anywhere. Any player whose true score is negative therefore appears with the minus sign stripped. Defenses reach negative scores through the `pts_allow_28_34`/`pts_allow_35p` tiers; **offensive players reach them through `fum_lost: -2` and `pass_int: -2`.** Measured by recomputing every record against that season's settings: **107 records have a negative true score and 106 of them lost the sign, with zero counter-examples** — DEF 78, RB 16, WR 8, QB 5. **65 sit in a starting lineup**, and correcting them is what takes the D6 unreconciled team-games from 72 down to 7. Worked examples: `2017-10-4-9` team 4, Denver allowed 41 with 1 sack, true **−3.00**, exported **3.00**; Dak Prescott **1.20 / −1.20**; AJ Dillon **0.70 / −0.70**; Chris Olave **1.00 / −1.00**; Bhayshul Tuten **1.50 / −1.50**. **Correction rule for stage 2:** recompute each player's score from that season's settings (`offenseSettings`, `kickingSettings`, or `dstSettings` with `def_st_td` at 6 per D12, and the D18 all-zero guard); **if and only if** the result is negative *and* the exported value equals its absolute value, negate the exported value. Never substitute a recomputed value in any other circumstance, never correct any other discrepancy, and **never alter a team total**. Log every correction to the validation report. |
| D19 | **`WRRB_FLEX` accepts tight ends. The slot name is not the eligibility rule.** The league's rulebook (§2.2) defines the slot as "3 FLEX (RB/WR/TE)", and the export bears that out: across nine seasons there are **2459 FLEX starts — 1449 WR, 952 RB and 58 TE** — the earliest being Vernon Davis in 2017 week 10. An earlier version of this document asserted the opposite, inferred from the slot name alone; that inference was wrong and §9.6's optimal-lineup logic would have produced too-low a ceiling because of it. Read eligibility from the rulebook, and sanity-check it against what has actually been started. |
| D18 | **An all-zero DEF stats row means "did not play", not "shutout".** `2022-17-5-6` (Buffalo, week 17 2022 — the cancelled Bills–Bengals game) has every stat at zero, including `pts_allow: 0`. A naive tier lookup reads that as a shutout and awards `pts_allow_0: 10`; the true score is **0**, which is what the export correctly records. Any DEF recomputation must check for an all-zero stats row *before* consulting the `pts_allow` tiers. This is one of the two DEF records that do not reconcile under D17; the other is `2023-4-5-6` (Philadelphia, exported 5.00 vs computed 4.00 — off by exactly 1.00, no structural explanation, left alone). |
| D21 | **The export contains no waiver, free-agent, add or drop records — only trades.** Every field at every nesting depth across all ten files × nine seasons was searched; `trade-history.json` is the whole of it. `go-nfl-fantasy`, the tool that produced this export, has scrapers for eleven data types and none for transactions — its trades scraper reads `.../history/<year>/transactions?transactionType=trade`, i.e. the league's transaction log filtered to one type. The missing types matter because rulebook §5.3 prices an undrafted keeper on his last waiver/free-agent claim: **44 of the 150 players on the 2025 rosters are undrafted**. **Measured against the live log: the endpoint accepts only `add`, `drop`, `trade`, `roster`, `commish`; there is no `waiver` type, and an unrecognised value falls back to a default view instead of erroring** — so a guessed parameter returns a convincing page of the wrong rows. Waiver claims sit inside `add`, separated by the `transactionFrom` column, whose only two values there are `"Waivers"` and `"Free Agents"`. Player id comes from a `playerNameId-<id>` class; pages hold 20 rows and paginate on `offset=`; rows are newest-first, so the first `add` per player is the one that prices him (assert the ordering, do not assume it). Captured by a **local tool kept out of this repository** — the site needs no network code to build (rule 19, NFR-9) — and committed as `raw-data/<leagueFolder>/keeper-acquisitions.json`. Absence is expected and never an error; unpriced players render "not recorded". **Never default an undrafted player to round 10 or 12.** |
| D20 | **A playoff game is a `Championship`-bracket game. Consolation games are not playoff games.** `playoff-history.json` holds exactly 8 games in each of the nine seasons — **4 `Championship`** (two semifinals, the final, the third-place game) and **4 `Consolation`** (an unlabelled first round, plus the 5th- and 7th-place games) — for 72 real playoff and 72 consolation team-games across the export. The league counts only the former. Discriminate on `bracketType`; never on `roundLabel` (D11), whose consolation first round is `""`. **Reported defect, since fixed:** classifying by mere membership in the file made "lowest playoff score" a 2017 consolation game at **54.04** instead of the true **66.40** (SG Drugs-Bucs, 2022 Fantasy Super Bowl), put a 5th-place game second on the highest-score list, and gave Crazy caught carps — who has never reached the championship bracket in nine seasons — a full set of playoff records off 10 consolation games. Consolation games stay classified in the model but appear in no scope and on no page. |
| D13 | **`transactionWeek` can be `0`.** Occurs in 2017, 2018, 2019, 2023 and 2024 — it is a recurring pattern, not a one-off. Do not assume `1..17`. |
| D10 | **Vendor remote assets.** `teamImgUrl` hotlinks `fantasy.nfl.com` and will eventually rot. Download once into `raw-data/assets/` at pipeline time, commit them, and reference locally. Fall back to a generated initial-letter avatar. |

---

## 8. Canonical Internal Model

The pipeline normalizes to this before aggregating. This model — not the raw export shape — is what aggregation and rendering code sees.

```ts
type ManagerId = string;   // = userId
type Year = number;

interface Manager {
  id: ManagerId;
  displayName: string;     // canonical, chosen once (see D2)
  slug: string;            // URL-safe
  seasons: Year[];
  teamsByYear: Record<Year, { teamId: string; teamName: string; avatar: string }>;
  succession?: { predecessorId?: ManagerId; successorId?: ManagerId; year: Year };
}

// Three values, and "playoff" is the Championship bracket only (D20).
type GameType = "regular" | "playoff" | "consolation";

interface GameSide {
  teamId: string;
  managerId: ManagerId;
  points: number;
  seed?: number;           // playoff games only
}

interface Game {
  matchupId: string;
  year: Year;
  week: number;
  type: GameType;
  round?: number;          // playoff games only
  roundLabel?: string;     // playoff games only, may be ""
  a: GameSide;
  b: GameSide;
  outcome: "a" | "b" | "tie";
  margin: number;          // absolute
}

interface Player { id: string; name: string; position: string; nflTeam?: string; }

interface Season {
  year: Year;
  regularSeasonWeeks: number;
  teamCount: number;
  divisions: Array<{ id: number; name: string }>;
  rosterSlots: Record<string, number>;
  scoring: { offense: Record<string, number>; kicking: Record<string, number>;
             dst: Record<string, number>; other: Record<string, string> };
  activeSlotTypes: string[];     // used by D7 to filter scoring display
  champion: ManagerId;
  runnerUp: ManagerId;
  lastPlace: ManagerId;
  regularSeasonWinner: ManagerId;
}
```

**Ordering rule:** `a`/`b` are ordered by ascending numeric `teamId`, matching `matchupId`. This is arbitrary but deterministic (NFR-9).

---

## 9. Metric Definitions

Every one of these is a decision that would otherwise be guessed. They belong in the spec, not in the code.

### 9.1 Scope split (decided)

All records, leaderboards, and H2H are computed **twice** and displayed **separately**, never merged:

- **Regular season** — `type === "regular"`
- **Playoffs** — `type === "playoff"`

**Consolation games are in neither scope** (D20). An earlier version of this section defined the second scope as `"championship" || "consolation"`, i.e. everything after the regular season. **The league has since ruled that wrong**: the 5th- and 7th-place bracket is not the playoffs, and a record set there is not a playoff record. Consolation games are still classified in the model — dropping them would hide the distinction — but no scope and no page uses them. They must never be folded into `regular` either, which would corrupt every regular-season W-L.

Rationale for the split: playoff samples are tiny and unevenly distributed (a manager who never made the bracket has no playoff games at all — Crazy caught carps has none in nine seasons), so blending them makes the all-time table misleading. Separating them is also what the league will actually argue about.

Prefer **playoff** over **postseason** in code, types, and page copy. "Postseason" naturally reads as "everything after week 15", which is precisely the ambiguity that produced the defect D20 records.

Where a single headline number is needed (e.g. a manager card), use the regular-season figure and label it.

### 9.2 Core metrics

| Metric | Definition |
|---|---|
| Win % | `(W + 0.5·D) / G` |
| PPG | `PF / G` — **primary metric for all cross-season comparison** |
| Total points | Shown, but always secondary to PPG (season lengths and league size differ across years) |
| Average margin | Mean of signed margin (positive = win) |
| PA-adjusted | PF − PA |

### 9.3 Luck index

`luckIndex = pointsForRank − finalRank` (both 1 = best). Positive = finished better than scoring deserved. Displayed on the season page with a one-sentence explanation. Simple and defensible; do not invent something more elaborate.

### 9.4 Records to compute

**Single game:** highest score, lowest score, biggest blowout, narrowest win, highest-scoring matchup (combined), most points in a loss, fewest points in a win.

**Single season:** best/worst record, most/fewest PF, best PPG, biggest PF-vs-finish discrepancy.

**Career:** championships, runner-up finishes, last-place finishes, playoff appearances, best/worst PPG, longest win streak, longest losing streak (streaks computed within a season, not across season boundaries — an offseason gap is not a streak).

### 9.5 Draft board and traded picks

Pick ownership at draft time is what `draft-history.json` records, so the board itself is always correct.

**Derived pick transfers: best-effort, cross-checked.** Compute the expected snake order, then diff each round against it. Cross-check the result against the **previous** season's `trade-history.json`.

**Do not take round 1 as the snake baseline.** Round 1 can itself contain a traded pick, in which case it is not a permutation of the ten teams and any order derived from it is corrupt. Measured: in **2023**, round 1 holds `teamId` 4 twice and no `teamId` 10 — team 4 acquired team 10's first-rounder. Round 2 reversed gives the clean order that year. Round 2 reversed matches round 1 in eight of nine seasons, and 2023 is the one where it does not; the safe derivation is to reconcile both directions and log the disagreement rather than trusting either blindly.

The two sources do not always agree. Verified on 2024 → 2025:

| Round | Trade file says | Draft order shows |
|---|---|---|
| R4, R8 | 7↔2 and 10↔6 | matches |
| R14, R15 | includes a 4↔5 swap | 4↔5 absent |
| R3, R5 | 5→4 swap | no deviation at all |

An entire 2024 trade between teams 5 and 4 never materialised in the 2025 draft — the same trade that carries `transactionWeek: 0` and a non-participant `transactionOwnerUserId`, plausibly reversed when that team's manager left the league.

**Rule: the draft order is authoritative** — it is what happened. The trade file records intent, which is useful for naming the counterparty. Annotate a pick as "acquired from <manager>" only where both sources agree. Log every disagreement to the validation report; annotate nothing where they conflict.

### 9.6 Optimal lineup (optional, FR-2a stretch)

If implemented: solve the best possible lineup from that week's roster under that season's slot rules. **`WRRB_FLEX` accepts WR, RB and TE (D19)** — excluding tight ends would understate the ceiling. Compare to actual for a "manager efficiency" figure. Positions are available from `players.json`, so this is unblocked. Slot eligibility must be read from that season's `rosterPositions` — early seasons may include K and DEF slots (D7).

---

### 9.7 Manager succession (derived, not hand-written)

The league has franchise turnover: a manager leaves and a new one inherits the team, keeping the same `teamId`. Confirmed for `teamId` 5 — Alex (`2035166`) in 2017, Christian (`19557057`) in 2025 — with at least one intermediate handover possible.

**Succession is derived from the data, never typed in.** The manager audit (D2) walks each `teamId` chronologically across 2017–2025 and reports every `userId` change, producing the true chain without anyone having to recall it. Hand-written succession notes are prohibited: recollection and the export have already disagreed once during specification.

**The measured chain, from `npm run audit:managers`:** `teamId` 5 is the only franchise that ever changed hands, and it did so **twice** — Alex (`2035166`) 2017–2018 → Christian (`21881840`) 2019–2024 → Christian (`19557057`) 2025. Every other `teamId` kept the same `userId` for all nine seasons. Confirmed by the league owner as three different people (§6.5).

**What the data cannot tell you.** A handover and an account change look identical in the export: both appear as a new `userId` on the same `teamId` in the next season, with no overlap. The two Christians even share a `managerName`. Whether two adjacent `userId`s are one human is therefore **always** a question for the league, never an inference — and the answer is recorded in §6.5 rather than derived.

**Rule: a manager is a person, not a franchise.** Each `userId` is a separate `Manager` with a separate career. Every record, leaderboard, win percentage, and H2H figure treats successive managers of the same `teamId` as unrelated people.

Rationale: an incoming manager inherits the outgoing manager's roster, keepers, and draft picks. Crediting that to their career record — or merging two people into one all-time row — produces numbers the league would reject. A person's record is their own.

The lineage is still displayed. The `Manager` model carries:

```ts
succession?: { predecessorId?: ManagerId; successorId?: ManagerId; year: Year };
```

Populated by the audit, rendered on the manager page as one line ("Took over the franchise from Alex, who managed 2017–20XX") and on the season page where the handover occurred. It never affects a computed statistic.

### 9.8 Keepers — values are computed, past keepers are not derived

Two different questions, with two different answers.

**Which players were kept in a past season — still out of scope, still not
derivable.** Keepers appear in the export as ordinary draft picks with no
distinguishing flag. The derivation heuristic was tested on 2024 → 2025 and
produced 40 candidates with 8 of 10 teams exceeding the 3-keeper limit. It does
not work, and nothing should try again.

**What a currently-rostered player costs to keep — computed, and shown at
`/keepers/`.** This is a stated rule rather than an inference, so it carries none
of the risk above:

| Case | Value | Source |
|---|---|---|
| Drafted in the season just ended | draft round − 1 | rulebook §10.2 |
| Drafted in round 1 | cannot be kept | rulebook §10.1 |
| Undrafted, last claimed off waivers | round 10 | rulebook §5.3 |
| Undrafted, last added as a free agent | round 12 | rulebook §7.1 |

Applied to the **end-of-season roster excluding IR** — every 2025 team has
exactly 15 such players (`ST` 90, `BN` 60, `RES` 8 across the league).

Two invariants that are easy to get backwards, both stated by the league:

- **Trades never change the value.** The draft is searched by `playerId` alone;
  the drafting team is irrelevant. 37 of the 106 drafted players on the 2025
  rosters are held by a team that did not draft them.
- **Drops never change it either.** A drafted player who was cut and later
  re-claimed still costs `round − 1`. The waiver/free-agent rule applies only to
  players who were *never* drafted.

**44 of the 150 players (29%) are undrafted and cannot be priced from the
export**, which has no waiver or free-agent history at all (D21). They are
supplied by `raw-data/<leagueFolder>/keeper-acquisitions.json`, captured from the
league's transaction log — 20 waiver claims and 24 free-agent pickups for 2025.
Any that were ever missing render "not recorded" and are **never** defaulted to
10 or 12: a plausible wrong round is worse than a visible gap in a league that
argues about these numbers.

**"Last" acquisition is load-bearing and was verified against the live log.** 39
players in 2025 have mixed waiver/free-agent histories, and the newest claim is
the one that prices them — Cade Otton went waiver (wk 7) → waiver (wk 8) → free
agent (wk 11) and is worth a 12th, while Malik Washington went free agent (wk 5)
→ waiver (wk 11) and is worth a 10th. All 39 derive correctly.

Not implemented: rulebook §5.3 prices a team's *second* waiver keeper at round 9
and its *third* at round 8, plus a collision rule when a drafted keeper shares a
round with a waiver keeper. Both depend on which players a team *chooses* to
keep — a decision made at the keeper deadline, not data — so each player is
priced standalone and the page says so.

## 10. Page Inventory

| Route | Content | JS required |
|---|---|---|
| `/` | Championship roll of honour, all-time leaders summary, links | No |
| `/seasons/` | Index 2017–2025 with champion and record per year | No |
| `/seasons/<year>/` | Regular-season table, final standings, week-by-week results, playoff bracket, season awards, settings summary | Only for box-score expansion |
| `/seasons/<year>/draft/` | Full draft board | No |
| `/managers/` | Manager index | No |
| `/managers/<slug>/` | Career page (FR-9) | No |
| `/keepers/<slug>/` | Keeper values for the coming season, from the latest end-of-season roster (§9.8). No year in the URL — only the next season's values exist at a time | No |
| `/h2h/` | Manager-vs-manager matrix + pair detail | **Yes** |
| `/records/` | All-time leaderboards and records, both scopes | Only for table sorting |
| `/trades/` | Trade log, all seasons, filterable by year | Only for filtering |
| `/about/` | Data source, known gaps, validation summary | No |

All JS is progressive enhancement (NFR-7): the underlying data is rendered in HTML; JS only reorders, filters, or lazy-loads detail.

---

## 11. Architecture

### 11.1 Decision: build-time HTML pre-rendering

The pipeline emits **finished HTML**, not JSON for the client to render.

Rationale:
- The data is fully known at build time and never changes at runtime. Rendering it in the browser adds fetch/loading/error handling to every page for zero benefit.
- Less client code = fewer places for AI-generated bugs, and a much shorter feedback loop when debugging.
- Satisfies NFR-5 and NFR-7 without effort.

Trade-off accepted: templating lives in the pipeline, and a data change requires a rebuild. Since the pipeline already has to run to aggregate, this costs nothing.

**Rejected alternative (v1 approach):** client fetches pre-aggregated JSON and renders in TypeScript. The v1 rationale for pre-aggregating — avoiding "expensive client-side aggregation" — was wrong; the league-level dataset is under 1 MB total for nine seasons. The real reasons to pre-compute are determinism and testability, and those are better served by also pre-rendering.

### 11.2 Pipeline stages

```
raw-data/  →  [1 load+validate]  →  [2 normalize]  →  [3 aggregate]  →  [4 render]  →  docs/
                      ↓                    ↓                ↓
                 validation report (docs/_validation.json + console summary)
```

1. **Load + validate** — parse every file, check against the §6.2 schemas. Unknown fields are logged, not fatal (the export shape may drift across years). Missing required fields are fatal.
2. **Normalize** — build the manager registry (D1, D2), classify games (D4, D5), materialize `year`/`week` on player stats, resolve player names, filter dead scoring settings (D7). Output: the §8 canonical model. **This stage must not know anything about pages or presentation.**
3. **Aggregate** — compute §9 metrics into the §11.3 output structures. Pure functions over the canonical model, no I/O. This is where unit tests go.
4. **Render** — templates → static HTML + copy CSS + compiled JS + emit the small JSON files that JS needs.

Stage separation matters more than usual here: nine years of exports from a platform that redesigned itself will contain per-year weirdness, and it must be absorbed in stage 2 rather than smeared through stages 3 and 4.

### 11.3 Emitted data files (for the JS-enhanced pages only)

| File | Size est. | Consumer |
|---|---|---|
| `docs/data/h2h.json` | ~80 KB | `/h2h/` matrix, both scopes |
| `docs/data/managers.json` | ~5 KB | `/h2h/` selector |
| `docs/data/week/<year>-<week>.json` | ~150 KB | box-score expansion, lazy-loaded on click |
| `docs/_validation.json` | small | `/about/` |

`player-matchup-statistics-history.json` (~9 MB across all seasons) is **never shipped whole**. It is split per season-week and loaded only on demand.

### 11.4 Frontend stack

- Plain HTML + CSS + TypeScript 7, no framework, no bundler.
- **No bundler means native ES modules.** Relative imports in TS source must be written with the `.js` extension: `import { x } from "./h2h.js"`. This is the single most common failure mode for generated code in this setup.
- TypeScript 7.0 (GA July 2026) has **strict mode as a hard default**. Do not fight it; type the data model properly.
- CSS: one stylesheet, custom properties for theming, mobile-first, no framework. Tables collapse to card layout below 600 px.

### 11.5 Repository layout

```
/raw-data/                  committed, read-only input
/pipeline/                  TypeScript, runs on Node
  /load/  /normalize/  /aggregate/  /render/  /templates/
/src/web/                   browser TypeScript (h2h, sorting, lazy-load)
/src/styles/                CSS
/docs/                      generated output — COMMITTED (GitHub Pages serves it)
/CLAUDE.md
/requirements-specification.md
tsconfig.pipeline.json
tsconfig.web.json
```

### 11.6 Hosting: GitHub Pages (decided)

The repository and CI are already there; one fewer account and one fewer moving part. Cloudflare Pages is marginally faster on cold cache and irrelevant at this traffic level. `docs/` is committed and served directly; a GitHub Action rebuilds on push to `main`.

---

## 12. Visual Design System

Direction: **dark NFL broadcast graphics.** Black canvas, NFL navy as a structural surface, NFL red as the single accent, medal colours for placings. Dense and legible rather than decorative.

**Mobile is the primary target.** The site will be opened from a phone in a group chat far more often than on a desktop. All CSS is written mobile-first; desktop is the enhancement, not the baseline.

### 12.1 Tokens

All colours are CSS custom properties. **No hardcoded hex outside this block.**

```css
:root {
  --bg:          #0A0A0B;   /* page canvas */
  --surface:     #131316;   /* cards, bottom nav */
  --surface-2:   #1B1B1F;   /* hover, elevated rows */
  --line:        #26262B;   /* all borders, always hairline */

  --text:        #F2F1EE;
  --text-muted:  #9C9C98;
  --text-on-navy:#9CB4D4;   /* muted text inside the navy band */

  --navy:        #0D2B4E;   /* nav band, section headers — SURFACE ONLY */
  --navy-line:   #1D4F91;   /* navy borders and dividers */
  --red:         #E8483A;   /* links, active nav, champion name */
  --red-bg:      #3A1512;   /* tint for the last-place pill */
  --red-text:    #F09590;   /* text on --red-bg */

  --gold:   #D4A24C;  --on-gold:   #3A2A08;
  --silver: #B8B8B4;  --on-silver: #26262B;
  --bronze: #C08552;  --on-bronze: #31190A;

  --pos:    #7DBB4A;        /* winning margin */
  --neg:    #E8483A;        /* losing margin, last place */

  --radius: 8px;
  --line-w: 0.5px;
  --tap:    44px;           /* minimum touch target */
}
```

**Why the NFL colours are adjusted:** the official brand navy `#013369` and red `#D50A0A` both fail contrast as text on black — navy is effectively invisible, red sits around 3.5:1. So navy is used **only as a surface** (nav band, section headers), where it reads unmistakably NFL, and the red is lightened to `#E8483A` (~6:1) for text and links. Do not "correct" these back to the official hex values.

The site is dark-only. There is no light mode and no `prefers-color-scheme` block — one theme, fewer ways to break.

### 12.2 Typography

- System font stack only. No web fonts, no network request for text.
  `font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- Two weights: 400 regular, 500 for emphasis. Never 600 or 700 — heavy weights bloom badly on black.
- Sizes (mobile → desktop): page title 20 → 22px, section 17 → 18px, body 14 → 15px, table 13px, metadata 11px. **Never below 11px.**
- **`font-variant-numeric: tabular-nums` on every numeric cell.** Non-aligning digits in a standings table is the single most common polish failure.
- Sentence case everywhere.

### 12.3 Responsive rules

| Breakpoint | Layout |
|---|---|
| Base (mobile-first, < 600px) | Single column, 14px side padding, standings as stacked cards, **bottom navigation bar** |
| ≥ 600px | Standings become real tables, side padding 24px |
| ≥ 900px | Content max-width 960px centred, **navigation moves to a top band** |

Concrete requirements:

- **Tables render as real tables whenever they fit, and collapse to stacked cards when they do not.** Each table measures **its own container** with a CSS container query rather than the viewport, because the tables differ enormously in width: a 3-column draft board needs ~235px while the 8-column all-time table needs ~457px. A single 600px breakpoint hid tables that had plenty of room. Thresholds, with headroom over measured content: `t-narrow` 300px (draft board, career row), `t-medium` 350px (most-started players), `t-wide` 405px (head-to-head, season standings), `t-widest` 470px (all-time). Wrap a table in `<div class="table-wrap t-*">`; the card layout is the default and the query only overrides custom properties, so the layout rules exist **once** and cannot drift between breakpoints. **Still never a horizontally scrolling standings table** — cards remain the fallback, and the H2H matrix is the only element allowed to scroll (that page is not built yet).
- **The H2H matrix is the only element allowed to scroll horizontally**, and it must have a sticky first column.
- **All interactive targets ≥ 44px** (`--tap`). Nav items, sortable table headers, expandable week rows.
- Navigation is the same markup at both sizes — only CSS moves it from bottom bar to top band. No duplicated nav in the DOM.
- **Bottom nav holds 7 items: Home, Seasons, Drafts, Teams, Keepers, All-time, Rulebook.** The original guidance was a maximum of 5, with the rest living on the pages they belong to; it has now been relaxed twice on request — Drafts and Keepers are both top-level sections people expect in the nav rather than something to find on another page. The bar's type drops from 13px to 12px below 900px.
- **The seventh item is the one that broke a single row, exactly as this section predicted.** "All-time" and "Rulebook" need ~50px each, and 7 × 50 overflows 360px. The answer is **not** a smaller font — 11px is the floor (§12.2) — and not an abbreviation. Mobile-first, the base layout is a **4-column grid**, wrapping seven items to 4 + 3, each cell keeping its own ≥44px target; from **380px** it becomes a single flex row, which covers every common phone (390/412/430). Only 360px and below see two rows, and `body` padding-bottom tracks the taller bar. Still one set of markup — CSS alone moves it.
- Test at 360px width. That is the realistic floor.

### 12.4 Component rules

| Element | Rule |
|---|---|
| Nav band / bar | `--navy` background, active item in `--red`, inactive in `--text-on-navy` |
| Tables | Hairline row separators only. No zebra striping, no vertical rules, no outer border. Numbers right-aligned. |
| Ranks 1–3 | 20–22px filled circle in the medal colour with matching `--on-*` text |
| Ranks 4+ | Plain `--text-muted` number, no circle |
| Last place | Small pill, `--red-bg` background, `--red-text` text |
| Win/loss | Colour the margin, not the row. Rows stay neutral. |
| Champion | Name in `--red`. The only decorative use of the accent outside navigation. |
| Cards | `--surface`, `0.5px solid --line`, `12px` radius, **no shadow** — shadows are invisible on black anyway |
| Avatars | 24px circular, vendored image (D10), fallback to initial on `--surface-2` |

### 12.5 Prohibited

No gradients, no drop shadows, no blur, no glow, no neon. No animation beyond hover/focus colour transitions. No carousels, no hero images, no icon libraries, no emoji, no skeleton loaders. No light mode.

## 13. Implementation Details

Mechanical decisions that would otherwise be guessed. None are interesting; all of them cost a debugging session if left open.

### 13.1 Language and formatting

- **Site language: English.** All UI copy, headings, and labels. Team and manager names are data and appear exactly as exported.
- **`<html lang="en">`.**
- **Number formatting is pinned, never locale-dependent.** `toLocaleString()` without an explicit locale renders 1848.60 as `1.848,60` on a German browser — the league would see different formats depending on device. Use `new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`, created once and reused.
- Points: always 2 decimals. Percentages: 1 decimal. Records: `12–3` with an en dash.
- **Dates**: `transactionDate` is ISO-8601 without timezone (D-quirk). Parse as local, format as `DD.MM.YYYY`, never convert.

### 13.2 Hosting mechanics

- **The output directory is `docs/`, not `dist/`.** GitHub Pages offers exactly two source folders for a branch — the repository root or `docs/` — and nothing else is selectable, so this is the platform's constraint rather than a naming preference. `OUTPUT_DIR` in [pipeline/paths.ts](pipeline/paths.ts) is the only place the directory is named; `VALIDATION_REPORT`, the renderer, the avatar copy step and `npm run serve` all derive from it. Note that the name collides with the everyday meaning of "docs" — `requirements-specification.md` and `CLAUDE.md` are the actual documentation and live at the repository root.
- **Decided: custom domain at the root.** The site serves from `https://www.failmaryfisters.com/`, so **`BASE_PATH` is `/`**. It began as a GitHub project site on `DavidGro23/FailMaryFisters` where `BASE_PATH` was `/FailMaryFisters/`; the domain change is the only difference. Every emitted URL — pages, CSS, JSON fetched by `src/web/`, and the §6.5 retired-slug redirects — is still constructed through `url()` in [pipeline/render/base-path.ts](pipeline/render/base-path.ts). **The constant is kept even though it is now a single slash**, because a literal `/seasons/2025/` is correct today and would break silently if the site moved back under a prefix — a project site again, a staging path, a second league. The indirection costs nothing and makes the reverse a one-line change. `npm run serve` mounts `docs/` at the same base so a mismatch still surfaces in development.
- **`docs/CNAME` is required, containing `www.failmaryfisters.com`.** GitHub Pages reads it to decide which host the site answers on. It is emitted by the build from `CUSTOM_DOMAIN` rather than hand-placed, because `docs/` is generated output: a CNAME lost to a clean rebuild reverts the site to `davidgro23.github.io` with no error, breaking every link already shared. DNS itself is configured outside this repository — a `CNAME` record for `www` pointing at `davidgro23.github.io`.
- **`docs/.nojekyll` is required.** GitHub Pages runs Jekyll by default, which silently drops files and folders beginning with an underscore. Without it, `docs/_validation.json` will not exist in production and there will be no error.
- **`docs/robots.txt`** with `Disallow: /`, plus `<meta name="robots" content="noindex">`. The site is public because it needs no login, not because it wants an audience. Unlisted is the intent.
- `docs/` is committed. A GitHub Action rebuilds on push to `main` and fails the build on any hard validation error.

### 13.3 Rendering

- **Templating: plain tagged template literals**, no template engine, no dependency.
- **An escaping helper is mandatory.** Player names contain apostrophes (`Ja'Marr Chase`, `De'Von Achane`) and team names are free text. Every interpolated value passes through `esc()` — escaping `& < > " '` — before reaching HTML. Not a security concern here, but a correctness one.
- Emit one HTML file per route as `<route>/index.html` so URLs need no extension.
- **Never re-sort standings.** `regular-season-standings-history.json` provides `overallRank` with the league's own tiebreak already applied; 2025 has three teams at 7-8. Render in the given rank order. Client-side sorting is a view toggle only and never changes the default.

### 13.4 Tooling

- **Node's built-in test runner** (`node --test`, `node:test`). No vitest, no jest, no test framework dependency.
- **Zero runtime dependencies in `src/web/`.** Pipeline dev-dependencies are acceptable but should stay near zero.
- Two tsconfigs (`tsconfig.pipeline.json`, `tsconfig.web.json`), both strict, per §11.4.
- `package.json` scripts match the command list in `CLAUDE.md` exactly.

## 14. Open Items

| # | Item | Blocks |
|---|------|--------|
| 1 | ~~Confirm `players.json`~~ — **resolved**, see §6.3. ~~Verify coverage for 2017–2024~~ — **resolved by the stage-1 run: four missing ids in total** (2017, 2018, 2019, 2024) | — |
| 2 | ~~Run the manager audit (D2) over 2017–2025 and confirm `userId` stability~~ — **resolved**: `npm run audit:managers` reports 12 distinct userIds, one renamer (Benjamin), one managerName collision (the two Christians), and two handovers, all on `teamId` 5 | — |
| 3 | ~~Confirm league size and division structure for 2018–2024~~ — **resolved: all nine seasons are 10 teams in a single division named "Regular Season".** Regular-season length is 15 weeks except 2018–2020, which are 14 | — |
| 4 | ~~Is this a keeper/dynasty league?~~ — **resolved**: redraft in 2017, keepers max 3 from 2018 (§6.4). Keepers remain out of scope (§9.8) | — |
| 5 | ~~Are early exports structurally identical?~~ — **resolved: all nine seasons verified. Field names are identical in every year for all ten files; no schema drift, only content drift.** | — |
| 8 | ~~Identify the exact season in which K and DEF slots were dropped and the IR slot added~~ — **resolved: K dropped 2019, IR added 2020, DEF dropped 2025** (D7) | — |
| 9 | Approve the §12 dark NFL theme, or adjust the navy/red balance | Stage 4 |
| 10 | ~~Manager succession semantics~~ — **resolved**: derived from the data (§9.7), person-not-franchise model | — |
| 11 | ~~Keeper or dynasty rules~~ — **resolved**: redraft 2017, keepers max 3 from 2018 (§6.4) | — |
| 12 | ~~Validate the keeper heuristic~~ — **tested and failed** (§9.8). Keepers are out of scope | — |
| 14 | ~~Distinguishing names for the two Christians~~ — **resolved**: display name is the latest team name (§6.5) | — |
| 13 | Populate `league-rules.json` (§6.4) with trade deadline and waiver type per season, if wanted | FR-8 |
| 6 | Decide whether §9.6 optimal lineup is in v1 scope (now unblocked — positions available; note the D16 slot-name mapping is required for it) | FR-2a |
| 7 | ~~Determine in which seasons K and DEF slots were in use~~ — **resolved: K in 2017–2018, DEF in 2017–2024** (D7) | — |
| 15 | Decide the display treatment on `/about/` for the **7** genuinely unreconciled team-games that remain after the D17 sign correction — one summary line, or a full list | Stage 4 |
| 16 | Decide where `def_st_td = 6` lives so the pipeline can read it (D12): a `league-rules.json` field, a documented constant, or a `dstSettings` overlay. It is league knowledge, not exported data | Stage 2 |
