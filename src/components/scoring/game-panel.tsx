import * as React from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Coins, Flag, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GameRulesSheet } from "@/components/play/game-rules-sheet";
import {
  DEFAULT_IMPOSTER_SETTINGS,
  DEFAULT_WOLF_SETTINGS,
  gameModeFitsCard,
  gameModeFromRound,
  playFormatLabel,
  roundContextLabel,
  scoringTypeLabel,
  teamSizeLabel,
  teamThrowStyleLabel,
  type ImposterSettings,
  type WolfSettings,
} from "@/lib/competition-model";

/**
 * Game-aware panels for the scoring tool.
 *
 * Every round is started with a game mode (singles stroke play, skins, teams,
 * Wolf, Imposter), a throw style for team play and a settlement type. These
 * panels read those saved settings so the scorer shows the game that was
 * actually started: the rules for it, and the standings that game is settled by.
 */

export type GameRound = {
  id: string;
  round_context?: string | null;
  play_format?: string | null;
  team_throw_style?: string | null;
  team_size?: number | null;
  scoring_type?: string | null;
  scoring_config?: unknown;
  is_rated?: boolean | null;
  rating_mode?: string | null;
};

export type GamePlayer = { id: string; name: string; isMe: boolean };
export type GameScore = { playerId: string; hole: number; strokes: number };

function wolfSettings(round: GameRound): WolfSettings {
  const raw = (round.scoring_config ?? null) as Partial<WolfSettings> | null;
  return {
    ...DEFAULT_WOLF_SETTINGS,
    ...(raw ?? {}),
    points: { ...DEFAULT_WOLF_SETTINGS.points, ...(raw?.points ?? {}) },
  };
}

function imposterSettings(round: GameRound): ImposterSettings {
  const raw = (round.scoring_config ?? null) as Partial<ImposterSettings> | null;
  return { ...DEFAULT_IMPOSTER_SETTINGS, ...(raw ?? {}) };
}

