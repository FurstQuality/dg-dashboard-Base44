import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/** Post kinds the feed renders. Mirrors the composer's PostType union. */
export type SharePostType = "text" | "photo" | "ace" | "checkin" | "roundcard" | "tournament";

export type ShareVisibility = "public" | "friends" | "club";

/**
 * A one-click feed post prepared by a tool elsewhere in the app.
 * Tools build the draft; the shared button/bar handles auth, insert, and toasts.
 */
export type ShareDraft = {
  type: SharePostType;
  /** Prefilled post text. Editable in the share dialog. */
  body: string;
  courseName?: string | null;
  location?: string | null;
  /** Structured payload rendered by the post card (round, event, rating, duel). */
  scoreData?: Json | null;
  clubId?: string | null;
  visibility?: ShareVisibility;
};

/** Inserts a post for the signed-in user. Returns the new post id. */
export async function shareToFeed(draft: ShareDraft): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in to share to the feed.");

  const visibility: ShareVisibility = draft.clubId
    ? (draft.visibility ?? "club")
    : draft.visibility === "club"
      ? "friends"
      : (draft.visibility ?? "public");

  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: userId,
      club_id: draft.clubId ?? null,
      visibility,
      type: draft.type,
      body: draft.body.trim() || null,
      location: draft.location ?? null,
      media: [],
      course_name: draft.courseName ?? null,
      score_data: draft.scoreData ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const par = (toPar: number | null | undefined) =>
  toPar === null || toPar === undefined
    ? ""
    : toPar === 0
      ? "even"
      : toPar > 0
        ? `+${toPar}`
        : `${toPar}`;

/** Draft for "Post last round". */
export function roundDraft(round: {
  course_name: string | null;
  layout_name?: string | null;
  event_name?: string | null;
  played_on: string | null;
  score: number | null;
  to_par: number | null;
  round_rating?: number | null;
}): ShareDraft {
  const course = round.course_name ?? "the course";
  const scoreBit =
    round.score !== null ? `${round.score} (${par(round.to_par)})` : par(round.to_par);
  const ratingBit = round.round_rating ? ` · ${round.round_rating} rated round` : "";
  return {
    type: "roundcard",
    body: `Shot ${scoreBit} at ${course}${round.event_name ? ` during ${round.event_name}` : ""}.${ratingBit}`,
    courseName: round.course_name,
    scoreData: {
      total: round.score,
      to_par: round.to_par,
      rating: round.round_rating ?? null,
      played_on: round.played_on,
      event_name: round.event_name ?? null,
      layout_name: round.layout_name ?? null,
    },
  };
}

/** Draft for "Post ratings update". */
export function ratingDraft(input: {
  rating: number | null;
  label?: string;
  change?: number | null;
  roundsCounted?: number | null;
}): ShareDraft {
  const label = input.label ?? "DGD Rating";
  const move =
    input.change === null || input.change === undefined || input.change === 0
      ? "holding steady"
      : input.change > 0
        ? `up ${input.change}`
        : `down ${Math.abs(input.change)}`;
  return {
    type: "text",
    body: `${label} update: ${input.rating ?? "—"} (${move})${input.roundsCounted ? ` across ${input.roundsCounted} counted rounds` : ""}.`,
    scoreData: { rating: input.rating, rating_label: label, rating_change: input.change ?? null },
  };
}

