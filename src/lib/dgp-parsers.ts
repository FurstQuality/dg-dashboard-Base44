/**
 * Pure parsers for the Disc Golf Professor skill-group survey pages.
 * No I/O, so every branch is unit-testable.
 *
 * Each page (e.g. /skill-group-d-4-fairway-drivers-backhand/) embeds its
 * tallied survey results in a `__FRMTABLES={...}` script block. Three shot
 * shapes per page, four questions per shape: disc, weight, distance, flight.
 *
 * Source: Disc Golf Professor (discgolfprofessor.com). Aggregate tallies only.
 */

export type DiscClass = "distance_driver" | "fairway_driver" | "midrange" | "putter";
export type ThrowStyle = "backhand" | "forehand";
export type ShotShape = "hyzer" | "straight" | "anhyzer";
export type AnswerKind = "disc" | "weight" | "distance" | "flight";

export type RatingBand = { label: string; min: number | null; max: number | null };

export type ParsedAnswer = {
  answer_kind: AnswerKind;
  label: string;
  submissions: number;
  rank: number;
  brand: string | null;
  mold: string | null;
  weight_min_g: number | null;
  weight_max_g: number | null;
  distance_min_ft: number | null;
  distance_max_ft: number | null;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
};

export type ParsedShotProfile = {
  disc_class: DiscClass;
  throw_style: ThrowStyle;
  shot_shape: ShotShape;
  speed_min: number | null;
  speed_max: number | null;
  submissions: number;
  answers: ParsedAnswer[];
};

export type ParsedSkillGroupPage = {
  group_code: string;
  udisc: RatingBand;
  pdga: RatingBand;
  profiles: ParsedShotProfile[];
};

/** UDisc average-score band, keyed by the letter in the group code. */
const UDISC_BANDS: Record<string, RatingBand> = {
  a: { label: "No UDisc rating", min: null, max: null },
  b: { label: "Under 100", min: null, max: 99 },
  c: { label: "100 – 149", min: 100, max: 149 },
  d: { label: "150 – 199", min: 150, max: 199 },
  e: { label: "200 – 249", min: 200, max: 249 },
  f: { label: "250 – 299", min: 250, max: 299 },
  g: { label: "300 and up", min: 300, max: null },
};

/** PDGA rating band, keyed by the number in the group code. */
const PDGA_BANDS: Record<string, RatingBand> = {
  "1": { label: "No PDGA rating", min: null, max: null },
  "2": { label: "Under 800", min: null, max: 799 },
  "3": { label: "800 – 849", min: 800, max: 849 },
  "4": { label: "850 – 899", min: 850, max: 899 },
  "5": { label: "900 – 949", min: 900, max: 949 },
  "6": { label: "950 and up", min: 950, max: null },
};

export const DGP_GROUP_CODES: string[] = Object.keys(UDISC_BANDS).flatMap((letter) =>
  Object.keys(PDGA_BANDS).map((n) => `${letter}-${n}`),
);

const CLASS_SLUGS: Record<string, DiscClass> = {
  "distance-drivers": "distance_driver",
  "fairway-drivers": "fairway_driver",
  "mid-ranges": "midrange",
  putters: "putter",
};

export const DGP_CLASS_SLUGS = Object.keys(CLASS_SLUGS);

/** Every leaf page URL in the dataset (42 skill groups x 4 classes x 2 styles). */
export function dgpPageUrls(): string[] {
  const urls: string[] = [];
  for (const code of DGP_GROUP_CODES) {
    for (const cls of DGP_CLASS_SLUGS) {
      for (const style of ["backhand", "forehand"]) {
        urls.push(`https://discgolfprofessor.com/skill-group-${code}-${cls}-${style}/`);
      }
    }
  }
  return urls;
}

export function parseGroupCode(code: string): { udisc: RatingBand; pdga: RatingBand } | null {
  const m = /^([a-g])-([1-6])$/.exec(code.trim().toLowerCase());
  if (!m) return null;
  return { udisc: UDISC_BANDS[m[1]], pdga: PDGA_BANDS[m[2]] };
}

