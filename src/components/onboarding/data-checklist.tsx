import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, X, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Step = {
  key: string;
  title: string;
  blurb: string;
  href: string;
  cta: string;
  done: boolean;
};

const DISMISS_KEY = "dgd:onboarding-checklist:dismissed";

export function DataChecklist({ userId }: { userId: string | undefined }) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    if (!userId || dismissed) return;
    let cancelled = false;

    (async () => {
      const [profile, rounds, events, friends] = await Promise.all([
        supabase.from("profiles").select("pdga_number").eq("id", userId).maybeSingle(),
        supabase
          .from("external_rounds")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("scheduled_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("friendships")
          .select("id", { count: "exact", head: true })
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
          .eq("status", "accepted"),
      ]);

      if (cancelled) return;

      const s: Step[] = [
        {
          key: "pdga",
          title: "Link your PDGA number",
          blurb: "Unlocks rated round history and event sync.",
          href: "/settings/imports",
          cta: "Add PDGA #",
          done: !!profile.data?.pdga_number,
        },
        {
          key: "rounds",
          title: "Import your first round",
          blurb: "UDisc CSV, PDGA lookup, DGS, or manual entry.",
          href: "/settings/imports?tab=rounds",
          cta: "Import rounds",
          done: (rounds.count ?? 0) > 0,
        },
        {
          key: "schedule",
          title: "Sync your schedule",
          blurb: "See upcoming PDGA events and leagues on your calendar.",
          href: "/schedule",
          cta: "Open schedule",
          done: (events.count ?? 0) > 0,
        },
        {
          key: "crew",
          title: "Find your crew",
          blurb: "Follow friends and see their rounds & results.",
          href: "/friends",
          cta: "Find friends",
          done: (friends.count ?? 0) > 0,
        },
      ];
      setSteps(s);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, dismissed]);

  if (dismissed || !userId) return null;

  // Hide once all steps are complete.
  if (steps && steps.every((s) => s.done)) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  const doneCount = steps?.filter((s) => s.done).length ?? 0;
  const total = steps?.length ?? 4;

  return (
    <section aria-label="Getting started" className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Get set up in 4 steps</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {steps
              ? `${doneCount} of ${total} complete — each step is a single click.`
              : "Checking your account…"}
          </p>
          <Link
            to="/welcome"
            className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
          >
            New here? Try every feature on the welcome page →
          </Link>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss onboarding checklist"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!steps ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : (
        <ol className="space-y-2">
          {steps.map((step) => (
            <li
              key={step.key}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3"
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-medium ${
                    step.done ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {step.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">{step.blurb}</p>
              </div>
              {!step.done && (
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link to={step.href}>
                    {step.cta}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
