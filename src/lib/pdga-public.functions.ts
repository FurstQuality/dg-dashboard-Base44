// Public (unauthenticated) PDGA player preview.
// Powers the marketing preview page so prospects can see a taste of what
// DG Dashboard shows once they sign up — without needing an account first.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`PDGA fetch failed (${res.status})`);
  return await res.text();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseProfileImage(html: string): string | null {
  const patterns = [
    /<img[^>]+src="([^"]+\/player-photos\/[^"]+)"/i,
    /<img[^>]+src="([^"]+scaled_and_cropped[^"]+)"/i,
    /<img[^>]+typeof="foaf:Image"[^>]+src="([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const raw = m[1].replace(/&amp;/g, "&");
      if (/logo|icon|placeholder|avatar-default/i.test(raw)) continue;
      if (raw.startsWith("http")) return raw;
      if (raw.startsWith("//")) return `https:${raw}`;
      if (raw.startsWith("/")) return `https://www.pdga.com${raw}`;
    }
  }
  return null;
}

export type PdgaPublicPreview = {
  pdgaNumber: number;
  name: string | null;
  location: string | null;
  classification: string | null;
  currentRating: number | null;
  roundsUsed: number | null;
  memberSince: string | null;
  avatarUrl: string | null;
  careerWins: number | null;
  careerEvents: number | null;
  highlightRounds: Array<{ tournament: string; date: string; rating: number }>;
  profileUrl: string;
};

export const getPdgaPublicPreview = createServerFn({ method: "POST" })
  .inputValidator((raw) =>
    z.object({ pdgaNumber: z.number().int().min(1).max(999_999_999) }).parse(raw),
  )
  .handler(async ({ data }): Promise<PdgaPublicPreview> => {
    const [profileHtml, detailHtml, winsHtml] = await Promise.all([
      fetchText(`https://www.pdga.com/player/${data.pdgaNumber}`),
      fetchText(`https://www.pdga.com/player/${data.pdgaNumber}/details`).catch(() => ""),
      fetchText(`https://www.pdga.com/player/${data.pdgaNumber}/wins`).catch(() => ""),
    ]);

    // Player-info pane — scope out footer chrome
    const cutoff = profileHtml.search(/Copyright\s*&copy;|Copyright\s*©/i);
    const scoped = cutoff > 0 ? profileHtml.slice(0, cutoff) : profileHtml;
    const plain = stripTags(scoped);

    const nameMatch = scoped.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const rating = plain.match(/Current Rating[:\s]+(\d{3,4})/i);
    const rounds = plain.match(/Rounds Used[:\s]+(\d+)/i);
    const memberSince = plain.match(/Member Since[:\s]+(\d{4})/i);
    const cls = plain.match(/\b(Amateur|Professional)\b/);
    const locLabel = plain.match(/Location[:\s]+([A-Z][A-Za-z .'\-]+(?:,\s*[A-Za-z .'\-]+){0,2})/);

    // Career events count (Tournament Results table rows)
    const eventRows = (profileHtml.match(/<tr[^>]*class="[^"]*(?:odd|even)[^"]*"/gi) ?? []).length;
    // Career wins — rows on /wins page
    const winRows = winsHtml
      ? (winsHtml.match(/<tr[^>]*class="[^"]*(?:odd|even)[^"]*"/gi) ?? []).length
      : null;

    // Pull top 3 highest-rated recent rounds
    const highlightRounds: PdgaPublicPreview["highlightRounds"] = [];
    if (detailHtml) {
      const trs = detailHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
      const rows: Array<{ tournament: string; date: string; rating: number }> = [];
      for (const tr of trs) {
        const cells = tr.match(/<td[\s\S]*?<\/td>/gi);
        if (!cells || cells.length < 4) continue;
        const text = cells.map((c) => stripTags(c));
        const rIdx = text.findIndex((t) => /^\d{3,4}$/.test(t) && +t >= 500 && +t <= 1200);
        if (rIdx < 0) continue;
        const ratingVal = +text[rIdx];
        const dateVal = text.find((t) => /\d{1,2}-[A-Za-z]{3}-\d{4}|\d{4}-\d{2}-\d{2}/.test(t));
        const tournament = text.find(
          (t) => t.length > 4 && !/^\d/.test(t) && !/^[A-Z]{2,4}$/.test(t),
        );
        if (!dateVal || !tournament) continue;
        rows.push({ tournament, date: dateVal, rating: ratingVal });
      }
      rows.sort((a, b) => b.rating - a.rating);
      highlightRounds.push(...rows.slice(0, 3));
    }

    return {
      pdgaNumber: data.pdgaNumber,
      name: nameMatch ? stripTags(nameMatch[1]) : null,
      location: locLabel ? locLabel[1].replace(/\s+Classification.*$/i, "").trim() : null,
      classification: cls ? cls[1] : null,
      currentRating: rating ? +rating[1] : null,
      roundsUsed: rounds ? +rounds[1] : null,
      memberSince: memberSince ? memberSince[1] : null,
      avatarUrl: parseProfileImage(scoped),
      careerWins: winRows,
      careerEvents: eventRows || null,
      highlightRounds,
      profileUrl: `https://www.pdga.com/player/${data.pdgaNumber}`,
    };
  });
