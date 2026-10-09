import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { listRuleDocuments, RULE_STATUS_LABEL } from "@/lib/rules.functions";

const docsQuery = queryOptions({ queryKey: ["rule-documents"], queryFn: () => listRuleDocuments() });

const TITLE = "DGD Rules & Standards | DG Dashboard";
const DESC = "The rules of play, competition code and standards for DGD-sanctioned disc golf events, with full version history.";

export const Route = createFileRoute("/rules/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://dgdashboard.app/og-rules.jpg" },
      { name: "twitter:image", content: "https://dgdashboard.app/og-rules.jpg" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(docsQuery),
  component: RulesIndex,
});

function RulesIndex() {
  const { data: docs } = useSuspenseQuery(docsQuery);
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">DGD Rules & Standards</h1>
        <p className="text-muted-foreground">
          The rules for DGD-sanctioned events. PDGA-sanctioned events follow PDGA rules; custom events show their own rules on the event page.
        </p>
      </header>
      <ul className="divide-y rounded-xl border bg-card">
        {docs.map((d) => (
          <li key={d.code}>
            {d.current ? (
              <Link to="/rules/$code" params={{ code: d.code }} className="flex items-center gap-3 p-4 hover:bg-muted/50">
                <BookOpen className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <Row title={d.title} summary={d.summary} />
                <Badge variant="secondary" className="shrink-0">{d.current.version_label}</Badge>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ) : (
              <div className="flex items-center gap-3 p-4">
                <BookOpen className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                <Row title={d.title} summary={d.summary} />
                <span className="shrink-0 text-sm text-muted-foreground">Being written</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Published rules are never erased. Older versions stay readable so past events keep the rules they were played under.
        {" "}Status labels: {RULE_STATUS_LABEL.proposed.toLowerCase()} means you can read it, but it doesn't govern events yet.
      </p>
    </main>
  );
}

function Row({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="font-medium">{title}</div>
      <div className="text-sm text-muted-foreground">{summary}</div>
    </div>
  );
}
