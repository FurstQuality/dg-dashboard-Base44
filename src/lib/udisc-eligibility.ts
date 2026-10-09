/**
 * UDisc round preservation rule. Pure classifier shared by the importer and
 * the DGD shadow pipeline. Only SINGLES_MULTI_PLAYER UDisc rounds may become
 * DGD-rating evidence; native UDisc ratings are stored and shown untouched.
 */
export const UDISC_FORMAT_CLASSES = [
  "SINGLES_MULTI_PLAYER",
  "SINGLES_SOLO",
  "DOUBLES",
  "TEAM",
  "UNKNOWN_FORMAT",
] as const;
export type UdiscFormatClass = (typeof UDISC_FORMAT_CLASSES)[number];

export const UDISC_EVENT_CONTEXTS = [
  "LEAGUE",
  "TOURNAMENT",
  "CASUAL_MULTI_PLAYER",
  "OTHER_MULTI_PLAYER",
  "UNKNOWN_EVENT_TYPE",
] as const;
export type UdiscEventContext = (typeof UDISC_EVENT_CONTEXTS)[number];

export type ParticipantCountSource = "SOURCE" | "CARD_INFERRED" | "UNKNOWN";
export type UdiscExclusionReason = "SOLO_ROUND" | "TEAM_OR_DOUBLES" | "UNKNOWN_FORMAT";

export type UdiscClassifyInput = {
  format: "singles" | "doubles" | "team" | string | null;
  /** Count stated by the source, if any. */
  sourceParticipantCount?: number | null;
  /** Distinct individual players seen on the scorecard, if known. */
  cardParticipants?: number | null;
  eventName?: string | null;
  layoutName?: string | null;
};

export type UdiscClassification = {
  format_class: UdiscFormatClass;
  participant_count: number | null;
  participant_count_source: ParticipantCountSource;
  event_context: UdiscEventContext;
  exclusion_reason: UdiscExclusionReason | null;
};

const LEAGUE_RE = /\b(league|weekly|glow|bag\s*tag|tag\s*night|doubles\s*night|night)\b/i;
const TOURNEY_RE = /\b(open|classic|championship|tournament|invitational|cup|am\s*series)\b/i;

export function classifyUdiscRound(i: UdiscClassifyInput): UdiscClassification {
  const src = i.sourceParticipantCount != null && i.sourceParticipantCount > 0 ? i.sourceParticipantCount : null;
  const card = i.cardParticipants != null && i.cardParticipants > 0 ? i.cardParticipants : null;
  const participant_count = src ?? card;
  const participant_count_source: ParticipantCountSource = src ? "SOURCE" : card ? "CARD_INFERRED" : "UNKNOWN";
  const fmt = (i.format ?? "").toLowerCase();

  let format_class: UdiscFormatClass;
  if (fmt === "team") format_class = "TEAM";
  else if (fmt === "doubles") format_class = "DOUBLES";
  else if (fmt === "singles") {
    // Never assume multiplayer when evidence is absent.
    format_class = participant_count == null ? "UNKNOWN_FORMAT" : participant_count >= 2 ? "SINGLES_MULTI_PLAYER" : "SINGLES_SOLO";
  } else format_class = "UNKNOWN_FORMAT";

  const text = `${i.eventName ?? ""} ${i.layoutName ?? ""}`;
  let event_context: UdiscEventContext = "UNKNOWN_EVENT_TYPE";
  if (format_class === "SINGLES_MULTI_PLAYER") {
    event_context = LEAGUE_RE.test(text) ? "LEAGUE" : TOURNEY_RE.test(text) ? "TOURNAMENT" : "CASUAL_MULTI_PLAYER";
  }

  const exclusion_reason: UdiscExclusionReason | null =
    format_class === "SINGLES_MULTI_PLAYER"
      ? null
      : format_class === "SINGLES_SOLO"
        ? "SOLO_ROUND"
        : format_class === "UNKNOWN_FORMAT"
          ? "UNKNOWN_FORMAT"
          : "TEAM_OR_DOUBLES";

  return { format_class, participant_count, participant_count_source, event_context, exclusion_reason };
}

export function isUdiscRatingEligible(formatClass: string | null | undefined): boolean {
  return formatClass === "SINGLES_MULTI_PLAYER";
}

/** Valid native UDisc round ratings. Anything outside is a bad value and is stored as unrated. */
export const UDISC_RATING_MIN = 150;
export const UDISC_RATING_MAX = 350;
export function validUdiscRating(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= UDISC_RATING_MIN && r <= UDISC_RATING_MAX ? r : null;
}
