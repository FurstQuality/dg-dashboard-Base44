/**
 * Turns a director task (checklist item or playbook step) into the place where
 * the work actually gets done — a course page, a schedule section, the invite
 * tools, join codes, staff access, or event settings.
 */

export type DirectorTaskContext = {
  kind: "league" | "tournament";
  /** URL slug of the event, used for links to the player-facing page. */
  slug: string;
  /** Primary course for the event, when one is set. */
  courseId?: string | null;
};

export type DirectorTaskTarget =
  | { kind: "hash"; hash: string; label: string }
  | { kind: "course"; courseId: string; label: string }
  | { kind: "courses"; label: string }
  | { kind: "player"; label: string };

type Rule = {
  /** Any of these words in the task text triggers the rule. */
  words: string[];
  resolve: (ctx: DirectorTaskContext) => DirectorTaskTarget | null;
};

const RULES: Rule[] = [
  {
    words: [
      "course",
      "venue",
      "layout",
      "reserve",
      "parking",
      "tee sign",
      "teepad",
      "tee pad",
      "basket",
      "trash",
      "garbage",
      "bathroom",
      "restroom",
      "trim",
      "mow",
      "readiness",
      "walk the",
    ],
    resolve: (ctx) =>
      ctx.courseId
        ? { kind: "course", courseId: ctx.courseId, label: "Open course page" }
        : { kind: "courses", label: "Find the course" },
  },
  {
    words: ["sanction", "pdga", "tier", "insurance", "waiver", "event number"],
    resolve: () => ({ kind: "hash", hash: "settings", label: "Sanctioning settings" }),
  },
  {
    words: [
      "invite",
      "promote",
      "announce",
      "publicize",
      "communication",
      "email",
      "text",
      "social",
      "flyer",
      "share",
    ],
    resolve: () => ({ kind: "hash", hash: "invite", label: "Invite players" }),
  },
  {
    words: [
      "score",
      "scorecard",
      "card",
      "join code",
      "kiosk",
      "live",
      "check-in",
      "check in",
      "checkin",
    ],
    resolve: () => ({ kind: "hash", hash: "scoring", label: "Scoring & join codes" }),
  },
  {
    words: ["staff", "volunteer", "marshal", "helper", "co-director", "assistant", "access"],
    resolve: () => ({ kind: "hash", hash: "access", label: "Manage who can help" }),
  },
  {
    words: [
      "payout",
      "prize",
      "ctp",
      "ace pot",
      "cash",
      "merch",
      "entry fee",
      "money",
      "budget",
      "fee",
    ],
    resolve: () => ({ kind: "hash", hash: "settings", label: "Fees & payouts" }),
  },
  {
    words: [
      "registration",
      "sign-up",
      "signup",
      "sign up",
      "register",
      "waitlist",
      "cap",
      "division",
      "roster",
      "field",
    ],
    resolve: () => ({ kind: "hash", hash: "signups", label: "Sign-ups & divisions" }),
  },
  {
    words: ["standing", "result", "report", "rating", "submit", "wrap", "recap"],
    resolve: () => ({ kind: "player", label: "View standings" }),
  },
  {
    words: ["schedule", "week", "night", "date", "round", "start time", "tee time"],
    resolve: () => ({ kind: "hash", hash: "schedule", label: "Edit the schedule" }),
  },
];

export function resolveDirectorTask(
  text: string,
  ctx: DirectorTaskContext,
): DirectorTaskTarget | null {
  const t = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.words.some((w) => t.includes(w))) return rule.resolve(ctx);
  }
  return null;
}
