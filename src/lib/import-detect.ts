// Universal Add Data — pure client-side detector.
// Given a pasted string (or file), return the best import route plus
// plain-language guidance for the preview step.

export type DetectedKind =
  | "pdga_number"
  | "pdga_player_url"
  | "pdga_event_url"
  | "udisc_url"
  | "dgscene_url"
  | "facebook_url"
  | "generic_url"
  | "unknown";

export type DetectResult = {
  kind: DetectedKind;
  label: string; // human-facing short label ("PDGA player #12345")
  summary: string; // what will happen in plain English
  normalized: string; // canonical value (trimmed URL or extracted PDGA #)
  pdgaNumber?: string;
  route:
    | { type: "pdga-sync" } // sync current user's PDGA rounds/rating
    | { type: "pdga-friend"; number: string } // add PDGA player as friend/tracker
    | { type: "drop-link"; url: string } // scrapeClubUrl / generic ingest
    | { type: "udisc-csv" } // handled by file variant
    | { type: "none" };
};

export function detectInput(raw: string): DetectResult {
  const s = (raw ?? "").trim();
  if (!s) {
    return {
      kind: "unknown",
      label: "",
      summary: "Paste a PDGA number, a link, or drop a UDisc CSV.",
      normalized: "",
      route: { type: "none" },
    };
  }

  // Bare PDGA number (5–6 digits typical, allow 3–7)
  if (/^#?\d{3,7}$/.test(s)) {
    const num = s.replace(/^#/, "");
    return {
      kind: "pdga_number",
      label: `PDGA #${num}`,
      summary:
        "We'll look this up on PDGA.com. If it's you, sync your official rating and rated rounds. If it's someone else, add them as a friend/tracker.",
      normalized: num,
      pdgaNumber: num,
      route: { type: "pdga-friend", number: num },
    };
  }

  const urlLike = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let url: URL | null = null;
  try {
    url = new URL(urlLike);
  } catch {
    url = null;
  }

  if (!url) {
    return {
      kind: "unknown",
      label: s.slice(0, 40),
      summary: "That doesn't look like a PDGA number or a link. Try pasting a URL.",
      normalized: s,
      route: { type: "none" },
    };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname;

  // PDGA player page: /player/12345
  const player = path.match(/\/player\/(\d{3,7})/i);
  if (host.endsWith("pdga.com") && player) {
    const num = player[1];
    return {
      kind: "pdga_player_url",
      label: `PDGA player #${num}`,
      summary:
        "We'll pull this player's official rating, rated rounds, and career stats. Use this to sync your own profile or add someone as a tracker.",
      normalized: url.toString(),
      pdgaNumber: num,
      route: { type: "pdga-friend", number: num },
    };
  }

  // PDGA event / tour page
  if (host.endsWith("pdga.com") && /\/(tour|event|apps\/tournament)/i.test(path)) {
    return {
      kind: "pdga_event_url",
      label: "PDGA event",
      summary:
        "We'll import the event, its divisions, and (when available) the tee sheet. Add it to your schedule or a friend tracker.",
      normalized: url.toString(),
      route: { type: "drop-link", url: url.toString() },
    };
  }

  if (host.endsWith("udisc.com")) {
    return {
      kind: "udisc_url",
      label: "UDisc link",
      summary:
        "We'll try to read the course or event from UDisc. For scorecards, use the UDisc CSV export instead — it's more reliable.",
      normalized: url.toString(),
      route: { type: "drop-link", url: url.toString() },
    };
  }

  if (host.endsWith("discgolfscene.com") || host.endsWith("dgscene.com")) {
    return {
      kind: "dgscene_url",
      label: "Disc Golf Scene link",
      summary:
        "We'll import the event or club page from Disc Golf Scene and add it to your schedule.",
      normalized: url.toString(),
      route: { type: "drop-link", url: url.toString() },
    };
  }

  if (host.endsWith("facebook.com") || host.endsWith("fb.com")) {
    return {
      kind: "facebook_url",
      label: "Facebook page",
      summary:
        "We'll read the public page metadata — good for clubs and events, but Facebook hides a lot from scrapers. Expect a partial import.",
      normalized: url.toString(),
      route: { type: "drop-link", url: url.toString() },
    };
  }

  return {
    kind: "generic_url",
    label: host,
    summary:
      "We'll fetch this page and pull out anything useful — title, description, cover image, location. You'll get a preview before we save.",
    normalized: url.toString(),
    route: { type: "drop-link", url: url.toString() },
  };
}

export function detectFile(file: File): DetectResult {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    return {
      kind: "unknown",
      label: file.name,
      summary:
        "Looks like a UDisc scorecard export. We'll parse each round and add it to your history — sanctioned PDGA rounds won't be overwritten.",
      normalized: file.name,
      route: { type: "udisc-csv" },
    };
  }
  return {
    kind: "unknown",
    label: file.name,
    summary: "Only CSV files (from UDisc) are supported for direct upload right now.",
    normalized: file.name,
    route: { type: "none" },
  };
}
