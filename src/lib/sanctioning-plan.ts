/**
 * Sanctioning rules and the event playbook.
 *
 * One source of truth for what a PDGA tier requires of a tournament director
 * and for the relaxed guidance an unsanctioned event gets instead. The
 * tournament wizard reads this to shape the rest of the setup: how many
 * rounds are required, whether pre-registration is mandatory, which payout
 * style is legal, what has to be printed, staffed, and reported.
 *
 * Requirements summarise the PDGA Competition Manual and Tour Standards. They
 * are planning aids inside DG Dashboard, not a substitute for the manual —
 * every tier card links the director back to the official text.
 */

export type TierCode = "M" | "ES" | "A" | "B" | "C" | "XA" | "XB" | "XC" | "L";

export type PayoutStyleRule = "cash_or_merch" | "merch_only" | "trophy_ok";

export type TierProfile = {
  code: TierCode;
  /** Short label used in menus and badges. */
  label: string;
  /** Who the tier is for. */
  audience: "pro" | "amateur" | "mixed";
  blurb: string;
  /** PDGA per-player sanctioning fee, in cents. */
  playerFeeCents: number;
  /** Minimum rounds the tier must schedule. */
  minRounds: number;
  /** Minimum holes across the whole event. */
  minHoles: number;
  /** Pre-registration required (no walk-ups-only field). */
  preRegistrationRequired: boolean;
  /** Certified officials that must be on site. */
  officialsRequired: number;
  /** The TD must hold a current PDGA Official certification. */
  certifiedTdRequired: boolean;
  /** Event insurance / certificate of insurance expected on file. */
  insuranceRequired: boolean;
  /** Days after the final round to submit results and ratings. */
  reportingDays: number;
  /** Minimum share of the division purse that must be paid out. */
  minPayoutRatio: number;
  /** What winners may legally receive. */
  payoutStyle: PayoutStyleRule;
  /** Printed tee signs / hole maps expected at every tee. */
  teeSignsRequired: boolean;
  /** A live or same-day leaderboard is expected. */
  liveScoringExpected: boolean;
  extraNotes: string[];
};

