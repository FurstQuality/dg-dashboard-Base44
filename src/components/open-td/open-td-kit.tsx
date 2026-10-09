import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ClipboardList, Copy, Eye, Link2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { planSummaryLine, taskProgress, type OpenPlan } from "@/lib/open-td-plan";
import { useOpenPlan } from "./use-open-plan";
import { PlanBasics } from "./plan-basics";
import { PlanChecklist } from "./plan-checklist";
import { PlanSchedule } from "./plan-schedule";
import { PlanMoneyPanel } from "./plan-money";
import { PlanRoster } from "./plan-roster";

/** The whole free directing tool: works with or without an account. */
export function OpenTdKit({ shareToken }: { shareToken?: string }) {
  const navigate = useNavigate();
  const kit = useOpenPlan(shareToken);
  const [copied, setCopied] = useState(false);

  if (kit.status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening the kit…
      </div>
    );
  }

  if (kit.status === "missing" || kit.status === "error") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 text-center">
        <h2 className="text-base font-semibold">That plan link didn't open</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may have been mistyped or the plan removed. You can start a fresh one — nothing
          to sign up for.
        </p>
        <Button className="mt-4" onClick={() => void navigate({ to: "/td-kit" })}>
          Start a new plan
        </Button>
      </div>
    );
  }

  const plan = kit.plan as OpenPlan;
  const progress = taskProgress(plan.tasks);
  const done = progress.reduce((s, p) => s + p.done, 0);
  const total = progress.reduce((s, p) => s + p.total, 0);
  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/td-kit/${shareToken}`
      : null;

  async function createLink() {
    const token = await kit.share();
    if (!token) return;
    toast.success("Share link created. Bookmark it — it's how you get back in.");
    await navigate({ to: "/td-kit/$token", params: { token } });
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <ClipboardList className="h-3.5 w-3.5" /> Free event director kit
          </div>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{plan.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{planSummaryLine(plan)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {done} of {total} steps ticked ·{" "}
            {kit.mode === "shared"
              ? kit.canEdit
                ? kit.saving
                  ? "Saving…"
                  : "Saved to your share link"
                : "View only — ask the director for the editing link"
              : "Saved in this browser only"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {kit.mode === "local" ? (
            <Button onClick={() => void createLink()} disabled={kit.sharing}>
              <Link2 className="mr-1 h-4 w-4" />
              {kit.sharing ? "Creating…" : "Create shareable link"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void copyLink()}>
              {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
              {copied ? "Copied" : "Copy share link"}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm("Start over with a blank plan? This clears the current one.")) {
                kit.reset(plan.kind);
              }
            }}
          >
            <RefreshCw className="mr-1 h-4 w-4" /> Start over
          </Button>
        </div>
      </header>

      {!kit.canEdit && kit.mode === "shared" ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Eye className="h-4 w-4" /> You're reading a shared plan. Changes here won't be saved.
        </div>
      ) : null}

      <Tabs defaultValue="checklist">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="basics">Event basics</TabsTrigger>
          <TabsTrigger value="schedule">Running order</TabsTrigger>
          <TabsTrigger value="money">Divisions & payout</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
        </TabsList>
        <TabsContent value="checklist">
          <PlanChecklist plan={plan} canEdit={kit.canEdit} update={kit.update} />
        </TabsContent>
        <TabsContent value="basics">
          <PlanBasics plan={plan} canEdit={kit.canEdit} update={kit.update} />
        </TabsContent>
        <TabsContent value="schedule">
          <PlanSchedule plan={plan} canEdit={kit.canEdit} update={kit.update} />
        </TabsContent>
        <TabsContent value="money">
          <PlanMoneyPanel plan={plan} canEdit={kit.canEdit} update={kit.update} />
        </TabsContent>
        <TabsContent value="players">
          <PlanRoster plan={plan} canEdit={kit.canEdit} update={kit.update} />
        </TabsContent>
      </Tabs>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-sm">
        <span className="font-medium">Want registration, live scoring, and ratings?</span>{" "}
        <span className="text-muted-foreground">
          A free DG Dashboard account keeps this event, opens online signups, and posts live scores
          for players.
        </span>{" "}
        <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}