/** Draft for sharing a community outreach event. */
export function eventDraft(event: {
  id: string;
  title: string;
  kind?: string | null;
  location?: string | null;
  starts_at?: string | null;
}): ShareDraft {
  const when = event.starts_at
    ? new Date(event.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  return {
    type: "tournament",
    body: `${event.title}${when ? ` · ${when}` : ""}${event.location ? ` · ${event.location}` : ""} — come join us.`,
    location: event.location ?? null,
    scoreData: { event_name: event.title, event_id: event.id, event_kind: event.kind ?? null },
  };
}

/** Draft for sharing a Friends Arena duel result. */
export function duelDraft(input: {
  title: string;
  arena?: string | null;
  won: boolean;
  opponent?: string | null;
  wagerXp?: number | null;
}): ShareDraft {
  return {
    type: "text",
    body: `${input.won ? "Won" : "Played"} the ${input.title} challenge${input.opponent ? ` against ${input.opponent}` : ""}${
      input.wagerXp ? ` for ${input.wagerXp} XP` : ""
    }.`,
    scoreData: {
      duel_title: input.title,
      arena: input.arena ?? null,
      result: input.won ? "win" : "played",
      wager_xp: input.wagerXp ?? null,
    },
  };
}

/** Draft for sharing a tournament / PDGA face-off result. */
export function resultDraft(input: {
  eventName: string;
  division?: string | null;
  place?: number | null;
  toPar?: number | null;
  fieldSize?: number | null;
  courseName?: string | null;
}): ShareDraft {
  const placeBit = input.place
    ? `Finished ${ordinal(input.place)}${input.fieldSize ? ` of ${input.fieldSize}` : ""}`
    : "Played";
  return {
    type: "tournament",
    body: `${placeBit} at ${input.eventName}${input.division ? ` (${input.division})` : ""}${
      input.toPar !== null && input.toPar !== undefined ? ` at ${par(input.toPar)}` : ""
    }.`,
    courseName: input.courseName ?? null,
    scoreData: {
      event_name: input.eventName,
      division: input.division ?? null,
      place: input.place ?? null,
      field_size: input.fieldSize ?? null,
      to_par: input.toPar ?? null,
    },
  };
}

function ordinal(n: number) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Draft for "Post practice session" (range reps or putting green work). */
export function practiceDraft(input: {
  kind: "range" | "putting";
  reps: number;
  makePct?: number | null;
  location?: string | null;
  startedAt?: string | null;
}): ShareDraft {
  const isRange = input.kind === "range";
  const repBit = isRange ? `${input.reps} throws on the range` : `${input.reps} putts on the green`;
  const makeBit =
    input.makePct !== null && input.makePct !== undefined ? ` at ${input.makePct}% made` : "";
  return {
    type: "text",
    body: `Practice session logged: ${repBit}${makeBit}${input.location ? ` at ${input.location}` : ""}.`,
    location: input.location ?? null,
    scoreData: {
      practice_kind: input.kind,
      reps: input.reps,
      make_pct: input.makePct ?? null,
      started_at: input.startedAt ?? null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Organizer (Event Director) drafts                                   */
/* ------------------------------------------------------------------ */

/** The organizer announcements that make sense as one-click feed posts. */
export type OrganizerShareKind =
  | "published"
  | "registration_open"
  | "tee_times"
  | "final_results"
  | "league_night"
  | "club_update";

/**
 * Draft for anything a tournament director, league runner, or club lead wants
 * to push to the feed. Text is written from real event data, never a template
 * with blanks left in it.
 */
export function organizerDraft(input: {
  kind: OrganizerShareKind;
  eventName: string;
  startDate?: string | null;
  location?: string | null;
  courseName?: string | null;
  /** Registered / confirmed player count, when it makes the post better. */
  players?: number | null;
  spotsLeft?: number | null;
  divisions?: number | null;
  firstTeeTime?: string | null;
  winner?: string | null;
  registrationUrl?: string | null;
  slug?: string | null;
}): ShareDraft {
  const when = input.startDate
    ? new Date(`${input.startDate.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;
  const where = input.courseName ?? input.location ?? null;
  const tail = `${when ? ` · ${when}` : ""}${where ? ` · ${where}` : ""}`;

  let body: string;
  switch (input.kind) {
    case "published":
      body = `${input.eventName} is on the calendar${tail}. Details and divisions are up now.`;
      break;
    case "registration_open":
      body = `Registration is open for ${input.eventName}${tail}.${
        input.spotsLeft !== null && input.spotsLeft !== undefined
          ? ` ${input.spotsLeft} spot(s) left.`
          : ""
      }`;
      break;
    case "tee_times":
      body = `Tee times are posted for ${input.eventName}${tail}.${
        input.firstTeeTime ? ` First card off at ${input.firstTeeTime}.` : ""
      }`;
      break;
    case "final_results":
      body = `${input.eventName} is in the books${tail}.${input.winner ? ` Congrats to ${input.winner}.` : ""}${
        input.players ? ` ${input.players} players out there.` : ""
      }`;
      break;
    case "league_night":
      body = `${input.eventName} league night${tail}.${input.players ? ` ${input.players} signed up so far.` : ""} Come throw with us.`;
      break;
    case "club_update":
      body = `Club update — ${input.eventName}${tail}.`;
      break;
  }

  return {
    type: "tournament",
    body,
    courseName: input.courseName ?? null,
    location: input.location ?? null,
    scoreData: {
      organizer_post: input.kind,
      event_name: input.eventName,
      event_slug: input.slug ?? null,
      start_date: input.startDate ?? null,
      players: input.players ?? null,
      divisions: input.divisions ?? null,
      registration_url: input.registrationUrl ?? null,
    },
  };
}

/** Draft for club moments — joining a club or posting a club update. */
export function clubDraft(input: {
  kind: "joined" | "update";
  clubId: string;
  clubName: string;
  location?: string | null;
  memberCount?: number | null;
}): ShareDraft {
  const where = input.location ? ` in ${input.location}` : "";
  const body =
    input.kind === "joined"
      ? `Just joined ${input.clubName}${where}. Ready for league nights and club rounds.`
      : `Club update from ${input.clubName}${where}.`;
  return {
    type: "text",
    body,
    location: input.location ?? null,
    clubId: input.kind === "update" ? input.clubId : null,
    visibility: input.kind === "update" ? "club" : "public",
    scoreData: {
      kind: `club_${input.kind}`,
      club_id: input.clubId,
      club_name: input.clubName,
      member_count: input.memberCount ?? null,
    },
  };
}

/** Draft for crew moments — inviting players or celebrating a growing friends list. */
export function crewDraft(input: {
  friendCount: number;
  /** Optional newest connection to call out by name. */
  newestFriend?: string | null;
}): ShareDraft {
  const size = Math.max(0, Math.round(input.friendCount));
  const body = input.newestFriend
    ? `Just added ${input.newestFriend} to my crew on DG Dashboard — ${size} player${size === 1 ? "" : "s"} strong. Who's up for a round?`
    : size > 0
      ? `My crew is ${size} player${size === 1 ? "" : "s"} deep on DG Dashboard. Send a friend request if you want in on the next round.`
      : `Building my disc golf crew on DG Dashboard. Add me and let's get a round on the books.`;
  return {
    type: "text",
    body,
    visibility: "public",
    scoreData: {
      kind: "crew_update",
      friend_count: size,
      newest_friend: input.newestFriend ?? null,
    },
  };
}

/** Draft for King of the Hill standings — your rank on the friends board. */
export function hillDraft(input: {
  rank: number;
  fieldSize: number;
  crownScore: number;
  /** Current top dog, when it isn't the sharer. */
  leaderName?: string | null;
  isLeader: boolean;
}): ShareDraft {
  const rank = Math.max(1, Math.round(input.rank));
  const field = Math.max(rank, Math.round(input.fieldSize));
  const body = input.isLeader
    ? `Top dog on my King of the Hill board — ${input.crownScore.toLocaleString()} crown points across ${field} players. Come take it.`
    : `Sitting ${ordinal(rank)} of ${field} on my King of the Hill board with ${input.crownScore.toLocaleString()} crown points${
        input.leaderName ? `. ${input.leaderName} is holding the crown for now.` : "."
      } Time to climb.`;
  return {
    type: "text",
    body,
    visibility: "public",
    scoreData: {
      kind: "koth_rank",
      rank,
      field_size: field,
      crown_score: input.crownScore,
      is_leader: input.isLeader,
    },
  };
}

/* ------------------------------------------------------------------ */
/* StatLink drafts                                                     */
/* ------------------------------------------------------------------ */

/** Draft for a new personal best at a course ("course PR"). */
export function coursePrDraft(input: {
  courseName: string | null;
  bestScore?: number | null;
  bestToPar?: number | null;
  bestRating?: number | null;
  rounds?: number | null;
  city?: string | null;
}): ShareDraft {
  const course = input.courseName ?? "the course";
  const scoreBit =
    input.bestScore !== null && input.bestScore !== undefined
      ? `${input.bestScore}${input.bestToPar !== null && input.bestToPar !== undefined ? ` (${par(input.bestToPar)})` : ""}`
      : input.bestToPar !== null && input.bestToPar !== undefined
        ? par(input.bestToPar)
        : null;
  const ratingBit = input.bestRating ? ` · ${input.bestRating} rated` : "";
  return {
    type: "roundcard",
    body: `Course best at ${course}${scoreBit ? `: ${scoreBit}` : ""}${ratingBit}${
      input.rounds ? ` across ${input.rounds} round${input.rounds === 1 ? "" : "s"} there` : ""
    }.`,
    courseName: input.courseName,
    location: input.city ?? null,
    scoreData: {
      course_pr: true,
      course_name: input.courseName,
      total: input.bestScore ?? null,
      to_par: input.bestToPar ?? null,
      rating: input.bestRating ?? null,
      rounds_at_course: input.rounds ?? null,
    },
  };
}

/** Draft for a scoring milestone (birdie rate, clean rounds, rated rounds). */
export function scoringMilestoneDraft(input: {
  birdiePct?: number | null;
  parPct?: number | null;
  bogeyPlusPct?: number | null;
  holesTracked?: number | null;
  ratedRounds?: number | null;
  avgRoundRating?: number | null;
  bestRoundRating?: number | null;
}): ShareDraft {
  const parts: string[] = [];
  if (input.birdiePct !== null && input.birdiePct !== undefined)
    parts.push(`${input.birdiePct}% birdie or better`);
  if (input.parPct !== null && input.parPct !== undefined) parts.push(`${input.parPct}% par`);
  if (input.bogeyPlusPct !== null && input.bogeyPlusPct !== undefined)
    parts.push(`${input.bogeyPlusPct}% bogey or worse`);
  const holeBit = input.holesTracked ? ` over ${input.holesTracked} tracked holes` : "";
  const ratingBit = input.ratedRounds
    ? ` ${input.ratedRounds} rated round${input.ratedRounds === 1 ? "" : "s"}${
        input.avgRoundRating ? ` averaging ${input.avgRoundRating}` : ""
      }${input.bestRoundRating ? `, best ${input.bestRoundRating}` : ""}.`
    : "";
  return {
    type: "text",
    body: `Scoring check-in${parts.length ? `: ${parts.join(" · ")}` : ""}${holeBit}.${ratingBit}`.replace(
      /\.\./g,
      ".",
    ),
    scoreData: {
      scoring_milestone: true,
      birdie_pct: input.birdiePct ?? null,
      par_pct: input.parPct ?? null,
      bogey_plus_pct: input.bogeyPlusPct ?? null,
      holes_tracked: input.holesTracked ?? null,
      rated_rounds: input.ratedRounds ?? null,
      avg_round_rating: input.avgRoundRating ?? null,
      best_round_rating: input.bestRoundRating ?? null,
    },
  };
}

/** Draft for following a tournament in the Tournament Tracker. */
export function trackingDraft(input: {
  eventName: string;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  tier?: string | null;
}): ShareDraft {
  const when = input.startDate
    ? new Date(input.startDate + "T00:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;
  const tierBit = input.tier ? ` (${input.tier})` : "";
  return {
    type: "text",
    body: `Tracking ${input.eventName}${tierBit}${when ? ` starting ${when}` : ""}${
      input.location ? ` in ${input.location}` : ""
    }. Following tee times, pools, and results.`,
    location: input.location ?? null,
    scoreData: {
      tracking_event: true,
      event_name: input.eventName,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      tier: input.tier ?? null,
    },
  };
}

/** Draft for "my friends are playing this event" from the Tournament Tracker. */
export function friendEventDraft(input: {
  eventName: string;
  startDate?: string | null;
  location?: string | null;
  friendNames: string[];
}): ShareDraft {
  const when = input.startDate
    ? new Date(input.startDate + "T00:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;
  const names =
    input.friendNames.length <= 3
      ? input.friendNames.join(", ")
      : `${input.friendNames.slice(0, 3).join(", ")} and ${input.friendNames.length - 3} more`;
  return {
    type: "text",
    body: `${names || "Friends of mine"} ${input.friendNames.length === 1 ? "is" : "are"} registered for ${
      input.eventName
    }${when ? ` on ${when}` : ""}${input.location ? ` in ${input.location}` : ""}. Who else is in?`,
    location: input.location ?? null,
    scoreData: {
      friend_event: true,
      event_name: input.eventName,
      start_date: input.startDate ?? null,
      friends: input.friendNames.slice(0, 12),
    },
  };
}

/**
 * Share the caller's simulated odds for a tracked event. Only call with a
 * completed simulation — the copy states the numbers are a projection.
 */
export function eventOddsDraft(input: {
  eventName: string;
  divisionCode?: string | null;
  myRating: number | null;
  opponents: number;
  winPct: number;
  top3Pct: number;
  cashPct: number;
}): ShareDraft {
  const division = input.divisionCode ? ` ${input.divisionCode}` : "";
  return {
    type: "text",
    body: `Projected odds for ${input.eventName}${division}: ${input.winPct}% win · ${input.top3Pct}% top 3 · ${input.cashPct}% cash. Simulated from my ${
      input.myRating ?? "unrated"
    } rating against ${input.opponents} rated players.`,
    scoreData: {
      event_odds: true,
      event_name: input.eventName,
      division: input.divisionCode ?? null,
      my_rating: input.myRating,
      opponents: input.opponents,
      win_pct: input.winPct,
      top3_pct: input.top3Pct,
      cash_pct: input.cashPct,
    },
  };
}

/** Share a finished event's leaderboard snapshot from the tracker. */
export function eventResultsDraft(input: {
  eventName: string;
  divisionCode?: string | null;
  standings: { position: number | null; name: string; total: string | null }[];
}): ShareDraft {
  const top = input.standings.slice(0, 3);
  const line = top
    .map((s) => `${s.position ?? "-"}. ${s.name}${s.total ? ` (${s.total})` : ""}`)
    .join(" · ");
  const division = input.divisionCode ? ` ${input.divisionCode}` : "";
  return {
    type: "tournament",
    body: `${input.eventName}${division} results${line ? ` — ${line}` : ""}.`,
    scoreData: {
      event_results: true,
      event_name: input.eventName,
      division: input.divisionCode ?? null,
      standings: top,
    },
  };
}
