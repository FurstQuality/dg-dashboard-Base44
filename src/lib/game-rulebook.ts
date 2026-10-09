/**
 * DG Dashboard game rulebook.
 *
 * One source of truth for how every playing style this app supports actually
 * works: singles and team formats, the throw styles inside team play, the way
 * a card is settled, including the casual games (Wolf, Imposter, Skins).
 *
 * The start-a-round dialog, the scoring screens and the /rulebook page all
 * read from here so the rules a player reads are the rules the app scores.
 */

export type RulebookCategory = "format" | "throw_style" | "scoring";

export type RulebookSection = {
  heading: string;
  /** Plain sentences or short rule lines. Rendered as a list. */
  lines: string[];
};

export type RulebookEntry = {
  /** Matches the stored value it documents (play_format, team_throw_style, scoring_type). */
  id: string;
  category: RulebookCategory;
  name: string;
  /** Other names groups use for the same game. */
  alsoKnownAs?: string[];
  players: string;
  /** One sentence a player can read at the tee. */
  summary: string;
  sections: RulebookSection[];
  /** Short, honest note about how the app records it. */
  appNote?: string;
  ratingNote?: string;
};

export const RULEBOOK: RulebookEntry[] = [
  // -------------------------------------------------------------- formats
  {
    id: "singles",
    category: "format",
    name: "Singles",
    players: "1 or more",
    summary: "Everyone throws their own disc from their own lie and keeps their own score.",
    sections: [
      {
        heading: "How it plays",
        lines: [
          "Each player throws every shot of their own round, from tee to basket.",
          "Play order is furthest from the basket throws first once everyone is off the tee.",
          "Each player records their own strokes on every hole, including penalties.",
        ],
      },
    ],
    ratingNote:
      "Singles stroke play is the only format that can produce a DGD or PDGA round rating.",
  },
  {
    id: "doubles",
    category: "format",
    name: "Doubles",
    players: "4, 6 or 8 (two-player teams)",
    summary: "Two players form one team and post a single score per hole.",
    sections: [
      {
        heading: "How it plays",
        lines: [
          "Both partners throw from the tee, then the team follows the throw style you picked.",
          "The team writes one score per hole — the strokes it took the team to hole out.",
          "Partners may coach each other freely; it is one team, one score.",
        ],
      },
      {
        heading: "Common setups",
        lines: [
          "Random draw doubles: partners are drawn at the first tee.",
          "Blind draw: one A-pool player is paired with one B-pool player.",
          "Pick your partner: teams are set before the round.",
        ],
      },
    ],
    ratingNote: "One score per team means doubles rounds never count toward ratings.",
  },
  {
    id: "teams",
    category: "format",
    name: "Teams",
    players: "3 to 5 per team",
    summary: "Three or more players per side, still posting one score per hole.",
    sections: [
      {
        heading: "How it plays",
        lines: [
          "Everyone on the team throws from the tee, then the team plays on under the chosen throw style.",
          "With larger teams, alternate-style rules usually rotate through the full order.",
          "One score per hole per team, exactly like doubles.",
        ],
      },
    ],
    ratingNote: "Team play is never rated.",
  },

  // ---------------------------------------------------------- throw styles
  {
    id: "best_throw",
    category: "throw_style",
    name: "Best throw",
    alsoKnownAs: ["Best shot", "Best disc", "Scramble"],
    players: "Any team size",
    summary: "The team picks whichever throw it wants to play next — normally the best one.",
    sections: [
      {
        heading: "How it plays",
        lines: [
          "Everyone on the team throws, then the team chooses the lie it wants to continue from.",
          "It is a free choice: the longest drive is not always the best lie, and the team may take a shorter throw with a better angle.",
          "Every player then throws their next shot from within 30 cm behind that chosen lie.",
          "Repeat until one player holes out; that stroke count is the team score.",
        ],
      },
      {
        heading: "Etiquette",
        lines: [
          "Mark the chosen lie before anyone picks up a disc.",
          "A putt that is holed ends the hole immediately — the partner does not need to putt.",
        ],
      },
    ],
    appNote: "The card records one score per hole for the team; individual throws are not tracked.",
  },
  {
    id: "worst_throw",
    category: "throw_style",
    name: "Worst throw",
    alsoKnownAs: ["Worst shot", "Tough lie doubles"],
    players: "Any team size",
    summary: "The team must play the most difficult lie, decided by card consensus.",
    sections: [
      {
        heading: "How it plays",
        lines: [
          "Everyone on the team throws, then the team plays on from the hardest lie — not automatically the longest one.",
          "The card agrees which lie is toughest: behind a tree, in the rough, awkward stance, blocked angle, downhill on a slick lie.",
          "If the card cannot agree, the group decides by majority; a tied group plays the lie furthest from the basket.",
          "Both players throw from the agreed lie every throw, including putts, until the disc is holed.",
        ],
      },
      {
        heading: "Scoring reality",
        lines: [
          "Expect scores well over par — worst throw is a grind, not a birdie hunt.",
          "Many groups shorten it to 9 holes or drop the worst-throw rule inside the circle.",
        ],
      },
    ],
    appNote: "One score per hole per team, same as any team round.",
  },
  {
    id: "alternate_throw",
    category: "throw_style",
    name: "Alternate throw",
    alsoKnownAs: ["Alternate shot", "Foursomes"],
    players: "Any team size",
    summary: "One disc, one team, taking strict turns on every throw.",
    sections: [
      {
        heading: "How it plays",
        lines: [
          "The team throws a single disc and the partners alternate every throw.",
          "Player 1 drives, player 2 throws the upshot, player 1 putts — then player 2 drives the next hole.",
          "The turn order carries across holes: whoever did not throw last throws next.",
          "With teams of three or more, rotate through the full order in the same way.",
        ],
      },
      {
        heading: "Penalties",
        lines: [
          "A penalty throw does not change the turn — the same player still throws the next shot from the relief lie.",
          "Throwing out of turn is normally re-thrown by the correct player with no penalty when caught before the next throw.",
        ],
      },
    ],
  },
  {
    id: "modified_best_throw",
    category: "throw_style",
    name: "Modified best throw",
    alsoKnownAs: ["Modified scramble"],
    players: "Any team size",
    summary: "Best throw, except the same partner's throw cannot be used three holes in a row.",
    sections: [
      {
        heading: "How it plays",
        lines: [
          "Play best throw as usual: everyone throws, the team picks the lie it wants.",
          "The team may not use the same partner's drive for a third straight hole — after two, the other partner's drive must be played.",
          "Some groups apply the rule to every throw, not just drives; agree which before the first tee.",
          "It keeps both players honest and stops one arm carrying the whole card.",
        ],
      },
    ],
  },

  // -------------------------------------------------------------- scoring
  {
    id: "stroke_play",
    category: "scoring",
    name: "Stroke play",
    players: "Any",
    summary: "Total throws decide it — the PDGA standard.",
    sections: [
      {
        heading: "How it plays",
        lines: [
          "Add every throw and penalty across the round; lowest total wins.",
          "Every hole matters equally, and a bad hole stays on the card.",
        ],
      },
    ],
    ratingNote: "Singles stroke play is the only setup that feeds DGD and PDGA ratings.",
  },
  {
    id: "skins",
    category: "scoring",
    name: "Skins",
    alsoKnownAs: ["Skins game", "Doubles skins"],
    players: "2 or more players, or 2 or more teams",
    summary: "Each hole is a prize; ties push the skin onto the next hole.",
    sections: [
      {
        heading: "How it plays",
        lines: [
          "Every hole is worth one skin, usually with an agreed value per skin.",
          "The lowest score on the hole wins the skin outright.",
          "Any tie for the low score carries the skin forward, so the next hole is worth two or more.",
          "Carried skins keep stacking until somebody wins a hole alone.",
        ],
      },
      {
        heading: "Playing skins as doubles",
        lines: [
          "Set the format to Doubles or Teams and the scoring type to Skins — teams then compete for each skin instead of individuals.",
          "The team's single hole score is what wins or ties the skin.",
          "Blind-draw partners plus skins is the most common league night side game.",
          "Validation variation: a team must win the next hole outright, or at least tie it, to bank a carried skin.",
        ],
      },
      {
        heading: "Settling up",
        lines: [
          "Multiply skins won by the agreed value, or split a fixed pot by skins won.",
          "Unwon skins left at the last hole are usually replayed on hole 1 or carried to next week.",
        ],
      },
    ],
  },

  // ------------------------------------------- casual games (scoring types)
  {
    id: "wolf",
    category: "scoring",
    name: "Wolf",
    alsoKnownAs: ["Ship, Captain and Crew", "Pig", "Captain"],
    players: "3 to 5 (4 is the classic setup)",
    summary:
      "A rotating Wolf picks a partner for the hole — or goes it alone against the whole card for bigger points.",
    sections: [
      {
        heading: "The basics",
        lines: [
          "Everyone plays their own disc all round — it is singles scoring with new teams every hole.",
          "One player is the Wolf on each hole and the role rotates through the group.",
          "The Wolf usually takes a partner against the rest, called the Hunters. Going alone is Lone Wolf: one against the field.",
        ],
      },
      {
        heading: "Tee order",
        lines: [
          "Set an order before the round — flip a disc or randomize it.",
          "Players rotate one tee position every hole, and the Wolf is either always first or always last for the whole round.",
          "With four players the Wolf role repeats every four holes; re-order at holes 9 and 17 so nobody gets a permanent advantage on the hardest holes.",
          "Example with the Wolf last: hole 1 Rod, Ed, Mike, Wayne(W) — hole 2 Wayne, Rod, Ed, Mike(W) — hole 3 Mike, Wayne, Rod, Ed(W).",
        ],
      },
      {
        heading: "Picking a partner",
        lines: [
          "Wolf last: after each player tees off, the Wolf must call that player as a partner before the next player throws.",
          "Pass on a player and you cannot come back to them.",
          "Reach the tee having passed on everyone and you are Lone Wolf by default.",
          "Wolf first: the Wolf tees off, then watches the rest — same timing rule, call the partner before the next throw.",
          "Blind Wolf (optional): the Wolf declares Lone Wolf before anyone throws, including themselves, for the biggest points.",
        ],
      },
      {
        heading: "Scoring the hole",
        lines: [
          "Only the low score on each side counts; a common set of values is used and every group tunes it.",
          "Wolf and partner win the hole: 2 points each.",
          "Hunters win: 3 points each.",
          "Lone Wolf beats everyone: 4 points.",
          "Anyone beats a Lone Wolf: 1 point each to the Hunters, nothing to the Wolf.",
          "Blind Wolf usually doubles the Lone Wolf value.",
          "Ties score zero in the classic game, or roll the points into the next hole if you play Carryover.",
        ],
      },
      {
        heading: "Settling up",
        lines: [
          "Total the points at the end of the round.",
          "Per-point payout is most common: the point difference times an agreed value.",
          "Some groups play a flat pot, winner takes all.",
        ],
      },
      {
        heading: "On a disc golf course",
        lines: [
          "Wolf plays identically with discs — rotating Wolf, partner-or-solo calls, Lone and Blind Wolf, Hunters chasing.",
          "Nothing changes but the fairway: same tee rotation, same partner timing, same scoring.",
        ],
      },
    ],
    appNote:
      "Everyone still keeps a normal singles scorecard, so your throws, birdies and stats are unaffected. Wolf points decide who wins the round.",
  },
  {
    id: "imposter",
    category: "scoring",
    name: "Imposter",
    alsoKnownAs: ["Among Us golf", "Mole", "Traitor"],
    players: "4 to 6",
    summary:
      "The card plays as one team while one hidden Imposter quietly plays against it — then everyone votes.",
    sections: [
      {
        heading: "The basics",
        lines: [
          "It is not doubles and it is not teams-on-teams: it is the card versus one hidden player, normally 3 against 1.",
          "Before the round the app secretly assigns one player as the Imposter; everyone else is Crew and only knows their own role.",
          "The Crew is trying to beat a target — an agreed team score, or simply beating par across the round.",
          "The Imposter is trying to make the Crew miss that target without being identified.",
        ],
      },
      {
        heading: "Playing a hole",
        lines: [
          "Everyone throws their own disc and keeps their own score, so nobody can tell roles from the card alone.",
          "The Crew's hole score is its best score; the Imposter's throws count toward it too, which is exactly how they can quietly sink a hole.",
          "The Imposter has to look like they are trying: obvious sandbagging is how you get voted out.",
          "Rotating variation: the app reassigns the Imposter every three holes so suspicion resets.",
        ],
      },
      {
        heading: "Discussion and the vote",
        lines: [
          "Talk it out between holes — a suspicious layup, a bailed putt, a strange disc choice.",
          "Vote once, at an agreed point: after 9 holes, after 18, or on any hole the group calls a vote.",
          "Everyone names one suspect at the same time; most votes is the accused.",
          "A tie means nobody is voted out and play continues.",
        ],
      },
      {
        heading: "Winning",
        lines: [
          "Crew wins if it votes out the Imposter — 3 points each.",
          "Imposter wins by surviving the vote, or by the Crew missing its target — 5 points.",
          "Wrongly voting out a Crew member hands the Imposter the win immediately.",
          "Optional hint mode: the Imposter is told the Crew's target, which makes it easier to steer the group wrong.",
        ],
      },
      {
        heading: "Etiquette",
        lines: [
          "Nobody throws away a disc, damages a lie or breaks a PDGA rule — the Imposter plays their own honest round and simply plays it safe.",
          "Keep it friendly: this is a talking game, and the fun is in the accusations.",
        ],
      },
    ],
    appNote:
      "Roles and votes are called by the group; the app records normal singles scores plus your Imposter result so it never affects your stats.",
  },
];

export const RULEBOOK_BY_ID: Record<string, RulebookEntry> = Object.fromEntries(
  RULEBOOK.map((e) => [e.id, e]),
);

export function rulebookEntry(id: string | null | undefined): RulebookEntry | null {
  if (!id) return null;
  return RULEBOOK_BY_ID[id] ?? null;
}

export const RULEBOOK_CATEGORY_LABELS: Record<RulebookCategory, string> = {
  format: "Play formats",
  throw_style: "Team throw styles",
  scoring: "Scoring types",
};

export function rulebookByCategory(category: RulebookCategory): RulebookEntry[] {
  return RULEBOOK.filter((e) => e.category === category);
}
