/**
 * Pure rules for the Staging area (Clubhouse + course lobbies).
 * Everything here is deterministic so every client computes the same result
 * from the same broadcast events.
 */

export type RoomKind = "clubhouse" | "course";
export type RoomRef =
  | { kind: "clubhouse" }
  | { kind: "course"; courseId: string }
  | { kind: "event"; eventId: string };

export function roomChannel(room: RoomRef): string {
  if (room.kind === "clubhouse") return "staging:clubhouse";
  if (room.kind === "course") return `staging:course:${room.courseId}`;
  return `staging:event:${room.eventId}`;
}

/** Lawn coordinates are 0–100 on both axes. */
export function clampPos(x: number, y: number): { x: number; y: number } {
  const c = (v: number) => Math.min(96, Math.max(4, Number.isFinite(v) ? v : 50));
  return { x: c(x), y: c(y) };
}

/** Basket and toss targets sit at fixed spots on the lawn. */
export const BASKET = { x: 78, y: 30 } as const;
export const TOSS_TARGETS = [
  { x: 25, y: 22, r: 6, points: 3 },
  { x: 50, y: 15, r: 5, points: 5 },
  { x: 70, y: 70, r: 7, points: 2 },
] as const;

export const EMOTES = [
  { id: "wave", label: "Wave" },
  { id: "cheer", label: "Cheer" },
  { id: "chains", label: "Chain rattle" },
  { id: "ace", label: "Ace!" },
  { id: "nice", label: "Nice throw" },
  { id: "tee", label: "Let's tee off" },
] as const;
export type EmoteId = (typeof EMOTES)[number]["id"];

export const MAX_SAY = 140;
export function cleanSay(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_SAY);
}

/** Small seeded RNG so the same seed gives the same wind on every client. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Putting: the player stops a moving meter. `timing` is 0–1 where 0.5 is perfect.
 * Distance in feet raises the difficulty. Wind (−1..1) shifts the sweet spot.
 */
export function puttResult(timing: number, distanceFt: number, wind: number): "chains" | "spit" | "miss" {
  const target = 0.5 + wind * 0.08;
  const err = Math.abs(timing - target);
  const window = Math.max(0.03, 0.16 - (distanceFt - 10) * 0.004);
  if (err <= window * 0.6) return "chains";
  if (err <= window) return "spit";
  return "miss";
}

export const PUTT_DISTANCES = [15, 20, 25, 30, 33] as const;

/** Disc toss: landing point → points from the best target hit. */
export function tossScore(x: number, y: number): number {
  let best = 0;
  for (const t of TOSS_TARGETS) {
    const d = Math.hypot(x - t.x, y - t.y);
    if (d <= t.r) best = Math.max(best, t.points + (d <= t.r / 3 ? 2 : 0));
  }
  return best;
}

/** Wind pushes the landing spot. aim is where the player tapped. */
export function tossLanding(aimX: number, aimY: number, power: number, windX: number): { x: number; y: number } {
  const wobble = (1 - Math.min(1, Math.max(0, power))) * 8;
  return clampPos(aimX + windX * 6 + wobble * (windX >= 0 ? 1 : -1), aimY + wobble * 0.5);
}

export type TriviaQ = { q: string; options: string[]; answer: number };

/** Disc golf rules and history questions — kept factual and general. */
export const TRIVIA: TriviaQ[] = [
  { q: "What is the circle around the basket inside 10 metres called?", options: ["Circle 1", "The bullseye", "Inner ring", "Drop zone"], answer: 0 },
  { q: "A score of one under par on a hole is a…", options: ["Bogey", "Birdie", "Eagle", "Albatross"], answer: 1 },
  { q: "Which throw spins with the back of the hand facing forward?", options: ["Forehand", "Roller", "Backhand", "Tomahawk"], answer: 2 },
  { q: "What do you call holing out from the tee?", options: ["Hyzer", "Ace", "Jump putt", "Turnover"], answer: 1 },
  { q: "A disc that curves hard left at the end (right-hand backhand) is…", options: ["Understable", "Overstable", "Neutral", "Flat"], answer: 1 },
  { q: "Who sanctions most professional disc golf events?", options: ["NFL", "PDGA", "FIFA", "USGA"], answer: 1 },
  { q: "What's the first of the four flight numbers on a disc?", options: ["Glide", "Fade", "Speed", "Turn"], answer: 2 },
  { q: "Landing out of bounds usually costs you…", options: ["No penalty", "One stroke", "Two strokes", "The hole"], answer: 1 },
  { q: "Releasing a disc angled so it curves away from your throwing arm is…", options: ["Anhyzer", "Hyzer", "Skip", "Grenade"], answer: 0 },
  { q: "A score of two over par on a hole is a…", options: ["Bogey", "Double bogey", "Par", "Condor"], answer: 1 },
  { q: "Who goes first on the next tee?", options: ["Youngest player", "Lowest score on the last hole", "Whoever's ready", "Highest rating"], answer: 1 },
  { q: "Putting from inside Circle 1 requires you to…", options: ["Jump", "Show balance behind your lie", "Use a putter", "Kneel"], answer: 1 },
];

export const TRIVIA_SECONDS = 15;

export function triviaPoints(correct: boolean, msTaken: number): number {
  if (!correct) return 0;
  const left = Math.max(0, TRIVIA_SECONDS * 1000 - msTaken);
  return 100 + Math.round((left / (TRIVIA_SECONDS * 1000)) * 100);
}

/** Pick `n` question indexes from a seed. */
export function triviaSet(seed: number, n = 5): number[] {
  const rnd = seeded(seed);
  const idx = TRIVIA.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, n);
}