export const TIER_PROFILES: TierProfile[] = [
  {
    code: "M",
    label: "Major",
    audience: "pro",
    blurb: "PDGA Major. Highest standard for field, staffing, media, and reporting.",
    playerFeeCents: 1500,
    minRounds: 4,
    minHoles: 72,
    preRegistrationRequired: true,
    officialsRequired: 4,
    certifiedTdRequired: true,
    insuranceRequired: true,
    reportingDays: 3,
    minPayoutRatio: 1.0,
    payoutStyle: "cash_or_merch",
    teeSignsRequired: true,
    liveScoringExpected: true,
    extraNotes: [
      "Majors are awarded by the PDGA — you cannot self-assign this tier.",
      "Media, marshals, and spotters are expected on every lead card.",
    ],
  },
  {
    code: "ES",
    label: "Elite Series",
    audience: "pro",
    blurb: "Elite Series stop. Pro field, full officiating, live coverage.",
    playerFeeCents: 1500,
    minRounds: 3,
    minHoles: 54,
    preRegistrationRequired: true,
    officialsRequired: 3,
    certifiedTdRequired: true,
    insuranceRequired: true,
    reportingDays: 3,
    minPayoutRatio: 1.0,
    payoutStyle: "cash_or_merch",
    teeSignsRequired: true,
    liveScoringExpected: true,
    extraNotes: ["Requires PDGA Tour approval before registration opens."],
  },
  {
    code: "A",
    label: "A-tier",
    audience: "mixed",
    blurb: "Premier local event. Pre-registration, officials, and a full purse.",
    playerFeeCents: 1000,
    minRounds: 2,
    minHoles: 36,
    preRegistrationRequired: true,
    officialsRequired: 2,
    certifiedTdRequired: true,
    insuranceRequired: true,
    reportingDays: 5,
    minPayoutRatio: 1.0,
    payoutStyle: "cash_or_merch",
    teeSignsRequired: true,
    liveScoringExpected: true,
    extraNotes: [
      "Pro divisions pay 100% of pro entry fees back as cash.",
      "A playoff decides first place — no shared wins.",
    ],
  },
  {
    code: "B",
    label: "B-tier",
    audience: "mixed",
    blurb: "Standard weekend event. Two rounds, published payout, rated results.",
    playerFeeCents: 500,
    minRounds: 2,
    minHoles: 36,
    preRegistrationRequired: false,
    officialsRequired: 1,
    certifiedTdRequired: true,
    insuranceRequired: true,
    reportingDays: 5,
    minPayoutRatio: 1.0,
    payoutStyle: "cash_or_merch",
    teeSignsRequired: true,
    liveScoringExpected: false,
    extraNotes: ["Pro payout is published before round one and paid the same day."],
  },
  {
    code: "C",
    label: "C-tier",
    audience: "mixed",
    blurb: "Entry-level sanctioned event. One round is enough, rules still apply.",
    playerFeeCents: 300,
    minRounds: 1,
    minHoles: 18,
    preRegistrationRequired: false,
    officialsRequired: 1,
    certifiedTdRequired: false,
    insuranceRequired: true,
    reportingDays: 5,
    minPayoutRatio: 1.0,
    payoutStyle: "cash_or_merch",
    teeSignsRequired: false,
    liveScoringExpected: false,
    extraNotes: ["The easiest way to run rated rounds for your local club."],
  },
  {
    code: "XA",
    label: "XA-tier (amateur only)",
    audience: "amateur",
    blurb: "Amateur-only A-tier. Merchandise payout, no cash to players.",
    playerFeeCents: 1000,
    minRounds: 2,
    minHoles: 36,
    preRegistrationRequired: true,
    officialsRequired: 2,
    certifiedTdRequired: true,
    insuranceRequired: true,
    reportingDays: 5,
    minPayoutRatio: 1.0,
    payoutStyle: "merch_only",
    teeSignsRequired: true,
    liveScoringExpected: true,
    extraNotes: ["Amateurs may only be paid in merchandise, gift certificates, or trophies."],
  },
  {
    code: "XB",
    label: "XB-tier (amateur only)",
    audience: "amateur",
    blurb: "Amateur-only B-tier. Players' pack plus merchandise payout.",
    playerFeeCents: 500,
    minRounds: 2,
    minHoles: 36,
    preRegistrationRequired: false,
    officialsRequired: 1,
    certifiedTdRequired: true,
    insuranceRequired: true,
    reportingDays: 5,
    minPayoutRatio: 1.0,
    payoutStyle: "merch_only",
    teeSignsRequired: true,
    liveScoringExpected: false,
    extraNotes: ["Amateurs may only be paid in merchandise, gift certificates, or trophies."],
  },
  {
    code: "XC",
    label: "XC-tier (amateur only)",
    audience: "amateur",
    blurb: "Amateur-only C-tier. The friendliest way to run a rated am event.",
    playerFeeCents: 300,
    minRounds: 1,
    minHoles: 18,
    preRegistrationRequired: false,
    officialsRequired: 1,
    certifiedTdRequired: false,
    insuranceRequired: true,
    reportingDays: 5,
    minPayoutRatio: 1.0,
    payoutStyle: "merch_only",
    teeSignsRequired: false,
    liveScoringExpected: false,
    extraNotes: ["Amateurs may only be paid in merchandise, gift certificates, or trophies."],
  },
  {
    code: "L",
    label: "League sanctioning",
    audience: "mixed",
    blurb: "Sanctioned league play. Rated rounds week to week.",
    playerFeeCents: 200,
    minRounds: 1,
    minHoles: 9,
    preRegistrationRequired: false,
    officialsRequired: 0,
    certifiedTdRequired: false,
    insuranceRequired: false,
    reportingDays: 30,
    minPayoutRatio: 0,
    payoutStyle: "trophy_ok",
    teeSignsRequired: false,
    liveScoringExpected: false,
    extraNotes: ["League rounds are reported in batches at the end of the session."],
  },
];

export function tierProfile(code: string | null | undefined): TierProfile | null {
  if (!code) return null;
  return TIER_PROFILES.find((t) => t.code === code) ?? null;
}

export function tierLabel(code: string | null | undefined): string {
  return tierProfile(code)?.label ?? "Unsanctioned";
}