/** Pull the group code, disc class and throw style out of a page URL. */
export function parsePageUrl(
  url: string,
): { group_code: string; disc_class: DiscClass; throw_style: ThrowStyle } | null {
  const m = /skill-group-([a-g])-([1-6])-([a-z-]+)-(backhand|forehand)/i.exec(url);
  if (!m) return null;
  const disc_class = CLASS_SLUGS[m[3].toLowerCase()];
  if (!disc_class) return null;
  return {
    group_code: `${m[1].toLowerCase()}-${m[2]}`,
    disc_class,
    throw_style: m[4].toLowerCase() as ThrowStyle,
  };
}

/** Extract the embedded `__FRMTABLES` object with brace matching. */
export function extractFrmTables(html: string): { graphs?: unknown[] } | null {
  const at = html.indexOf("__FRMTABLES=");
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const KIND_BY_LETTER: Record<string, AnswerKind> = {
  A: "disc",
  B: "weight",
  C: "distance",
  D: "flight",
};

/** "INNOVA CHAMPION DISCS-LEOPARD 3" -> brand + mold. */
export function splitBrandMold(label: string): { brand: string | null; mold: string | null } {
  const raw = label.trim();
  const idx = raw.indexOf("-");
  if (idx <= 0) return { brand: null, mold: titleCase(raw) || null };
  return {
    brand: titleCase(raw.slice(0, idx)) || null,
    mold: titleCase(raw.slice(idx + 1).replace(/-/g, " ")) || null,
  };
}

function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** "173G-175G" -> [173, 175]; "180G+" -> [180, null]. */
export function parseWeightRange(label: string): [number | null, number | null] {
  const nums = label.match(/\d+/g);
  if (!nums) return [null, null];
  if (nums.length === 1) return [Number(nums[0]), /\+|and up|over/i.test(label) ? null : Number(nums[0])];
  return [Number(nums[0]), Number(nums[1])];
}

/** "250FT-299FT" -> [250, 299]; "400FT+" -> [400, null]. */
export function parseDistanceRange(label: string): [number | null, number | null] {
  const nums = label.match(/\d+/g);
  if (!nums) return [null, null];
  if (nums.length === 1)
    return [Number(nums[0]), /\+|and up|over|more/i.test(label) ? null : Number(nums[0])];
  return [Number(nums[0]), Number(nums[1])];
}

/** "7/5/-2/1" -> speed 7, glide 5, turn -2, fade 1. */
export function parseFlightNumbers(label: string): {
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
} {
  const parts = label
    .split(/[/|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const val = (i: number) => {
    const n = Number.parseFloat((parts[i] ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  if (parts.length < 4) return { speed: null, glide: null, turn: null, fade: null };
  return { speed: val(0), glide: val(1), turn: val(2), fade: val(3) };
}

function shapeFromQuestion(text: string): {
  shot_shape: ShotShape;
  speed_min: number | null;
  speed_max: number | null;
} | null {
  const shape = /\b(hyzer|straight|anhyzer)\b/i.exec(text);
  if (!shape) return null;
  const speeds = /\(?\s*speeds?\s*([\d.]+)\s*[-–]\s*([\d.]+)/i.exec(text);
  return {
    shot_shape: shape[1].toLowerCase() as ShotShape,
    speed_min: speeds ? Number(speeds[1]) : null,
    speed_max: speeds ? Number(speeds[2]) : null,
  };
}

function buildAnswer(kind: AnswerKind, label: string, submissions: number, rank: number): ParsedAnswer {
  const base: ParsedAnswer = {
    answer_kind: kind,
    label,
    submissions,
    rank,
    brand: null,
    mold: null,
    weight_min_g: null,
    weight_max_g: null,
    distance_min_ft: null,
    distance_max_ft: null,
    speed: null,
    glide: null,
    turn: null,
    fade: null,
  };
  if (kind === "disc") return { ...base, ...splitBrandMold(label) };
  if (kind === "weight") {
    const [lo, hi] = parseWeightRange(label);
    return { ...base, weight_min_g: lo, weight_max_g: hi };
  }
  if (kind === "distance") {
    const [lo, hi] = parseDistanceRange(label);
    return { ...base, distance_min_ft: lo, distance_max_ft: hi };
  }
  return { ...base, ...parseFlightNumbers(label) };
}

/**
 * Parse one leaf page into shot profiles. Questions are numbered `<n>.<A-D>`,
 * so the number groups the four questions of a single shot shape together.
 */
export function parseSkillGroupPage(input: {
  url: string;
  html: string;
}): ParsedSkillGroupPage | null {
  const meta = parsePageUrl(input.url);
  if (!meta) return null;
  const bands = parseGroupCode(meta.group_code);
  if (!bands) return null;

  const tables = extractFrmTables(input.html);
  const graphs = Array.isArray(tables?.graphs) ? (tables!.graphs as any[]) : [];

  type Bucket = { shape: ReturnType<typeof shapeFromQuestion>; answers: ParsedAnswer[] };
  const buckets = new Map<number, Bucket>();

  for (const graph of graphs) {
    const rows: unknown[] = Array.isArray(graph?.data) ? graph.data : [];
    const header = Array.isArray(rows[0]) ? (rows[0] as unknown[]) : null;
    const title = typeof header?.[0] === "string" ? (header[0] as string) : "";
    const m = /^(\d+)\.([A-Z])\s*(.*)$/.exec(title);
    if (!m) continue;
    const q = Number(m[1]);
    const kind = KIND_BY_LETTER[m[2]];
    if (!kind) continue;

    const bucket = buckets.get(q) ?? { shape: null, answers: [] };
    if (kind === "disc" && !bucket.shape) bucket.shape = shapeFromQuestion(m[3]);
    if (!bucket.shape) bucket.shape = shapeFromQuestion(m[3]) ?? bucket.shape;

    let rank = 0;
    for (const row of rows.slice(1)) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const label = String(row[0] ?? "").trim();
      const submissions = Number(row[1]);
      if (!label || !Number.isFinite(submissions)) continue;
      rank += 1;
      bucket.answers.push(buildAnswer(kind, label, Math.round(submissions), rank));
    }
    buckets.set(q, bucket);
  }

  const profiles: ParsedShotProfile[] = [];
  for (const bucket of [...buckets.values()]) {
    if (!bucket.shape || bucket.answers.length === 0) continue;
    const discTotal = bucket.answers
      .filter((a) => a.answer_kind === "disc")
      .reduce((sum, a) => sum + a.submissions, 0);
    profiles.push({
      disc_class: meta.disc_class,
      throw_style: meta.throw_style,
      shot_shape: bucket.shape.shot_shape,
      speed_min: bucket.shape.speed_min,
      speed_max: bucket.shape.speed_max,
      submissions: discTotal,
      answers: bucket.answers,
    });
  }

  return {
    group_code: meta.group_code,
    udisc: bands.udisc,
    pdga: bands.pdga,
    profiles,
  };
}

/** Pick the skill-group code that matches a player's ratings. */
export function skillGroupCodeFor(input: {
  pdgaRating?: number | null;
  udiscRating?: number | null;
}): string {
  const letter =
    input.udiscRating == null
      ? "a"
      : input.udiscRating >= 300
        ? "g"
        : input.udiscRating >= 250
          ? "f"
          : input.udiscRating >= 200
            ? "e"
            : input.udiscRating >= 150
              ? "d"
              : input.udiscRating >= 100
                ? "c"
                : "b";
  const number =
    input.pdgaRating == null
      ? "1"
      : input.pdgaRating >= 950
        ? "6"
        : input.pdgaRating >= 900
          ? "5"
          : input.pdgaRating >= 850
            ? "4"
            : input.pdgaRating >= 800
              ? "3"
              : "2";
  return `${letter}-${number}`;
}
