/**
 * Tracker nudges: the moments you'd want to cheer for — a tracked player tees
 * off, cards an eagle, throws an ace, finishes, or wins.
 *
 * Alerts are derived from the same "Live now" payload the tracker already
 * polls — no extra requests — and every one is gated by the player's own
 * notification preferences (the in-app channel plus the matching topic), so
 * turning a topic off in Tracker alert settings or Settings → Notifications
 * silences it everywhere. Nothing is invented: an eagle only fires when PDGA
 * publishes a hole score against a published par.
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyPrefs } from "@/lib/platform-config.functions";
import { formatToPar, isOnTheCourse } from "@/lib/live/friend-live";
import type { FriendsLiveNow, FriendLivePlayer } from "@/lib/live/friend-live";

type Snapshot = {
  playing: boolean;
  finished: boolean;
  label: string;
  detail: string;
  /** Holes with a published score, used to spot new eagles and aces. */
  thru: number;
  holeScores: number[] | null;
  holePars: number[] | null;
  place: number | null;
  eventName: string | null;
};

/** Holes that are newly scored between two snapshots, best (lowest) first. */
function newBigHoles(
  before: Snapshot,
  after: Snapshot,
): { hole: number; strokes: number; underPar: number }[] {
  const scores = after.holeScores;
  const pars = after.holePars;
  if (!scores || !pars) return [];
  const from = Math.max(0, before.thru);
  const out: { hole: number; strokes: number; underPar: number }[] = [];
  for (let i = from; i < scores.length && i < pars.length; i += 1) {
    const strokes = scores[i];
    const par = pars[i];
    if (!strokes || !par) continue;
    const underPar = par - strokes;
    if (underPar >= 2 || strokes === 1) out.push({ hole: i + 1, strokes, underPar });
  }
  return out;
}

function playerDetail(player: FriendLivePlayer, eventName: string): string {
  return player.toPar != null ? `${formatToPar(player.toPar)} at ${eventName}` : `at ${eventName}`;
}

function snapshot(live: FriendsLiveNow): Map<string, Snapshot> {
  const map = new Map<string, Snapshot>();
  for (const event of live.events) {
    for (const player of event.players) {
      map.set(`e:${event.eventRef}:${player.pdgaNumber}:${player.roundNumber}`, {
        playing: isOnTheCourse(player),
        finished: player.completed,
        label: player.displayName,
        detail: playerDetail(player, event.name),
        thru: player.thru,
        holeScores: player.holeScores,
        holePars: player.holePars,
        place: player.place,
        eventName: event.name,
      });
    }
  }
  for (const round of live.rounds) {
    const toPar = round.totalPar > 0 ? round.totalStrokes - round.totalPar : null;
    const where = round.courseName ?? "an unnamed course";
    map.set(`r:${round.roundId}`, {
      playing: true,
      finished: false,
      label: round.displayName,
      detail: toPar != null ? `${formatToPar(toPar)} at ${where}` : `at ${where}`,
      thru: round.holesPlayed,
      holeScores: null,
      holePars: null,
      place: null,
      eventName: null,
    });
  }
  return map;
}

export function useFriendLiveAlerts(live: FriendsLiveNow | undefined) {
  const loadPrefs = useServerFn(getMyPrefs);
  const { data: prefs } = useQuery({
    queryKey: ["prefs", "notifications"],
    queryFn: () => loadPrefs(),
    staleTime: 10 * 60_000,
  });
  const inApp = !!prefs?.notifications.channels.inApp;
  const topics = prefs?.notifications.topics;
  const previous = useRef<Map<string, Snapshot> | null>(null);

  useEffect(() => {
    if (!live) return;
    const next = snapshot(live);
    const prior = previous.current;
    previous.current = next;
    if (!prior || !inApp || !topics) return;

    for (const [key, now] of next) {
      const before = prior.get(key);
      if (!before) {
        if (now.playing && topics.friendLiveRounds) {
          toast.info(`${now.label} teed off`, { description: now.detail });
        }
        continue;
      }

      // Big holes first — they're the reason to look at the page.
      for (const hole of newBigHoles(before, now)) {
        if (hole.strokes === 1) {
          if (topics.friendAces) {
            toast.success(`${now.label} just aced hole ${hole.hole}!`, { description: now.detail });
          }
        } else if (topics.friendEagles) {
          const name = hole.underPar >= 3 ? "an albatross" : "an eagle";
          toast.success(`${now.label} carded ${name} on hole ${hole.hole}`, {
            description: now.detail,
          });
        }
      }

      if (!before.playing && now.playing && topics.friendLiveRounds) {
        toast.info(`${now.label} teed off`, { description: now.detail });
      } else if (!before.finished && now.finished) {
        if (now.place === 1 && topics.friendWins) {
          toast.success(`${now.label} won ${now.eventName ?? "the event"}!`, {
            description: now.detail,
          });
        } else if (topics.friendLiveRounds) {
          toast.success(`${now.label} finished`, { description: now.detail });
        }
      }
    }
  }, [live, inApp, topics]);
}
