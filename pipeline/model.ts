/**
 * The canonical model — the shape aggregation and rendering see, instead of the
 * raw export.
 *
 * Deliberately partial. This is the thin-slice subset needed to render one
 * season's regular-season standings table, not the full §8 model. Types are
 * added here as pages come to need them; an unused type is an unverified one.
 */

/** A manager is identified by `userId`, never by `teamId` or `managerName` (D1, D14). */
export type ManagerId = string;
export type Year = number;

export interface SeasonTeam {
	teamId: string;
	teamName: string;
	/**
	 * Path of the vendored avatar within the site's assets, or absent when the
	 * manager had none that season. Never a remote URL — avatars are downloaded
	 * once and referenced locally (rule 19, D10).
	 */
	avatar?: string;
}

export interface Manager {
	id: ManagerId;
	/**
	 * The manager's most recent team name, used on every page including
	 * historical ones (§6.5, D15). Derived across all seasons, not from the
	 * season being rendered.
	 */
	displayName: string;
	/**
	 * URL slug. Frozen in `manager-aliases.json` and never regenerated from the
	 * display name — a rename must not break a link already shared (§6.5, D16).
	 */
	slug: string;
	/**
	 * The most recent avatar this manager ever used, shown on every page
	 * regardless of which season is displayed — the same rule the display name
	 * follows (D15). Early seasons are sparse (only 4 of 10 managers had an
	 * avatar in 2017), so using the season's own would leave historical tables
	 * mostly blank and show people a picture they replaced years ago.
	 *
	 * Absent only if the manager never set one in any season.
	 */
	latestAvatar?: string;
	/**
	 * What this manager's team was called and looked like, per season (§8).
	 * The per-season avatar is retained as a record of what was used at the time;
	 * `latestAvatar` is what gets displayed.
	 */
	teamsByYear: Record<Year, SeasonTeam>;
}

/**
 * One row of a season's regular-season standings, exactly as the league recorded
 * it. Every figure here comes from `regular-season-standings-history.json`;
 * nothing is derived from game or player scores.
 */
export interface StandingRow {
	managerId: ManagerId;
	/** Season-scoped. Kept for traceability; never used as an identity (D1). */
	teamId: string;
	/** The league's own rank, tiebreaks already applied. Never re-sorted (§13.3). */
	overallRank: number;
	wins: number;
	losses: number;
	draws: number;
	pointsFor: number;
	pointsAgainst: number;
}

export interface SeasonStandings {
	year: Year;
	/** Derived per season as `wins + losses + draws` (D5). Never hardcoded. */
	regularSeasonWeeks: number;
	/** In `overallRank` order. */
	rows: StandingRow[];
}

export interface PlayoffSide {
	managerId: ManagerId;
	teamId: string;
	/** Playoff seed, 1–4. */
	seed: number;
	points: number;
}

export interface PlayoffGame {
	week: number;
	/**
	 * The label the export gave this game. Rendered as-is, but **never matched
	 * on** — the title game is "Championship" in 2017–2018 and "Fantasy Super
	 * Bowl" from 2019 (D11). Position in the bracket is derived from `round` and
	 * `bracketType` instead.
	 */
	roundLabel: string;
	a: PlayoffSide;
	b: PlayoffSide;
	/** The winning side. No playoff game in nine seasons has been tied. */
	winner: ManagerId;
}

/**
 * The championship bracket: two semifinals, then the final and the third-place
 * game. The consolation bracket is loaded but not modelled here — no page shows
 * it yet.
 */
export interface PlayoffBracket {
	semifinals: PlayoffGame[];
	final: PlayoffGame;
	thirdPlace?: PlayoffGame;
}

/**
 * Regular season and playoffs are never merged — not in H2H, not in
 * leaderboards, not in any record (rule 7, §9.1).
 *
 * **Three values, not two.** `playoff-history.json` holds two brackets, and
 * "after the regular season" is not the same thing as "a playoff game". The
 * league counts only the `Championship` bracket — semifinals, the final, and the
 * third-place game — as playoffs. The `Consolation` bracket (its first round,
 * plus the 5th- and 7th-place games) decides finishing order among teams that
 * did not qualify, and the league does not regard those as playoff games.
 *
 * They are `consolation` rather than `regular`, because folding them into the
 * regular season would corrupt every regular-season record and W-L. They are
 * kept in the model rather than dropped so the distinction stays visible and
 * checkable; no page currently shows them.
 *
 * The old two-value type made `postseason` mean "in playoff-history.json at
 * all", which silently put a 7th-place game into the playoff records.
 */
export type GameType = "regular" | "playoff" | "consolation";

/** One team's side of one game. Every game produces two of these. */
export interface TeamGame {
	year: Year;
	week: number;
	type: GameType;
	managerId: ManagerId;
	points: number;
	opponentId: ManagerId;
	opponentPoints: number;
}

/**
 * One player's appearance in one game, with the score already sign-corrected
 * (D17). `started` distinguishes a lineup slot from merely being rostered.
 *
 * `year` and `week` are materialized here from `matchupId`, which is the only
 * place they exist in the raw file — nothing downstream parses that string
 * again (D-parse / rule 10).
 */
export interface PlayerGame {
	year: Year;
	week: number;
	type: GameType;
	managerId: ManagerId;
	playerId: string;
	playerName: string;
	started: boolean;
	points: number;
}

export interface DraftPick {
	/** Round, 1-15. A team can hold two picks in one round and none in another. */
	round: number;
	/** Overall pick number across the whole draft, 1-150. Not within-round. */
	overall: number;
	managerId: ManagerId;
	playerId: string;
	playerName: string;
}

export interface SeasonDraft {
	year: Year;
	rounds: number;
	/** Every pick, in overall order. */
	picks: DraftPick[];
}

export type TradeItem =
	| { kind: "player"; playerId: string; playerName: string }
	| { kind: "pick"; year: Year; round: number };

/** One direction of a trade: what this manager sent to that one. */
export interface TradeLeg {
	fromId: ManagerId;
	toId: ManagerId;
	items: TradeItem[];
}

export interface Trade {
	year: Year;
	/** ISO-8601 without timezone. Treated as local, never converted (§13.1). */
	date: string;
	/** Can be 0 — a preseason or post-deadline move (D13). */
	week: number;
	/** Every manager on either side of any leg. Measured: always exactly two. */
	participantIds: ManagerId[];
	legs: TradeLeg[];
}
