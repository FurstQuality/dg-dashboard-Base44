/**
 * What Ace knows.
 *
 * Before Ace answers, we pull the relevant slice of the app's own disc golf
 * knowledge — the written knowledge library plus live course, event and player
 * records — and hand it to the model as facts it must answer from. This is why
 * Ace can name real courses near you instead of pointing you at another app.
 */
import { detectStateCode, searchTerms } from "./regions";

type Client = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => any;
};

type KnowledgeRow = {
  kind: string;
  title: string;
  body: string;
  region: string | null;
  state: string | null;
  source: string;
};

function trim(text: string, max = 420): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Assemble the knowledge block for one question. Never throws — a missing
 * table or a denied read just means a thinner block, not a failed answer.
 */
export async function buildAceKnowledge(
  supabase: Client,
  question: string,
  opts: { homeState?: string | null } = {},
): Promise<string> {
  const askedState = detectStateCode(question);
  const state = askedState ?? opts.homeState ?? null;
  const terms = searchTerms(question);
  const query = terms.join(" ") || question.slice(0, 120);
  const today = new Date().toISOString().slice(0, 10);

  const safe = async <T>(run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch {
      return fallback;
    }
  };

  const [entries, courses, events, players] = await Promise.all([
    safe(async () => {
      const { data } = await supabase.rpc("search_ace_knowledge", {
        _query: query,
        _state: state,
        _limit: 10,
      });
      return (data ?? []) as KnowledgeRow[];
    }, [] as KnowledgeRow[]),
    safe(
      async () => {
        let q = supabase
          .from("courses")
          .select("name, city, state, hole_count, pdga_rating, difficulty, designer, description")
          .eq("moderation_status", "approved");
        if (state) q = q.eq("state", state);
        const nameLike = terms.filter((t) => t.length > 3).slice(0, 3);
        if (!state && nameLike.length) q = q.ilike("name", `%${nameLike[0]}%`);
        const { data } = await q
          .order("pdga_rating", { ascending: false, nullsFirst: false })
          .limit(12);
        return (data ?? []) as Record<string, any>[];
      },
      [] as Record<string, any>[],
    ),
    safe(
      async () => {
        let q = supabase
          .from("event_directory")
          .select("name, kind, tier, start_date, end_date, venue_name, city, state, source, url")
          .gte("start_date", today);
        if (state) q = q.eq("state", state);
        const { data } = await q.order("start_date", { ascending: true }).limit(10);
        return (data ?? []) as Record<string, any>[];
      },
      [] as Record<string, any>[],
    ),
    safe(
      async () => {
        const nameLike = terms.filter((t) => t.length > 3).slice(0, 2);
        if (!nameLike.length) return [] as Record<string, any>[];
        const { data } = await supabase
          .from("pdga_kb_players")
          .select("name, pdga_number, rating, class, city, state, career_wins")
          .ilike("name", `%${nameLike[0]}%`)
          .order("rating", { ascending: false, nullsFirst: false })
          .limit(5);
        return (data ?? []) as Record<string, any>[];
      },
      [] as Record<string, any>[],
    ),
  ]);

  const sections: string[] = [];

  if (state)
    sections.push(`Region in focus: ${state}${askedState ? " (asked about)" : " (home state)"}`);

  if (courses.length) {
    sections.push(
      "COURSES IN THE APP (real records — use these names):\n" +
        courses
          .map((c) => {
            const bits = [
              `${c.name}${c.city ? ` — ${c.city}` : ""}${c.state ? `, ${c.state}` : ""}`,
              c.hole_count ? `${c.hole_count} holes` : null,
              c.pdga_rating ? `course rating ${c.pdga_rating}` : null,
              c.difficulty ? `${c.difficulty}` : null,
              c.designer ? `designed by ${c.designer}` : null,
            ].filter(Boolean);
            return `  - ${bits.join(" · ")}${c.description ? ` — ${trim(String(c.description), 160)}` : ""}`;
          })
          .join("\n"),
    );
  }

  if (events.length) {
    sections.push(
      "UPCOMING EVENTS IN THE APP:\n" +
        events
          .map(
            (e) =>
              `  - ${e.start_date}${e.end_date && e.end_date !== e.start_date ? `–${e.end_date}` : ""}: ${e.name}` +
              `${e.tier ? ` (${e.tier})` : ""} · ${[e.venue_name, e.city, e.state].filter(Boolean).join(", ")}` +
              `${e.source ? ` · via ${e.source}` : ""}`,
          )
          .join("\n"),
    );
  }

  if (players.length) {
    sections.push(
      "PLAYERS IN THE APP:\n" +
        players
          .map(
            (p) =>
              `  - ${p.name}${p.pdga_number ? ` (#${p.pdga_number})` : ""}${p.rating ? ` — rating ${p.rating}` : ""}` +
              `${p.class ? `, ${p.class}` : ""}${p.city || p.state ? ` · ${[p.city, p.state].filter(Boolean).join(", ")}` : ""}` +
              `${p.career_wins ? ` · ${p.career_wins} career wins` : ""}`,
          )
          .join("\n"),
    );
  }

  if (entries.length) {
    sections.push(
      "ACE KNOWLEDGE LIBRARY:\n" +
        entries.map((k) => `  - [${k.kind}] ${k.title}: ${trim(k.body)}`).join("\n"),
    );
  }

  if (!sections.length) return "APP_KNOWLEDGE: (nothing on file for this question yet)";

  return `APP_KNOWLEDGE (facts from DG Dashboard's own database — treat as true and cite by name):\n${sections.join("\n\n")}`;
}
