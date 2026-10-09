/**
 * Read-only Disc Golf Scene event lookup. Scene tournament/league pages expose
 * JSON-LD / OpenGraph details, so this reuses the shared event-page parser.
 * Nothing is written — the setup wizard decides what to fill in.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseUdiscEventPage, type UdiscEventParsed } from "@/lib/udisc-event.functions";
import { parseSceneDatePhrase } from "@/lib/event-directory-parse";

const Input = z.object({
  url: z
    .string()
    .url()
    .refine(
      (u) => {
        try {
          const h = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
          return h === "discgolfscene.com";
        } catch {
          return false;
        }
      },
      { message: "Paste a discgolfscene.com event link" },
    ),
});

export const fetchSceneEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => Input.parse(raw))
  .handler(async ({ data }): Promise<UdiscEventParsed> => {
    const res = await fetch(data.url, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error("That Disc Golf Scene link redirects — open it in a browser and copy the final URL.");
    }
    if (!res.ok) throw new Error(`Couldn't read that Disc Golf Scene link (${res.status}).`);
    const html = await res.text();
    const parsed = parseUdiscEventPage(html, data.url);
    if (parsed.name) parsed.name = parsed.name.replace(/\s*[|–-]\s*Disc Golf Scene.*$/i, "").trim();
    if (!parsed.start_date) {
      const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      const m = text.match(
        /(?:[A-Z][a-z]{2}(?:-[A-Z][a-z]{2})?,\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:\s*[-–]\s*(?:[A-Z][a-z]+\s+)?\d{1,2})?,\s+20\d{2}/,
      );
      if (m) {
        const range = parseSceneDatePhrase(m[0].replace("–", "-"));
        parsed.start_date = range.start;
        parsed.end_date = range.end ?? range.start;
      }
    }
    if (!parsed.name && !parsed.start_date) {
      throw new Error("Couldn't read event details from that link. Fill the fields in manually.");
    }
    return parsed;
  });