/** Chunk the card into teams by seating order, using the saved team size. */
export function teamsForCard(
  players: GamePlayer[],
  teamSize: number,
): { key: string; name: string; members: GamePlayer[] }[] {
  const size = Math.max(2, teamSize || 2);
  const out: { key: string; name: string; members: GamePlayer[] }[] = [];
  for (let i = 0; i < players.length; i += size) {
    const members = players.slice(i, i + size);
    out.push({
      key: members.map((m) => m.id).join("-"),
      name: members.map((m) => m.name.split(" ")[0]).join(" + "),
      members,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Summary + rules
// ---------------------------------------------------------------------------

/** What game is being played, with the rules for it one tap away. */
export function GameSummaryPanel({
  round,
  playerCount,
}: {
  round: GameRound;
  playerCount: number;
}) {
  const mode = gameModeFromRound(round);
  const teamSize = round.team_size ?? 2;
  const throwStyle = mode.teams ? teamThrowStyleLabel(round.team_throw_style) : null;
  const rated = round.is_rated !== false && round.rating_mode !== "casual" && mode.rateable;
  const fit = gameModeFitsCard(mode, playerCount, teamSize);

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          <Flag className="h-3 w-3" /> Game in play
        </span>
        <span>{roundContextLabel(round.round_context)}</span>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-sm font-semibold">{mode.label}</span>
          <Badge variant="secondary" className="text-[10px]">
            {mode.tagline}
          </Badge>
          <Badge variant={rated ? "default" : "outline"} className="text-[10px]">
            {rated ? "DGD Rated" : "Casual"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{mode.how}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div>
            <dt className="text-muted-foreground">Format</dt>
            <dd className="font-medium">
              {mode.teams ? teamSizeLabel(teamSize) : playFormatLabel(round.play_format)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Scoring</dt>
            <dd className="font-medium">{scoringTypeLabel(round.scoring_type)}</dd>
          </div>
          {throwStyle ? (
            <div>
              <dt className="text-muted-foreground">Throw style</dt>
              <dd className="font-medium">{throwStyle}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">On the card</dt>
            <dd className="font-medium">
              {playerCount} {playerCount === 1 ? "player" : "players"}
            </dd>
          </div>
        </dl>
        {fit.reason ? (
          <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            {fit.reason}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" /> Rules &amp; guidelines
          </span>
          {mode.rulebookIds.map((id) => (
            <GameRulesSheet key={id} id={id} label={rulesLabel(id)} />
          ))}
          {mode.teams && round.team_throw_style ? (
            <GameRulesSheet
              id={round.team_throw_style}
              label={teamThrowStyleLabel(round.team_throw_style) ?? "Throw style"}
            />
          ) : null}
        </div>
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/rulebook">Open the full game rulebook</Link>
        </Button>
      </div>
    </div>
  );
}

function rulesLabel(id: string): string {
  const map: Record<string, string> = {
    singles: "Singles",
    doubles: "Doubles",
    teams: "Teams",
    stroke_play: "Stroke play",
    skins: "Skins",
    wolf: "Wolf",
    imposter: "Imposter",
    best_throw: "Best throw",
    worst_throw: "Worst throw",
    alternate_throw: "Alternate throw",
    modified_best_throw: "Modified best throw",
  };
  return map[id] ?? "Rules";
}

// ---------------------------------------------------------------------------
// Settlement — the standings for the game that was started
// ---------------------------------------------------------------------------

type SkinsResult = { won: Map<string, number>; carry: number; pot: number };

function computeSkins(
  entrants: { id: string; strokesFor: (hole: number) => number | null }[],
  holes: number[],
): SkinsResult {
  const won = new Map<string, number>();
  entrants.forEach((e) => won.set(e.id, 0));
  let carry = 0;
  let pot = 1;
  for (const h of holes) {
    const values = entrants.map((e) => ({ id: e.id, strokes: e.strokesFor(h) }));
    if (values.some((v) => v.strokes == null)) break;
    pot = 1 + carry;
    const lowest = Math.min(...values.map((v) => v.strokes as number));
    const tied = values.filter((v) => v.strokes === lowest);
    if (tied.length === 1) {
      won.set(tied[0].id, (won.get(tied[0].id) ?? 0) + pot);
      carry = 0;
    } else {
      carry = pot;
    }
  }
  return { won, carry, pot: 1 + carry };
}

export function GameSettlementPanel({
  round,
  players,
  scores,
  holes,
  pars,
}: {
  round: GameRound;
  players: GamePlayer[];
  scores: GameScore[];
  holes: number[];
  pars: Map<number, number>;
}) {
  const mode = gameModeFromRound(round);
  const teamSize = round.team_size ?? 2;
  const strokesFor = React.useCallback(
    (playerId: string, hole: number) =>
      scores.find((s) => s.playerId === playerId && s.hole === hole)?.strokes ?? null,
    [scores],
  );

  const teams = React.useMemo(
    () => (mode.teams ? teamsForCard(players, teamSize) : []),
    [mode.teams, players, teamSize],
  );

  // A team's hole score is the strokes its members recorded for the hole. Under
  // every throw style the team plays one disc, so any member's entry is the
  // team score; we take the first entry present.
  const teamStrokes = React.useCallback(
    (members: GamePlayer[], hole: number) => {
      for (const m of members) {
        const v = strokesFor(m.id, hole);
        if (v != null) return v;
      }
      return null;
    },
    [strokesFor],
  );

  const skins = React.useMemo(() => {
    if (mode.scoring !== "skins") return null;
    return mode.teams
      ? computeSkins(
          teams.map((t) => ({ id: t.key, strokesFor: (h: number) => teamStrokes(t.members, h) })),
          holes,
        )
      : computeSkins(
          players.map((p) => ({ id: p.id, strokesFor: (h: number) => strokesFor(p.id, h) })),
          holes,
        );
  }, [mode, teams, players, holes, strokesFor, teamStrokes]);

  if (mode.scoring === "wolf") {
    return <WolfLedger round={round} players={players} holes={holes} />;
  }
  if (mode.scoring === "imposter") {
    return <ImposterPanel round={round} players={players} />;
  }

  if (mode.scoring === "skins" && skins) {
    const rows = (
      mode.teams
        ? teams.map((t) => ({ id: t.key, name: t.name, isMe: t.members.some((m) => m.isMe) }))
        : players.map((p) => ({ id: p.id, name: p.name, isMe: p.isMe }))
    ).sort((a, b) => (skins.won.get(b.id) ?? 0) - (skins.won.get(a.id) ?? 0));
    return (
      <PanelFrame icon={<Coins className="h-3 w-3" />} title="Skins" right="Skins won">
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li
              key={r.id}
              className={
                "flex items-center gap-3 px-3 py-1.5 text-sm " + (r.isMe ? "bg-primary/5" : "")
              }
            >
              <span className="flex-1 truncate">{r.name}</span>
              <span className="tabular-nums font-semibold">{skins.won.get(r.id) ?? 0}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {skins.carry > 0
            ? `Tied hole — ${skins.carry + 1} skins ride on the next hole.`
            : "Win a hole outright to take the skin. Ties carry it over."}
        </p>
      </PanelFrame>
    );
  }

  if (mode.teams) {
    const rows = teams
      .map((t) => {
        let total = 0;
        let played = 0;
        let toPar = 0;
        for (const h of holes) {
          const v = teamStrokes(t.members, h);
          if (v == null) continue;
          total += v;
          played += 1;
          toPar += v - (pars.get(h) ?? 3);
        }
        return { ...t, total, played, toPar, isMe: t.members.some((m) => m.isMe) };
      })
      .sort((a, b) => a.toPar - b.toPar);
    return (
      <PanelFrame
        icon={<Users className="h-3 w-3" />}
        title="Team standings"
        right="Thru · Total · +/-"
      >
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li
              key={r.key}
              className={
                "flex items-center gap-3 px-3 py-1.5 text-sm " + (r.isMe ? "bg-primary/5" : "")
              }
            >
              <span className="flex-1 truncate">{r.name}</span>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                {r.played}
              </span>
              <span className="w-10 text-right font-semibold tabular-nums">{r.total}</span>
              <span className="w-10 text-right font-semibold tabular-nums">
                {r.toPar === 0 ? "E" : r.toPar > 0 ? `+${r.toPar}` : r.toPar}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {teamThrowStyleLabel(round.team_throw_style) ?? "Best throw"} — one score per team per
          hole. Enter that score for either partner and the team total follows it.
        </p>
      </PanelFrame>
    );
  }

  return (
    <PanelFrame icon={<Trophy className="h-3 w-3" />} title="Stroke play" right="How it settles">
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Lowest total strokes wins. Your card above is the live standings, and every stroke including
        penalties counts.
      </p>
    </PanelFrame>
  );
}

function PanelFrame({
  icon,
  title,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  right?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          {icon} {title}
        </span>
        {right ? <span>{right}</span> : null}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wolf
// ---------------------------------------------------------------------------

type WolfResult = "wolf_team" | "hunters" | "lone_win" | "lone_loss";
type WolfHoleState = { result: WolfResult; partnerId?: string | null };

/**
 * Wolf points ledger. Strokes stay in the round; the hole result a card agrees
 * on is kept on this device so the points table can be settled at the last
 * basket. Any player on the card can keep it on their own phone.
 */
function WolfLedger({
  round,
  players,
  holes,
}: {
  round: GameRound;
  players: GamePlayer[];
  holes: number[];
}) {
  const settings = wolfSettings(round);
  const storageKey = `dgd.wolf.${round.id}`;
  const [ledger, setLedger] = React.useState<Record<number, WolfHoleState>>({});

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setLedger(JSON.parse(raw) as Record<number, WolfHoleState>);
    } catch {
      // A blocked or corrupt store just means an empty ledger.
    }
  }, [storageKey]);

  const save = (next: Record<number, WolfHoleState>) => {
    setLedger(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Nothing to do — the ledger stays in memory for this session.
    }
  };

  const wolfForHole = (index: number) => players[index % Math.max(1, players.length)] ?? null;

  const points = React.useMemo(() => {
    const totals = new Map<string, number>();
    players.forEach((p) => totals.set(p.id, 0));
    const add = (id: string, n: number) => totals.set(id, (totals.get(id) ?? 0) + n);
    holes.forEach((h, i) => {
      const state = ledger[h];
      if (!state) return;
      const wolf = wolfForHole(i);
      if (!wolf) return;
      const others = players.filter((p) => p.id !== wolf.id && p.id !== state.partnerId);
      if (state.result === "wolf_team") {
        add(wolf.id, settings.points.wolfTeamWin);
        if (state.partnerId) add(state.partnerId, settings.points.wolfTeamWin);
      } else if (state.result === "hunters") {
        others.forEach((o) => add(o.id, settings.points.huntersWin));
      } else if (state.result === "lone_win") {
        add(wolf.id, settings.points.loneWolfWin);
      } else {
        players
          .filter((p) => p.id !== wolf.id)
          .forEach((o) => add(o.id, settings.points.beatLoneWolf));
      }
    });
    return totals;
  }, [ledger, players, holes, settings]);

  const nextHole = holes.find((h) => !ledger[h]) ?? null;
  const nextIndex = nextHole != null ? holes.indexOf(nextHole) : -1;
  const nextWolf = nextIndex >= 0 ? wolfForHole(nextIndex) : null;
  const [partnerId, setPartnerId] = React.useState<string | null>(null);

  const record = (result: WolfResult) => {
    if (nextHole == null) return;
    save({
      ...ledger,
      [nextHole]: { result, partnerId: result === "wolf_team" ? partnerId : null },
    });
    setPartnerId(null);
  };

  const rows = [...players].sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0));

  return (
    <PanelFrame icon={<Users className="h-3 w-3" />} title="Wolf" right="Points">
      <ul className="divide-y divide-border">
        {rows.map((p) => (
          <li
            key={p.id}
            className={
              "flex items-center gap-3 px-3 py-1.5 text-sm " + (p.isMe ? "bg-primary/5" : "")
            }
          >
            <span className="flex-1 truncate">{p.name}</span>
            <span className="font-semibold tabular-nums">{points.get(p.id) ?? 0}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t border-border/60 p-3">
        {nextHole != null && nextWolf ? (
          <>
            <p className="text-xs">
              <span className="font-semibold">Hole {nextHole}:</span> {nextWolf.name} is the Wolf
              {settings.wolfTeeOrder === "last" ? " and tees last." : " and tees first."}
            </p>
            <div className="flex flex-wrap gap-1">
              {players
                .filter((p) => p.id !== nextWolf.id)
                .map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    size="sm"
                    variant={partnerId === p.id ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setPartnerId(partnerId === p.id ? null : p.id)}
                  >
                    {p.name.split(" ")[0]}
                  </Button>
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Pick the partner the Wolf took, then record the hole.
            </p>
            <div className="grid grid-cols-1 gap-1">
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                disabled={!partnerId}
                onClick={() => record("wolf_team")}
              >
                Wolf team won (+{settings.points.wolfTeamWin})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => record("hunters")}
              >
                Hunters won (+{settings.points.huntersWin})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => record("lone_win")}
              >
                Lone Wolf won (+{settings.points.loneWolfWin})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => record("lone_loss")}
              >
                Lone Wolf beaten (+{settings.points.beatLoneWolf})
              </Button>
            </div>
            {Object.keys(ledger).length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-full text-xs"
                onClick={() => {
                  const next = { ...ledger };
                  const last = holes.filter((h) => next[h]).pop();
                  if (last != null) delete next[last];
                  save(next);
                }}
              >
                Undo last hole
              </Button>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Every hole is recorded. Highest points wins the card.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {settings.blindWolf ? "Blind Wolf allowed." : "No Blind Wolf."}{" "}
          {settings.carryover
            ? "Tied holes carry their points forward."
            : "Tied holes score nothing."}{" "}
          Points are kept on this device; strokes still save to the round.
        </p>
      </div>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------------------
// Imposter
// ---------------------------------------------------------------------------

function ImposterPanel({ round, players }: { round: GameRound; players: GamePlayer[] }) {
  const settings = imposterSettings(round);
  const voteAt =
    settings.voteAt === "hole_9"
      ? "after hole 9"
      : settings.voteAt === "any_hole"
        ? "on any hole the card calls for it"
        : "at the end of the round";
  return (
    <PanelFrame icon={<Users className="h-3 w-3" />} title="Imposter" right="Hidden role">
      <div className="space-y-2 p-3 text-xs text-muted-foreground">
        <p>
          The card plays as one team while one hidden player quietly plays against it. Keep normal
          strokes for everyone — the game is settled by the vote, not the scorecard.
        </p>
        <ul className="space-y-1">
          <li>Card size: {players.length} players.</li>
          <li>
            Role: {settings.rotateRole ? "reassigned every few holes" : "set once for the round"}.
          </li>
          <li>{settings.hintMode ? "The Imposter knows the crew's target." : "No hints given."}</li>
          <li>The card votes {voteAt}.</li>
        </ul>
      </div>
    </PanelFrame>
  );
}
