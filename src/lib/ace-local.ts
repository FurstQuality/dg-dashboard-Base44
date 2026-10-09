/**
 * Ace local answer engine.
 *
 * A zero-cost, offline-friendly disc golf knowledge base used by the
 * free tier of Ace. It matches keywords in the user's question
 * against a curated set of coaching answers so free users still get
 * useful guidance without hitting the AI gateway.
 *
 * This runs both server-side (from caddy.functions.ts) and can be
 * safely reused client-side. No secrets, no network calls.
 */

export type LocalCaddyEntry = {
  id: string;
  /** Lowercased keyword groups; a question matches if ANY group's terms ALL appear. */
  match: string[][];
  answer: string;
};

const ENTRIES: LocalCaddyEntry[] = [
  {
    id: "disc-selection-basics",
    match: [
      ["disc", "pick"],
      ["what", "disc"],
      ["which", "disc"],
      ["disc", "should"],
    ],
    answer: [
      "**Disc pick starter framework** (free local caddy):",
      "",
      "- **Under 250 ft, tight:** putter or overstable midrange, controlled hyzer.",
      "- **250-350 ft, open:** stable-to-overstable midrange or slow fairway.",
      "- **350-425 ft:** fairway driver matched to the shape (straight/hyzer/anhyzer).",
      "- **425+ ft:** control distance driver; only reach for max-speed drivers on wide-open lines.",
      "- **Headwind:** step DOWN in speed and UP in overstability.",
      "- **Tailwind:** step UP in speed, more understable is fine.",
      "",
      "Play call: match distance to speed, then adjust one step for wind.",
      "",
      "_Upgrade to full Ace caddy for picks tuned to the exact discs in your bag._",
    ].join("\n"),
  },
  {
    id: "wind",
    match: [["wind"], ["headwind"], ["tailwind"], ["crosswind"]],
    answer: [
      "**Wind rules of thumb:**",
      "",
      "- **Headwind:** overstable + lower speed. A headwind punishes understable and high-speed discs (they turn and burn).",
      "- **Tailwind:** you can throw understable and high-speed; expect less fade.",
      "- **Left-to-right crosswind (RHBH):** hyzer angle holds well; anhyzer flips fast.",
      "- **Right-to-left crosswind (RHBH):** anhyzer/flex lines shine; hyzers fade hard.",
      "",
      "Play call: when in doubt, throw MORE overstable and LESS power into wind.",
    ].join("\n"),
  },
  {
    id: "putting",
    match: [["putt"], ["putting"], ["circle 1"], ["c1"], ["c2 putt"]],
    answer: [
      "**Putting fundamentals:**",
      "",
      "- **Stance:** feet under hips, weight balanced, knees soft.",
      "- **Grip:** firm but not tense; same grip every rep.",
      "- **Motion:** low-to-high push, follow through toward the pole, hold the finish.",
      "- **Eyes:** pick a single link on the chains and stare at it.",
      "- **Routine:** same breath, same read, same tempo every putt.",
      "",
      "Drill: 10 putts each from 15, 20, 25, 30, 33 ft. Reset to 15 ft on any miss. Do it 5x/week.",
      "",
      "Play call: repeatable motion beats power every time inside the circle.",
    ].join("\n"),
  },
  {
    id: "driving",
    match: [["drive"], ["driving"], ["distance"], ["throw", "far"]],
    answer: [
      "**Driving distance checklist:**",
      "",
      "- **Reach back** straight and full, not around your body.",
      "- **Lead with the elbow**, keep the disc close to the chest.",
      "- **Plant off-hand foot hard** and rotate hips first, shoulders second.",
      "- **Nose down** (disc angled slightly forward) prevents stalls and pop-ups.",
      "- **Grip lock** kills distance - loose fingers, firm thumb.",
      "",
      "Play call: form + timing add more distance than muscle. Film yourself once a week.",
    ].join("\n"),
  },
  {
    id: "pdga-ob-803",
    match: [["ob"], ["out of bounds"], ["803"], ["rule", "ob"]],
    answer: [
      "**PDGA OB (rule 803) simplified:**",
      "",
      "- If your disc comes to rest OB, you get a **one-throw penalty**.",
      "- You may play your next shot from **one of**: (a) previous lie, (b) up to 1m in-bounds from where the disc last crossed the OB line, or (c) a designated drop zone if the hole specifies one.",
      "- Keep a **1-meter relief** perpendicular from the OB line if you take option (b).",
      "",
      "Play call: know where the disc last crossed - that's where relief measures from, NOT where it stopped.",
    ].join("\n"),
  },
  {
    id: "pdga-mando",
    match: [["mando"], ["mandatory"]],
    answer: [
      "**Mandatory (mando):**",
      "",
      "- The disc must pass the mando on the correct side.",
      "- Missing a mando = **one-throw penalty** and you play from the drop zone (or previous lie if no DZ).",
      "- Double/triple mandos work the same - just more gates.",
      "",
      "Play call: aim to CLEAR the mando comfortably; never cut it thin for a couple extra feet.",
    ].join("\n"),
  },
  {
    id: "rating",
    match: [["rating"], ["pdga rating"], ["round rating"], ["ssa"]],
    answer: [
      "**PDGA rating quick primer:**",
      "",
      "- Each rated round gets a **round rating** based on the field's Scratch Scoring Average (SSA) and your score.",
      "- Your **player rating** is a weighted average of your recent rated rounds (roughly the last ~8 events, recency-weighted, with outliers dropped).",
      "- **Every stroke** on a par-63-ish course is worth about **~10 rating points** near scratch.",
      "- Ratings update on the PDGA cycle (roughly monthly).",
      "",
      "Play call: to raise your rating, stack consistent rounds slightly above your current rating. One hot round won't move it much.",
    ].join("\n"),
  },
  {
    id: "bag-building",
    match: [["bag"], ["build", "bag"], ["what", "carry"], ["bag", "gap"]],
    answer: [
      "**Bag-building starter (14-18 discs):**",
      "",
      "- **2 putters:** one for putting, one for approach.",
      "- **2 midranges:** one stable/straight, one overstable.",
      "- **2 fairway drivers:** one workhorse (stable), one overstable utility.",
      "- **2-3 distance drivers:** understable/neutral/overstable spread.",
      "- **1-2 utility discs:** roller, tailwind bomber, or extra overstable.",
      "",
      "Play call: fill gaps by distance AND stability. If you already own it, don't buy it again.",
      "",
      "_The full Ace caddy can audit your actual bag from your DG Dashboard profile._",
    ].join("\n"),
  },
  {
    id: "form-drills",
    match: [["form"], ["drill"], ["practice"], ["fieldwork"]],
    answer: [
      "**Weekly practice split (2-3 hours):**",
      "",
      "- **30 min putting** - the 15/20/25/30/33 ft reset drill.",
      "- **30 min upshots** - 150-250 ft controlled hyzers and flat lines.",
      "- **45 min fieldwork** - 10 discs, same shot shape, film every 5th throw.",
      "- **15 min standstills** - drive form without the X-step.",
      "",
      "Play call: **quality reps beat volume.** Ten focused throws > sixty lazy ones.",
    ].join("\n"),
  },
  {
    id: "tournament-etiquette",
    match: [["etiquette"], ["courtesy"], ["group", "round"], ["tournament", "rule"]],
    answer: [
      "**Tournament etiquette must-haves:**",
      "",
      "- **Furthest from the pin throws first.** Wait behind the thrower.",
      "- **Stay quiet and still** in the thrower's peripheral vision.",
      "- **Call your own OB, mandos, and stance violations** - transparency > drama.",
      "- **Keep pace** - 30 seconds from your turn to release.",
      "- **Sign your scorecard** at the end. Unsigned = DQ.",
      "",
      "Play call: play fast, play clean, and confirm scores hole-by-hole.",
    ].join("\n"),
  },
];