export function payoutStyleLabel(style: PayoutStyleRule): string {
  if (style === "merch_only") return "Merchandise, gift certificates, or trophies only";
  if (style === "trophy_ok") return "Anything you like, including trophy-only";
  return "Cash for pros, merchandise for amateurs";
}

/* ------------------------------------------------------------------ */
/* Playbook                                                            */
/* ------------------------------------------------------------------ */

export type PlaybookLevel = "required" | "recommended" | "idea";

export type PlaybookItem = {
  label: string;
  detail: string;
  level: PlaybookLevel;
};

export type PlaybookSection = {
  id:
    | "registration"
    | "communication"
    | "course"
    | "staff"
    | "sponsors"
    | "payouts"
    | "reporting"
    | "fun";
  title: string;
  blurb: string;
  items: PlaybookItem[];
};

export type PlaybookInput = {
  sanctioned: boolean;
  tier: string | null;
  /** Total rounds currently scheduled. */
  rounds: number;
  /** Whether the event collects entry fees. */
  hasEntryFee: boolean;
};

/**
 * Builds the full run-the-event guide: registration through financial
 * reporting. Sanctioned events get the tier's obligations; unsanctioned
 * events get the same shape as friendly guidance plus quirk ideas.
 */
export function buildEventPlaybook(input: PlaybookInput): PlaybookSection[] {
  const t = input.sanctioned ? tierProfile(input.tier) : null;

  if (!t) return unsanctionedPlaybook(input);

  const req = (label: string, detail: string): PlaybookItem => ({
    label,
    detail,
    level: "required",
  });
  const rec = (label: string, detail: string): PlaybookItem => ({
    label,
    detail,
    level: "recommended",
  });

  return [
    {
      id: "registration",
      title: "Registration and the field",
      blurb: "How players get in, and what you owe them before they arrive.",
      items: [
        t.preRegistrationRequired
          ? req(
              "Pre-registration required",
              `${t.label} events take entries ahead of time. Publish an opening and closing time and lock the field at the deadline.`,
            )
          : rec(
              "Open pre-registration early",
              "Walk-ups are allowed at this tier, but a published sign-up list makes card creation and payout math far easier.",
            ),
        req(
          "Current PDGA membership checked",
          "Every player in a sanctioned division needs current membership or must pay the non-member fee at check-in.",
        ),
        req(
          `Sanctioning fee collected — $${(t.playerFeeCents / 100).toFixed(2)} per player`,
          "Collect it inside the entry fee and remit it with your results report.",
        ),
        req(
          "Signed waiver from every player",
          "Collect on registration or at check-in. Keep them on file for a year.",
        ),
        rec(
          "Waitlist and refund policy published",
          "State the cutoff for a full refund and how the waitlist moves. Write it once on the event page.",
        ),
      ],
    },
    {
      id: "communication",
      title: "Player communication and literature",
      blurb: "What players read before they tee off.",
      items: [
        req(
          "Event page with rules, schedule, and payout",
          "Divisions, entry fees, added cash, tee times, and the local rules must all be public before registration opens.",
        ),
        req(
          "Players' meeting held before round one",
          "Cover OB, mandos, drop zones, pace of play, safety, and where to return scorecards.",
        ),
        rec(
          "Pre-event email 48 hours out",
          "Parking, check-in window, layout map, weather plan, and the TD's phone number.",
        ),
        rec(
          "Printed caddy book or hole map",
          `${t.label} fields expect a layout reference — hand out a caddy book or post one hole map at check-in.`,
        ),
      ],
    },
    {
      id: "course",
      title: "Course work and tee signs",
      blurb: "The course has to match what you published.",
      items: [
        t.teeSignsRequired
          ? req(
              "Tee signs on every hole",
              "Hole number, par, distance, and the basket position in play. Required at this tier.",
            )
          : rec(
              "Tee signs on every hole",
              "Hole number, par, distance, and basket position. Not mandatory at this tier, but it prevents most rules calls.",
            ),
        req(
          "OB, mandos, and drop zones marked on the ground",
          "Paint, rope, or flags must match the local rules sheet exactly. Walk the course the morning of the event.",
        ),
        req(
          `Layout locked for all ${Math.max(input.rounds, t.minRounds)} rounds`,
          "Basket positions and tee pads may only change between rounds if you announce it at the players' meeting.",
        ),
        rec(
          "Land manager sign-off and parking plan",
          "Confirm the reservation, gate access, restrooms, and trash in writing.",
        ),
      ],
    },
    {
      id: "staff",
      title: "Staff and volunteers",
      blurb: "Who runs the day with you.",
      items: [
        t.officialsRequired > 0
          ? req(
              `${t.officialsRequired} certified PDGA official${t.officialsRequired > 1 ? "s" : ""} on site`,
              "Officials must be reachable on course during play, not just at the TD table.",
            )
          : rec("A certified official on site", "Useful even when the tier doesn't require one."),
        t.certifiedTdRequired
          ? req(
              "TD holds a current PDGA Official certification",
              "Required to run this tier. Renew before you submit sanctioning.",
            )
          : rec(
              "TD certification",
              "Not required at this tier, but the exam is free and takes an hour.",
            ),
        rec(
          "Check-in and scoring volunteers",
          "Plan one check-in volunteer per 40 players and one scoring volunteer per round.",
        ),
        (t.code === "M" || t.code === "ES" || t.code === "A" ? req : rec)(
          "One person on CTP prizes and registration changes",
          t.code === "M" || t.code === "ES"
            ? "A dedicated staffer owns CTP flags and papers, the ace pot ledger, and every add, drop, division change, and refund. Changes are logged and initialed before the round starts."
            : t.code === "A"
              ? "One named person sets the CTP flags, holds the ace pot money, and handles adds, drops, and division moves so the TD is never pulled off the course."
              : t.code === "B"
                ? "Hand CTP flags, the ace pot, and late registration changes to one helper and post their name at the TD table."
                : "Even a small C-tier runs smoother when one helper owns CTP flags, the ace pot, and last-minute division changes.",
        ),
        (t.code === "M" || t.code === "ES" || t.code === "A" ? req : rec)(
          "One person on course readiness",
          t.code === "M" || t.code === "ES"
            ? "Full sweep the day before and the morning of: tee pads swept and edged, branches and sight lines trimmed, baskets true with fresh chains, OB paint refreshed, trash and recycling stations stocked, restrooms serviced and stocked, water available, parking and paths clear. Photograph each hole as the record."
            : t.code === "A"
              ? "Walk all holes the morning of: tee pads clean, branches trimmed, baskets level, OB markings visible, trash cans placed and emptied, restrooms open and stocked, water on site, parking marked."
              : t.code === "B"
                ? "One helper checks tee pads, obvious branch hazards, basket condition, trash cans, and restroom access before the first tee time."
                : "Assign one helper to sweep tee pads, clear branches, set out trash cans, and confirm restroom or portable access.",
        ),
        t.liveScoringExpected
          ? req(
              "Live scoring crew",
              "Lead-card scoring and a public leaderboard are expected at this tier.",
            )
          : rec("Score posting plan", "Post each round within 30 minutes of the last card in."),
      ],

    },
    {
      id: "sponsors",
      title: "Sponsors and club support",
      blurb: "The money that isn't entry fees.",
      items: [
        rec(
          "Added cash tracked separately",
          "Sponsor money added to the purse must be listed on the event page and reported to the PDGA.",
        ),
        rec(
          "Sponsor recognition plan",
          "Tee sign logos, players' pack inserts, and a thank-you post after the event.",
        ),
        rec(
          "Club approval on file",
          "If the club's name or insurance is on the event, get the board's written sign-off.",
        ),
        t.insuranceRequired
          ? req(
              "Event insurance / certificate of insurance",
              "Most land managers require a COI naming them as additional insured.",
            )
          : rec("Event insurance", "Recommended any time you use public land."),
      ],
    },
    {
      id: "payouts",
      title: "Payouts and prizes",
      blurb: payoutStyleLabel(t.payoutStyle),
      items: [
        req(
          "Payout published before round one",
          "Post the division-by-division breakdown at the TD table and on the event page.",
        ),
        t.payoutStyle === "merch_only"
          ? req(
              "Amateur payout is merchandise only",
              "Cash to an amateur costs them their amateur status. Use merch, gift certificates, or trophies.",
            )
          : req(
              "Pro cash, amateur merchandise",
              "Pro divisions are paid in cash. Amateur divisions may only receive merchandise or certificates.",
            ),
        req(
          "Entry fees returned to the purse",
          "After the sanctioning fee and stated expenses, entry money goes back to the players in that division.",
        ),
        rec(
          "Ace pot and CTP rules written down",
          "State the buy-in, what carries over, and who holds the money if nobody hits.",
        ),
        rec(
          "Payout paid the same day",
          "Have cash, certificates, or merch on hand before the final round ends.",
        ),
      ],
    },
    {
      id: "reporting",
      title: "Financial reporting and wrap-up",
      blurb: "The part that keeps your sanctioning.",
      items: [
        req(
          `Results and ratings report submitted within ${t.reportingDays} days`,
          "Scores, divisions, payouts, and player fees all go in the PDGA event report.",
        ),
        req(
          "Sanctioning and player fees remitted",
          `$${(t.playerFeeCents / 100).toFixed(2)} per player is owed to the PDGA with the report.`,
        ),
        rec(
          "Reconcile the event ledger",
          "Entry fees in, payout out, sanctioning fees, sponsor money, and expenses. Keep the sheet with the scorecards.",
        ),
        rec(
          "Archive scorecards and waivers for a year",
          "Scan them if you can. Ratings disputes and insurance claims both need them.",
        ),
        rec(
          "Thank-you note and survey",
          "One email with results, photos, and a two-question survey earns next year's field.",
        ),
        ...t.extraNotes.map((n) => rec("Tier note", n)),
      ],
    },
  ];
}

