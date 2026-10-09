import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getRuleDocument, RULE_STATUS_LABEL } from "@/lib/rules.functions";

const docQuery = (code: string) =>
  queryOptions({ queryKey: ["rule-document", code], queryFn: () => getRuleDocument({ data: { code } }) });

export const Route = createFileRoute("/rules/$code")({
  loader: async ({ context, params }) => {
    const doc = await context.queryClient.ensureQueryData(docQuery(params.code));
    if (!doc) throw notFound();
    return { title: doc.title, summary: doc.summary };
  },
  head: ({ loaderData }) => {
    const title = `${loaderData?.title ?? "DGD Rules"} | DG Dashboard`;
    const desc = loaderData?.summary ?? "DGD rules and standards.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <p>That rule document doesn't exist. <Link to="/rules" className="underline">See all rules & standards</Link>.</p>
    </main>
  ),
  component: RuleDocPage,
});

function RuleDocPage() {
  const { code } = Route.useParams();
  const { data: doc } = useSuspenseQuery(docQuery(code));
  const [q, setQ] = useState("");
  const entries = doc?.entries ?? [];

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (t: string) => !needle || t.toLowerCase().includes(needle);
    return entries
      .filter((e) => e.kind === "section")
      .map((s) => ({
        section: s,
        rules: entries.filter(
          (r) => r.parent_number === s.number && (match(r.number) || match(r.title) || match(r.body) || match(s.title)),
        ),
      }))
      .filter((g) => g.rules.length > 0);
  }, [entries, q]);

  if (!doc) return null;
  const status = doc.current?.status;

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8 space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link to="/rules" className="hover:underline">Rules & Standards</Link> / {doc.title}
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{doc.title}</h1>
        <p className="text-muted-foreground">{doc.summary}</p>
        {doc.current && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{doc.current.version_label}</Badge>
            <span className={status === "published" ? "text-foreground" : "text-warning"}>
              {status ? RULE_STATUS_LABEL[status] : ""}
            </span>
            {doc.current.effective_at && (
              <span className="text-muted-foreground">
                Effective {new Date(doc.current.effective_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </span>
            )}
          </div>
        )}
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rules — try OB, mando or 180.3" className="pl-9" aria-label="Search rules" />
      </div>

      {sections.length === 0 ? (
        <p className="text-muted-foreground">No rules match “{q}”. Try a shorter word or a rule number.</p>
      ) : (
        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
          <aside className="hidden lg:block">
            <ol className="sticky top-20 space-y-1 text-sm">
              {sections.map(({ section }) => (
                <li key={section.number}>
                  <a href={`#dgd-${section.number}`} className="text-muted-foreground hover:text-foreground">
                    {section.number} · {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </aside>
          <div className="space-y-8">
            {sections.map(({ section, rules }) => (
              <section key={section.number} id={`dgd-${section.number}`} className="scroll-mt-20 space-y-3">
                <h2 className="text-lg font-semibold">{section.number} — {section.title}</h2>
                {rules.map((r) => (
                  <article key={r.number} id={`dgd-${r.number}`} className="scroll-mt-20 rounded-lg border bg-card p-4">
                    <h3 className="flex items-center gap-2 font-medium">
                      <span className="tabular-nums text-primary">DGD {r.number}</span> {r.title}
                      {r.is_protected && (
                        <span title="Events can't change this rule" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" aria-hidden /> Protected
                        </span>
                      )}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed">{r.body}</p>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </div>
      )}

      {doc.versions.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Version history</h2>
          <ul className="space-y-1 text-sm">
            {doc.versions.map((v) => (
              <li key={v.id}>
                <span className="font-medium">{v.version_label}</span> — {RULE_STATUS_LABEL[v.status]}
                {v.changelog ? ` · ${v.changelog}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