const GREETING_ANSWER = [
  "Hey! I'm the **free Ace** running from an on-device disc golf knowledge base.",
  "",
  "I can help with:",
  "- Disc selection basics (distance / wind / shape)",
  "- Putting, driving, and form drills",
  "- PDGA rules (OB, mandos, ratings, etiquette)",
  "- Bag-building gaps",
  "",
  'Ask me something like *"What disc for a 320 ft tunnel headwind?"* or *"Explain PDGA rule 803."*',
  "",
  "_Upgrading to a paid DG Dashboard subscription unlocks the full Ace caddy that reads your bag, rounds, and rating._",
].join("\n");

const FALLBACK_ANSWER = [
  "I'm the **free local Ace** and I don't have a canned answer for that exact question yet.",
  "",
  "Try one of these topics I do cover:",
  "- Disc selection & wind adjustments",
  "- Putting, driving, and practice drills",
  "- PDGA rules (OB / mandos / ratings / etiquette)",
  "- Bag building and gap analysis",
  "",
  "_The full **Ace caddy** (paid tier) can answer open-ended coaching questions personalized to your bag, rounds, and rating. During the DG Dashboard beta, full AI is unlocked for everyone._",
].join("\n");

export function answerLocally(question: string): string {
  const q = question.toLowerCase();
  if (/^\s*(hi|hey|hello|yo|sup|what's up|whats up)\b/.test(q)) return GREETING_ANSWER;

  for (const entry of ENTRIES) {
    for (const group of entry.match) {
      if (group.every((term) => q.includes(term))) return entry.answer;
    }
  }
  return FALLBACK_ANSWER;
}
