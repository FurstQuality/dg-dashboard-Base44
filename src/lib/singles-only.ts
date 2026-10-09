/**
 * Singles-only guard for scoring and course analytics.
 *
 * Imported rounds (PDGA, Disc Golf Scene, UDisc) frequently carry doubles,
 * best-shot, or team cards. UDisc CSVs have no format column at all, so those
 * cards land as `format = "singles"` unless the importer catches them. Every
 * analytics path must therefore also read the human labels — layout, event,
 * and division names — before trusting a round as a solo score.
 *
 * Keep this the single source of truth: never re-declare these rules locally.
 */

/**
 * Deliberately plural on "doubles": layout names like "Double Main" mean two
 * loops of the main course, not doubles play, and must stay in the analytics.
 * "Match play" is singles head-to-head, so it is not listed here either.
 */
const TEAM_PLAY =
  /\bdoubles\b|\bdubs\b|\bteams?\b|\bpairs\b|\btandem\b|\bdouble[s]?\s+(?:play|league|night|round)\b|best shot|best throw|best disc|worst shot|scramble|alternate shot/;

/** True when any stored label describes team, doubles, or best-shot play. */
export function isTeamPlay(...labels: Array<string | null | undefined>): boolean {
  const text = labels.filter(Boolean).join(" ").toLowerCase();
  if (!text) return false;
  return TEAM_PLAY.test(text);
}

/** Shape shared by every imported-round row analytics reads. */
export type ExternalRoundLabels = {
  format?: string | null;
  layout_name?: string | null;
  event_name?: string | null;
  division?: string | null;
};

/**
 * True when an imported round can be trusted as a verified solo round:
 * the stored format says singles AND no label hints at team play.
 */
export function isSinglesExternalRound(row: ExternalRoundLabels): boolean {
  if ((row.format ?? "singles") !== "singles") return false;
  return !isTeamPlay(row.layout_name, row.event_name, row.division);
}

/** True when an in-app round was scored solo (not doubles or a team card). */
export function isSinglesAppRound(row: {
  play_format?: string | null;
  team_size?: number | null;
}): boolean {
  if ((row.play_format ?? "singles") !== "singles") return false;
  return row.team_size == null || row.team_size <= 1;
}
