import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getMyCreatorProfile,
  getCreatorAnalytics,
  listDrafts,
  listIdeas,
} from "@/lib/creator-studio.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PenSquare,
  CalendarClock,
  BarChart3,
  Lightbulb,
  TrendingUp,
  Users,
  Heart,
  MessageCircle,
  Eye,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio/")({
  component: StudioOverview,
  head: () => ({
    meta: [
      { title: "Dashboard · Creator Studio · DG Dashboard" },
      {
        name: "description",
        content: "Plan, draft, schedule, and analyze disc golf content across DG Dashboard.",
      },
      { property: "og:title", content: "Creator Studio dashboard · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Home base for disc golf creators — drafts, calendar, analytics, and ambassador tools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function StudioOverview() {
  const fetchProfile = useServerFn(getMyCreatorProfile);
  const fetchAnalytics = useServerFn(getCreatorAnalytics);
  const fetchDrafts = useServerFn(listDrafts);
  const fetchIdeas = useServerFn(listIdeas);

  const profileQ = useQuery({ queryKey: ["creator-profile"], queryFn: () => fetchProfile() });
  const analyticsQ = useQuery({
    queryKey: ["creator-analytics", 30],
    queryFn: () => fetchAnalytics({ data: { days: 30 } }),
  });
  const draftsQ = useQuery({
    queryKey: ["drafts", "all"],
    queryFn: () => fetchDrafts({ data: { status: "all" } }),
  });
  const ideasQ = useQuery({ queryKey: ["ideas"], queryFn: () => fetchIdeas() });

  const profile = profileQ.data?.profile;
  const tier = profile?.tier ?? "none";
  const status = profile?.status ?? "pending";

  const drafts = draftsQ.data?.rows ?? [];
  const draftCount = drafts.filter((d) => d.status === "draft").length;
  const scheduledCount = drafts.filter((d) => d.status === "scheduled").length;
  const publishedCount = drafts.filter((d) => d.status === "published").length;
  const a = analyticsQ.data;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card className="overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-primary via-cyan-500 to-emerald-500" />
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold">Welcome to the Creator Studio</h2>
                {profile?.is_verified ? (
                  <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
                    <ShieldCheck className="h-3 w-3 mr-1" /> Verified {tier}
                  </Badge>
                ) : tier === "applicant" ? (
                  <Badge variant="secondary">Application {status}</Badge>
                ) : (
                  <Badge variant="outline">Not applied yet</Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1">
                Everything you need to plan, produce, and measure disc golf content across DG
                Dashboard.
              </p>
            </div>
            {tier === "none" || (tier === "applicant" && status === "pending") ? (
              <Button asChild size="lg">
                <Link to="/studio/settings">
                  <Sparkles className="h-4 w-4 mr-1" />{" "}
                  {tier === "none" ? "Apply as creator" : "Continue application"}
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link to="/studio/composer">
                  <PenSquare className="h-4 w-4 mr-1" /> Create new post
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile icon={Eye} label="Impressions · 30d" value={a?.totals.impressions ?? 0} />
        <KpiTile icon={Heart} label="Likes · 30d" value={a?.totals.likes ?? 0} />
        <KpiTile icon={MessageCircle} label="Comments · 30d" value={a?.totals.comments ?? 0} />
        <KpiTile icon={Users} label="Followers" value={a?.followers ?? 0} />
      </div>

      {/* Pipeline strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PipelineCard
          title="Drafts"
          count={draftCount}
          desc="In-progress posts saved for later"
          icon={PenSquare}
          to="/studio/calendar"
        />
        <PipelineCard
          title="Scheduled"
          count={scheduledCount}
          desc="Queued and ready to publish"
          icon={CalendarClock}
          to="/studio/calendar"
        />
        <PipelineCard
          title="Published · 30d"
          count={publishedCount}
          desc={a ? `${a.totals.posts} live posts` : "—"}
          icon={TrendingUp}
          to="/studio/analytics"
        />
      </div>

      {/* Top posts + ideas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Top posts · last 30 days
            </CardTitle>
            <CardDescription>Ranked by combined engagement and reach.</CardDescription>
          </CardHeader>
          <CardContent>
            {!a || a.topPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet. Publish a post to see it here — every like, comment, and impression is
                scored automatically.
              </p>
            ) : (
              <div className="space-y-2">
                {a.topPosts.slice(0, 5).map((p) => (
                  <Link
                    key={p.id}
                    to="/p/$postId"
                    params={{ postId: p.id }}
                    className="flex items-center justify-between gap-3 border rounded-lg p-3 hover:bg-muted/40 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {p.body?.slice(0, 90) ?? `[${p.type} post]`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(p.created_at).toLocaleDateString()} · {p.type}
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {p.impressions}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" /> {p.like_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" /> {p.comment_count}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" /> Ideas ready to write
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(ideasQ.data?.rows ?? []).filter((i) => !i.is_used).length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No ideas parked. Capture prompts as they hit — you'll thank yourself later.
                <div className="mt-3">
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/studio/ideas">Open idea board</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {(ideasQ.data?.rows ?? [])
                  .filter((i) => !i.is_used)
                  .slice(0, 6)
                  .map((idea) => (
                    <li key={idea.id} className="text-sm border rounded-lg p-2">
                      <div className="font-medium">{idea.prompt}</div>
                      {idea.suggested_kind && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {idea.suggested_kind.replace("_", " ")}
                        </Badge>
                      )}
                    </li>
                  ))}
                <li className="pt-1">
                  <Link to="/studio/ideas" className="text-xs text-primary flex items-center gap-1">
                    Manage ideas <ArrowRight className="h-3 w-3" />
                  </Link>
                </li>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="text-2xl font-bold mt-1 tabular-nums">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function PipelineCard({ title, count, desc, icon: Icon, to }: any) {
  return (
    <Link to={to} className="group">
      <Card className="h-full transition group-hover:border-primary/50 group-hover:shadow-sm">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-4 w-4" /> {title}
              </div>
              <div className="text-3xl font-bold mt-2 tabular-nums">{count}</div>
              <div className="text-xs text-muted-foreground mt-1">{desc}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
