import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bug, Lightbulb, Star, FlaskConical, MessageSquare, CheckCircle2 } from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { BetaFeedbackDialog } from "@/components/beta/beta-feedback-widget";
import { BetaScreenshotPreview } from "@/components/beta/beta-screenshot-preview";
import {
  kindLabel,
  statusLabel,
  useBetaProgram,
  type BetaFeedback,
  type BetaFeedbackKind,
} from "@/lib/beta";

export const Route = createFileRoute("/_authenticated/beta")({
  component: BetaHub,
  head: () => ({
    meta: [
      { title: "Beta program · DG Dashboard" },
      {
        name: "description",
        content:
          "What we're testing this round, how to report bugs and ideas, and the status of every note you've sent.",
      },
      { property: "og:title", content: "DG Dashboard beta program" },
      {
        property: "og:description",
        content: "Test every feature, send feedback in one tap, and track what we've fixed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const KIND_ICON: Record<BetaFeedbackKind, typeof Bug> = {
  bug: Bug,
  idea: Lightbulb,
  rating: Star,
};

function BetaHub() {
  const { user } = useSession();
  const program = useBetaProgram();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<BetaFeedbackKind>("bug");

  const mine = useQuery({
    queryKey: ["beta", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beta_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as BetaFeedback[];
    },
  });

  const rows = mine.data ?? [];
  const resolved = rows.filter((r) => r.status === "resolved").length;

  function launch(k: BetaFeedbackKind) {
    setKind(k);
    setOpen(true);
  }

  return (
    <PageShell>
      <PageHeader
        title={program.data?.program_name ?? "Beta program"}
        description={
          program.data?.is_enabled
            ? "Play with everything, break it on purpose, and tell us what felt off. Every note lands on our triage board."
            : "The beta program is paused right now. Your past notes are still here."
        }
        primaryAction={
          <Button className="gap-2" onClick={() => launch("bug")}>
            <FlaskConical className="h-4 w-4" /> Send feedback
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Build you're testing</p>
          <p className="mt-1 text-lg font-semibold">{program.data?.build_label ?? "—"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Notes you've sent</p>
          <p className="mt-1 text-lg font-semibold">{rows.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Fixed from your notes</p>
          <p className="mt-1 text-lg font-semibold">{resolved}</p>
        </div>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-base font-semibold">How to test</h2>
        <p className="mt-1 text-sm text-muted-foreground">{program.data?.welcome_message}</p>
        {program.data?.focus_areas?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {program.data.focus_areas.map((f) => (
              <Badge key={f} variant="secondary">
                {f}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => launch("bug")}>
            <Bug className="h-4 w-4" /> Report a bug
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => launch("idea")}>
            <Lightbulb className="h-4 w-4" /> Suggest an improvement
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => launch("rating")}>
            <Star className="h-4 w-4" /> Rate a page
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Your submissions</h2>
        {mine.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your notes…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/50 p-6 text-center text-sm text-muted-foreground">
            Nothing sent yet. Hit the Beta feedback button on any screen and tell us what you see.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <li key={r.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{r.title}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {kindLabel(r.kind)} · {r.page_label ?? r.route_path ?? "—"} ·{" "}
                        {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={r.status === "resolved" ? "default" : "secondary"}>
                      {r.status === "resolved" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
                      {statusLabel(r.status)}
                    </Badge>
                  </div>
                  {r.body ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {r.body}
                    </p>
                  ) : null}
                  <BetaScreenshotPreview path={r.screenshot_path} />
                  {r.resolution_note ? (
                    <p className="mt-2 flex items-start gap-2 rounded-lg bg-muted/60 p-2 text-sm">
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      {r.resolution_note}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BetaFeedbackDialog key={kind} open={open} onOpenChange={setOpen} defaultKind={kind} />
    </PageShell>
  );
}