function unsanctionedPlaybook(input: PlaybookInput): PlaybookSection[] {
  const rec = (label: string, detail: string): PlaybookItem => ({
    label,
    detail,
    level: "recommended",
  });
  const idea = (label: string, detail: string): PlaybookItem => ({
    label,
    detail,
    level: "idea",
  });

  return [
    {
      id: "registration",
      title: "Registration and the field",
      blurb: "Your event, your rules. Keep sign-up as light as you want.",
      items: [
        rec(
          "Pick a sign-up mode that matches the vibe",
          "Walk-ups only is perfect for a fun round. Pre-registration helps when you're ordering players' packs.",
        ),
        rec(
          "Cap the field to the course",
          "Roughly four players per hole keeps a shotgun start moving.",
        ),
        input.hasEntryFee
          ? rec(
              "Say where the money goes",
              "Even a $10 entry deserves one line: payout, ace pot, and anything the club keeps.",
            )
          : idea(
              "Free to enter, bring a prize",
              "Ask every player to bring a disc for the prize table instead of charging an entry fee.",
            ),
        rec(
          "Collect a simple waiver",
          "No sanctioning body required — a one-line acknowledgement still protects you and the land manager.",
        ),
      ],
    },
    {
      id: "communication",
      title: "Player communication",
      blurb: "Tell people what to expect and they'll come back.",
      items: [
        rec(
          "One event page with the essentials",
          "Where, when, what it costs, what's played, and what's won.",
        ),
        rec(
          "Short players' meeting",
          "Two minutes on OB, safety, the quirks you're running, and where to return cards.",
        ),
        idea(
          "Group chat for the day",
          "A single thread for CTP winners, weather calls, and photos keeps the day social.",
        ),
      ],
    },
    {
      id: "course",
      title: "Course work",
      blurb: "Light setup, clear markings.",
      items: [
        rec(
          "Mark anything you're calling OB",
          "Paint or flags beat a verbal description every time.",
        ),
        idea(
          "Temporary holes and alt pins",
          "An unsanctioned event is the place to try that island green or a 350-foot temp hole.",
        ),
        rec(
          "Leave the course better than you found it",
          "Pack out markings and trash before you head home.",
        ),
      ],
    },
    {
      id: "staff",
      title: "Staff and volunteers",
      blurb: "A couple of helpers is usually plenty.",
      items: [
        rec("One person on check-in", "Names, money, and division in one place."),
        rec("One person on scores", "Collect cards after the round and post the results."),
        rec(
          "One person on CTP prizes and registration changes",
          "They set the CTP flags and papers, hold the ace pot money, and handle late adds, drops, and division switches.",
        ),
        rec(
          "One person on course readiness",
          "Before the first tee: tee pads swept, low branches trimmed, baskets standing straight, trash cans out, restrooms or portables open, water and parking sorted.",
        ),
        idea("Recruit a photographer", "Photos are what fill the field next time."),

      ],
    },
    {
      id: "sponsors",
      title: "Sponsors and club support",
      blurb: "Local shops are usually glad to help.",
      items: [
        idea(
          "Ask the local shop for CTP prizes",
          "A couple of discs and a gift card cover the whole prize table.",
        ),
        idea(
          "Run it as a fundraiser",
          "Charity events attract sponsors and draw players who don't normally compete.",
        ),
        rec("Thank sponsors publicly", "A tee sign and a post-event post costs you nothing."),
      ],
    },
    {
      id: "payouts",
      title: "CTP prizes",
      blurb: "Closest to the pin, ace pot, and how the table gets handed out.",
      items: [
        rec(
          "Publish the prize plan before round one",
          "Trophy-only, merch table, or cash — say which before anyone pays, and post which holes are CTP.",
        ),
        rec(
          "Flag and paper on every CTP hole",
          "Players closest to the basket write their name on the paper attached to the flag. Last name on the sheet at the end of the day wins the prize.",
        ),
        rec(
          "Say how CTP prizes are assigned",
          "Pick one and post it: prizes drawn at random, prizes tied to a hole number (1-18), or winners pick from the table in the order their holes are called.",
        ),
        idea(
          "Random prize, random order",
          "Pull CTP winners out of a hat and hand out whatever comes off the table next. Fastest to run, no arguing over value.",
        ),
        idea(
          "Prize assigned by hole number",
          "Number the prizes 1-18 to match the CTP holes. Winner of hole 7 takes prize 7 — everyone knows what they are throwing for.",
        ),
        idea(
          "Winners pick from the table",
          "Call CTP winners in hole order and let each one choose. Popular when the prizes are close in value.",
        ),
        idea(
          "CTP prize ideas",
          "Premium plastic or a limited stamp, a mini and towel bundle, glow discs, a bag or cart accessory, a shop gift card, a round of pro-line from a sponsor, or an entry credit for the next event.",
        ),
        idea(
          "Add-on CTP holes",
          "Longest drive in the fairway, longest putt made, best comeback from out of bounds, or a $1 side CTP with its own flag.",
        ),
        rec(
          "Ace pot rules written down",
          "State the buy-in, whether the pot carries over to the next event, and who holds the money if nobody hits.",
        ),
        rec(
          "Multiple aces split the pot",
          "If two or more players ace, they split the ace pot evenly. Say that out loud at the players meeting.",
        ),
        rec(
          "No ace means a throw-off",
          "If nobody aces, run a throw-off at the end of the day. Everyone in the pot gets one throw at a chosen basket, and the closest discs split the payout.",
        ),
        idea(
          "Throw-off split options",
          "Common splits: 60/40 to the two closest discs, a straight 50/50, winner-take-all for the closest disc, or 50/30/20 across three when the pot is large.",
        ),
        idea(
          "Throw-off ground rules",
          "Pick the basket ahead of time, throw in random order, mark each disc with the player's name, measure to the center pole, and re-throw if two are inside a disc width of each other.",
        ),
        idea(
          "Carry-over ace pot",
          "Keep a running pot across the league season instead of paying it out. Post the total every week — it fills the field fast.",
        ),
        idea(
          "Prize table by finishing order",
          "Finishers pick from the table in finishing order. Everyone leaves with something.",
        ),
        idea("Random draw payouts", "Pay a few random cards to keep the back of the field engaged."),
      ],
    },

    {
      id: "fun",
      title: "Fun quirks worth trying",
      blurb: "The reason to skip sanctioning in the first place.",
      items: [
        idea("Mulligans for sale", "$5 for one mulligan, proceeds to the prize table or a charity."),
        idea("Ring of fire", "Everyone putts at once from 30 feet; last player standing takes the pot."),
        idea("Challenge holes", "Pay $2 to beat the TD's mark on one hole for a prize."),
        idea("Worst-shot doubles", "The most fun and most humbling format in disc golf."),
        idea("Glow round", "Add lights and run the back nine after dark."),
        idea("Costume or bring-a-beginner bonus", "A stroke off for anyone who brings a first-timer."),
        idea("Throw-off tiebreaker", "Skip the playoff — settle ties with a distance throw-off."),
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Readiness checks                                                    */
/* ------------------------------------------------------------------ */

export type SanctionCheckInput = {
  sanctioned: boolean;
  tier: string | null;
  eventNumber: string;
  rounds: { holes_played: number }[];
  signupType: "casual" | "hybrid" | "formal";
  /** TD confirmed the tier's officials are booked. */
  officialsConfirmed: boolean;
  /** TD confirmed sanctioning is approved in Tour Manager. */
  approvalConfirmed: boolean;
  /** TD confirmed insurance is on file. */
  insuranceConfirmed: boolean;
  /** Payout kind chosen on the fees step. */
  payoutKind: string;
  /** Divisions currently offered. */
  divisionCodes: string[];
};

/** Tier-aware publish checks folded into the wizard's validation list. */
export function sanctioningChecks(
  input: SanctionCheckInput,
): { label: string; pass: boolean }[] {
  if (!input.sanctioned) return [];
  const t = tierProfile(input.tier);
  if (!t) return [{ label: "PDGA tier selected", pass: false }];

  const holes = input.rounds.reduce((sum, r) => sum + (r.holes_played || 0), 0);
  const proDivisions = input.divisionCodes.some((c) => c === "MPO" || c === "FPO");

  return [
    { label: "PDGA event number entered", pass: !!input.eventNumber.trim() },
    {
      label: `${t.label} needs at least ${t.minRounds} round${t.minRounds > 1 ? "s" : ""}`,
      pass: input.rounds.length >= t.minRounds,
    },
    {
      label: `${t.label} needs at least ${t.minHoles} holes of competition`,
      pass: holes >= t.minHoles,
    },
    {
      label: `${t.label} requires pre-registration`,
      pass: !t.preRegistrationRequired || input.signupType !== "casual",
    },
    {
      label: `${t.officialsRequired} certified official${t.officialsRequired === 1 ? "" : "s"} confirmed`,
      pass: t.officialsRequired === 0 || input.officialsConfirmed,
    },
    { label: "Sanctioning approved in PDGA Tour Manager", pass: input.approvalConfirmed },
    {
      label: "Event insurance on file",
      pass: !t.insuranceRequired || input.insuranceConfirmed,
    },
    {
      label: "Amateur-only tier pays merchandise, not cash",
      pass: t.payoutStyle !== "merch_only" || input.payoutKind !== "cash",
    },
    {
      label: "Amateur-only tier can't offer MPO or FPO",
      pass: t.audience !== "amateur" || !proDivisions,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */

export type EventPhase = "pre" | "day_of" | "post";

export type ChecklistRow = { phase: EventPhase; label: string };

/** Which run-the-event phase each playbook section belongs to. */
export const PLAYBOOK_PHASE: Record<PlaybookSection["id"], EventPhase> = {
  registration: "pre",
  communication: "pre",
  course: "pre",
  staff: "pre",
  sponsors: "pre",
  fun: "day_of",
  payouts: "post",
  reporting: "post",
};

/** Filters a built playbook down to one phase. */
export function playbookForPhase(
  sections: PlaybookSection[],
  phase: EventPhase,
): PlaybookSection[] {
  return sections.filter((s) => PLAYBOOK_PHASE[s.id] === phase);
}

/**
 * Builds the TD checklist that gets written with the event. Sanctioned
 * events get the tier's obligations; unsanctioned events get a shorter list
 * without the PDGA-only steps.
 */
export function buildTdChecklist(args: {
  sanctioned: boolean;
  tier: string | null;
  /** Whether the event collects entry fees. */
  hasEntryFee?: boolean;
  /** Whether cash or merch payouts go out. */
  hasPayouts?: boolean;
  /** Rounds scheduled — multi-round events get a reset step. */
  rounds?: number;
}): ChecklistRow[] {
  const t = args.sanctioned ? tierProfile(args.tier) : null;

  const base: ChecklistRow[] = [
    { phase: "pre", label: "Reserve course and parking with the land manager" },
    { phase: "pre", label: "Publish the event page with rules, schedule, and payout" },
    { phase: "pre", label: "Open registration and the waitlist" },
    { phase: "pre", label: "Order players' packs, prizes, and CTP discs" },
    { phase: "pre", label: "Mark OB, mandos, and drop zones on course" },
    { phase: "pre", label: "Print scorecards and confirm scoring devices are charged" },
    { phase: "pre", label: "Send the pre-event email: parking, check-in, layout, weather" },
    { phase: "day_of", label: "Set up the TD table, check-in station, and signage" },
    { phase: "day_of", label: "Check players in and collect signed waivers" },
    { phase: "day_of", label: "Hold the players' meeting: rules, OB, safety, pace" },
    { phase: "day_of", label: "Hand out players' packs and cards" },
    { phase: "day_of", label: "Start on schedule and monitor pace of play" },
    { phase: "day_of", label: "Collect and verify scorecards after each round" },
    { phase: "day_of", label: "Post results after the last card comes in" },
    { phase: "post", label: "Reconcile entry fees, expenses, and prizes" },
    { phase: "post", label: "Send the thank-you email with results and photos" },
    { phase: "post", label: "Return the course to pre-event condition" },
  ];

  const settingRows: ChecklistRow[] = [];
  const fees = args.hasEntryFee ?? false;
  const payouts = args.hasPayouts ?? fees;
  const rounds = Math.max(1, args.rounds ?? 1);

  if (fees) {
    settingRows.push(
      { phase: "pre", label: "Publish the entry fee, what it covers, and the refund cutoff" },
      { phase: "day_of", label: "Collect entry fees and mark each player paid at check-in" },
      { phase: "post", label: "Balance the cash box against the registration list" },
    );
  } else {
    settingRows.push({
      phase: "pre",
      label: "Confirm the free-entry plan: who provides discs, CTPs, or trophies",
    });
  }

  if (payouts) {
    settingRows.push(
      { phase: "pre", label: "Post the payout table by division before round one" },
      { phase: "day_of", label: "Set the CTP and ace pot rules at the players' meeting" },
      { phase: "post", label: "Pay out on site and post the final payout sheet" },
    );
  } else {
    settingRows.push(
      { phase: "pre", label: "Say up front that this event is for bragging rights, not payouts" },
      { phase: "day_of", label: "Hand out CTP and side-game prizes as they are won" },
    );
  }

  if (rounds > 1) {
    settingRows.push({
      phase: "day_of",
      label: `Reset cards and call tee times between all ${rounds} rounds`,
    });
  }

  if (!t) {
    return [
      ...base,
      ...settingRows,
      { phase: "pre", label: "Write down the fun rules: mulligans, CTPs, side games" },
      { phase: "post", label: "Ask players what to change for next time" },
    ];
  }

  const tierRows: ChecklistRow[] = [
    { phase: "pre", label: `Confirm ${t.label} sanctioning approval and event number` },
    { phase: "pre", label: "Verify current PDGA membership for every registrant" },
    {
      phase: "pre",
      label: `Book ${Math.max(1, t.officialsRequired)} certified PDGA official${t.officialsRequired > 1 ? "s" : ""}`,
    },
    { phase: "pre", label: "Publish the division-by-division payout before round one" },
    { phase: "day_of", label: "Verify PDGA numbers and collect non-member fees at check-in" },
    {
      phase: "post",
      label: `Submit results and ratings report to the PDGA within ${t.reportingDays} days`,
    },
    {
      phase: "post",
      label: `Remit $${(t.playerFeeCents / 100).toFixed(2)} per player in sanctioning fees`,
    },
    { phase: "post", label: "Archive scorecards and waivers for one calendar year" },
  ];

  if (t.insuranceRequired) {
    tierRows.unshift({ phase: "pre", label: "Purchase event insurance and file the COI" });
  }
  if (t.teeSignsRequired) {
    tierRows.unshift({ phase: "pre", label: "Print and place tee signs on every hole" });
  }
  if (t.certifiedTdRequired) {
    tierRows.unshift({ phase: "pre", label: "Confirm the TD's PDGA Official certification is current" });
  }
  if (t.liveScoringExpected) {
    tierRows.push({ phase: "day_of", label: "Run live scoring and keep the leaderboard current" });
  }

  return [...base, ...settingRows, ...tierRows];
}
