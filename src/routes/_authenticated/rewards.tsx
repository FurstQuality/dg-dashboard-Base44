import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Award, Coins, Gift, MapPin, ShieldCheck, Trophy } from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getRewardSummary,
  getReviewQueue,
  requestRedemption,
  submitContribution,
  verifyContribution,
} from "@/lib/rewards.functions";
import {
  CONTRIBUTION_KINDS,
  MONTH_COST,
  SUBMITTABLE_KINDS,
  VERIFICATIONS_REQUIRED,
  contributionLabel,
  monthsAffordable,
} from "@/lib/rewards";

export const Route = createFileRoute("/_authenticated/rewards")({
  component: RewardsPage,
  head: () => ({
    meta: [
      { title: "Contributor Rewards · Build courses, earn free months · DG Dashboard" },
      {
        name: "description",
        content:
          "Earn points for building courses, pinning baskets, keeping course conditions current and growing your local scene — then trade them for free months of DG Dashboard.",
      },
      {
        property: "og:title",
        content: "Contributor Rewards · Build courses, earn free months · DG Dashboard",
      },
      {
        property: "og:description",
        content:
          "Map courses, verify other players' work, report fallen trees and hazards, and turn points into free app time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function RewardsPage() {
  const queryClient = useQueryClient();
  const fetchSummary = useServerFn(getRewardSummary);
  const fetchQueue = useServerFn(getReviewQueue);

  const summary = useQuery({
    queryKey: ["reward-summary"],
    queryFn: () => fetchSummary(),
    staleTime: 30_000,
  });
  const queue = useQuery({
    queryKey: ["reward-queue"],
    queryFn: () => fetchQueue(),
    staleTime: 30_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["reward-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["reward-queue"] });
  };

  const balance = summary.data?.balance ?? 0;

  return (
    <PageShell>
      <PageHeader
        title="Contributor Rewards"
        description="Build and maintain the map, help your local scene grow, and trade the points you earn for free months of DG Dashboard."
        secondaryAction={
          <Button asChild variant="outline" size="sm">
            <Link to="/courses" search={{ add: "1" } as never}>Add a course</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="Points available"
          value={summary.isLoading ? "—" : balance.toLocaleString()}
          hint={`${monthsAffordable(balance, "pro")} free month${monthsAffordable(balance, "pro") === 1 ? "" : "s"} of Pro`}
        />
        <StatCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Verified points earned"
          value={summary.isLoading ? "—" : (summary.data?.verifiedPoints ?? 0).toLocaleString()}
          hint="Career total across all your work"
        />
        <StatCard
          icon={<MapPin className="h-4 w-4" />}
          label="Waiting on sign-off"
          value={summary.isLoading ? "—" : String(summary.data?.pendingCount ?? 0)}
          hint={`${VERIFICATIONS_REQUIRED} players confirm each entry`}
        />
        <StatCard
          icon={<Award className="h-4 w-4" />}
          label="Reviews you've done"
          value={queue.isLoading ? "—" : String(queue.data?.reviewedCount ?? 0)}
          hint="25 reviews earns the Trusted Reviewer badge"
        />
      </div>

      <Tabs defaultValue="earn" className="mt-4">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList>
            <TabsTrigger value="earn">Earn points</TabsTrigger>
            <TabsTrigger value="mine">My contributions</TabsTrigger>
            <TabsTrigger value="review">Review queue</TabsTrigger>
            <TabsTrigger value="redeem">Free months</TabsTrigger>
            <TabsTrigger value="leaders">Leaderboard</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="earn" className="mt-4 space-y-4">
          <EarnPanel onSubmitted={refresh} />
        </TabsContent>

        <TabsContent value="mine" className="mt-4 space-y-3">
          {summary.isLoading ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : (summary.data?.contributions.length ?? 0) === 0 ? (
            <EmptyNote text="Nothing filed yet. Map a course or fix some course details, then log it under Earn points." />
          ) : (
            <ul className="space-y-2">
              {summary.data!.contributions.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                >
                  <div>
                    <p className="font-semibold">{contributionLabel(c.kind)}</p>
                    <p className="text-sm text-muted-foreground">{c.summary}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()} ·{" "}
                      {c.quantity > 1 ? `${c.quantity} items · ` : ""}
                      {c.points} points
                      {c.review_note ? ` · Reviewer note: ${c.review_note}` : ""}
                    </p>
                  </div>
                  <StatusBadge
                    status={c.status}
                    approve={c.approve_count}
                    reject={c.reject_count}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="review" className="mt-4 space-y-3">
          <ReviewPanel
            loading={queue.isLoading}
            rows={queue.data?.queue ?? []}
            onDone={refresh}
          />
        </TabsContent>

        <TabsContent value="redeem" className="mt-4 space-y-4">
          <RedeemPanel
            balance={balance}
            redemptions={summary.data?.redemptions ?? []}
            onDone={refresh}
          />
        </TabsContent>

        <TabsContent value="leaders" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4" />
                Top contributors
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isLoading ? (
                <Skeleton className="h-40 rounded-xl" />
              ) : (summary.data?.leaderboard.length ?? 0) === 0 ? (
                <EmptyNote text="No verified contributions yet. Be the first name on this board." />
              ) : (
                <ol className="space-y-2">
                  {summary.data!.leaderboard.map((row, index) => (
                    <li
                      key={row.user_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center font-semibold">{index + 1}</span>
                        <div>
                          {row.username ? (
                            <Link
                              to="/players/$username"
                              params={{ username: row.username }}
                              className="font-semibold hover:underline"
                            >
                              {row.display_name ?? row.username}
                            </Link>
                          ) : (
                            <span className="font-semibold">{row.display_name ?? "Player"}</span>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {row.courses_built} course{row.courses_built === 1 ? "" : "s"} ·{" "}
                            {row.holes_mapped} holes pinned · {row.verified_count} verified entries
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{row.points.toLocaleString()} pts</Badge>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function StatusBadge({
  status,
  approve,
  reject,
}: {
  status: string;
  approve: number;
  reject: number;
}) {
  if (status === "verified") return <Badge>Verified</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Not accepted</Badge>;
  return (
    <Badge variant="outline">
      {approve} of {VERIFICATIONS_REQUIRED} approvals
      {reject ? ` · ${reject} declined` : ""}
    </Badge>
  );
}

function EarnPanel({ onSubmitted }: { onSubmitted: () => void }) {
  const submit = useServerFn(submitContribution);
  const [kind, setKind] = useState<string>(SUBMITTABLE_KINDS[0].kind);
  const [quantity, setQuantity] = useState("1");
  const [summaryText, setSummaryText] = useState("");
  const [details, setDetails] = useState("");
  const [evidence, setEvidence] = useState("");

  const meta = useMemo(
    () => CONTRIBUTION_KINDS.find((k) => k.kind === kind) ?? SUBMITTABLE_KINDS[0],
    [kind],
  );

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          kind,
          quantity: meta.countsItems ? Math.max(1, Number(quantity) || 1) : 1,
          summary: summaryText,
          details: details || null,
          evidence_url: evidence || null,
        },
      }),
    onSuccess: () => {
      toast.success("Filed. Two other players sign off and the points are yours.");
      setSummaryText("");
      setDetails("");
      setEvidence("");
      onSubmitted();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const groups = ["Course building", "Course upkeep", "Data quality", "Community growth"] as const;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log what you did</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every entry needs {VERIFICATIONS_REQUIRED} other players to confirm it. Admins take a
            final look before free months are handed out.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>What did you do?</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBMITTABLE_KINDS.map((k) => (
                  <SelectItem key={k.kind} value={k.kind}>
                    {k.label} · {k.points} pts
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{meta.help}</p>
          </div>
          {meta.countsItems ? (
            <div className="space-y-1.5">
              <Label htmlFor="reward-quantity">How many?</Label>
              <Input
                id="reward-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, "").slice(0, 2))}
              />
              <p className="text-xs text-muted-foreground">
                Worth {meta.points * Math.max(1, Number(quantity) || 1)} points if approved.
              </p>
            </div>
          ) : null}
          <div className={meta.countsItems ? "space-y-1.5" : "space-y-1.5 sm:col-span-2"}>
            <Label htmlFor="reward-summary">Course and short summary</Label>
            <Input
              id="reward-summary"
              placeholder="Lemon Lake — pinned all 18 baskets on the Gold layout"
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="reward-details">Anything a reviewer should know</Label>
            <Textarea
              id="reward-details"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Walked it Saturday morning with GPS on. Holes 4 and 5 share a tee pad."
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="reward-evidence">Link to proof (optional)</Label>
            <Input
              id="reward-evidence"
              placeholder="https://"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || summaryText.trim().length < 4}
            >
              {mutation.isPending ? "Filing…" : "Submit for review"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What everything is worth</CardTitle>
          <p className="text-sm text-muted-foreground">
            {MONTH_COST.pro} points is one free month of Pro. {MONTH_COST.elite} points is one month
            of Elite.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.map((group) => (
            <div key={group}>
              <p className="text-sm font-semibold">{group}</p>
              <ul className="mt-1.5 space-y-1">
                {CONTRIBUTION_KINDS.filter((k) => k.group === group).map((k) => (
                  <li key={k.kind} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{k.label}</span>
                    <span className="font-semibold">
                      {k.points}
                      {k.countsItems ? " / each" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewPanel({
  loading,
  rows,
  onDone,
}: {
  loading: boolean;
  rows: {
    id: string;
    kind: string;
    summary: string;
    details: string | null;
    evidence_url: string | null;
    quantity: number;
    points: number;
    approve_count: number;
    course_name?: string | null;
    player_name?: string | null;
    player_username?: string | null;
    created_at: string;
  }[];
  onDone: () => void;
}) {
  const verify = useServerFn(verifyContribution);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (input: { contribution_id: string; vote: "approve" | "reject" }) =>
      verify({ data: { ...input, note: notes[input.contribution_id] || null } }),
    onSuccess: () => {
      toast.success("Thanks for reviewing — that's how the map stays trustworthy.");
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (loading) return <Skeleton className="h-40 rounded-xl" />;
  if (!rows.length) {
    return (
      <EmptyNote text="Nothing waiting on you right now. Check back — reviewing other players' work counts toward the Trusted Reviewer badge." />
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{contributionLabel(row.kind)}</span>
            {row.course_name ? <Badge variant="outline">{row.course_name}</Badge> : null}
            <Badge variant="secondary">{row.points} pts</Badge>
            <Badge variant="outline">
              {row.approve_count} of {VERIFICATIONS_REQUIRED} approvals
            </Badge>
          </div>
          <p className="mt-1.5 text-sm">{row.summary}</p>
          {row.details ? (
            <p className="mt-1 text-sm text-muted-foreground">{row.details}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Filed by{" "}
            {row.player_username ? (
              <Link
                to="/players/$username"
                params={{ username: row.player_username }}
                className="hover:underline"
              >
                {row.player_name ?? row.player_username}
              </Link>
            ) : (
              (row.player_name ?? "a player")
            )}{" "}
            on {new Date(row.created_at).toLocaleDateString()}
            {row.evidence_url ? " · proof link attached" : ""}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              placeholder="Note for the contributor (optional)"
              value={notes[row.id] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
            />
            <Button
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ contribution_id: row.id, vote: "approve" })}
            >
              Looks right
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ contribution_id: row.id, vote: "reject" })}
            >
              Not accurate
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RedeemPanel({
  balance,
  redemptions,
  onDone,
}: {
  balance: number;
  redemptions: {
    id: string;
    points_spent: number;
    months_requested: number;
    tier_key: string;
    status: string;
    review_note: string | null;
    granted_until: string | null;
    created_at: string;
  }[];
  onDone: () => void;
}) {
  const request = useServerFn(requestRedemption);
  const [tier, setTier] = useState<"pro" | "elite">("pro");
  const [months, setMonths] = useState("1");
  const [note, setNote] = useState("");

  const cost = MONTH_COST[tier] * Math.max(1, Number(months) || 1);
  const affordable = balance >= cost;

  const mutation = useMutation({
    mutationFn: () =>
      request({
        data: { tier_key: tier, months: Math.max(1, Number(months) || 1), note: note || null },
      }),
    onSuccess: () => {
      toast.success("Request sent. An admin reviews it and your free months get applied.");
      setNote("");
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4" />
            Trade points for free months
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            You have {balance.toLocaleString()} points. Pro costs {MONTH_COST.pro} points a month,
            Elite {MONTH_COST.elite}.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as "pro" | "elite")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="elite">Elite</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="redeem-months">Months</Label>
            <Input
              id="redeem-months"
              inputMode="numeric"
              value={months}
              onChange={(e) => setMonths(e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="redeem-note">Anything to add (optional)</Label>
            <Textarea
              id="redeem-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={() => mutation.mutate()} disabled={!affordable || mutation.isPending}>
              {mutation.isPending
                ? "Sending…"
                : affordable
                  ? `Request ${months} month${Number(months) === 1 ? "" : "s"} for ${cost} points`
                  : `Need ${(cost - balance).toLocaleString()} more points`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your reward requests</CardTitle>
        </CardHeader>
        <CardContent>
          {redemptions.length === 0 ? (
            <EmptyNote text="No requests yet. Points stay on your account until you cash them in." />
          ) : (
            <ul className="space-y-2">
              {redemptions.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                >
                  <div>
                    <p className="font-semibold">
                      {r.months_requested} month{r.months_requested === 1 ? "" : "s"} of{" "}
                      {r.tier_key === "elite" ? "Elite" : "Pro"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.points_spent} points · {new Date(r.created_at).toLocaleDateString()}
                      {r.granted_until
                        ? ` · active until ${new Date(r.granted_until).toLocaleDateString()}`
                        : ""}
                      {r.review_note ? ` · ${r.review_note}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      r.status === "granted"
                        ? "default"
                        : r.status === "rejected"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {r.status === "granted"
                      ? "Applied"
                      : r.status === "rejected"
                        ? "Turned down"
                        : "In review"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
