import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getCreatorAnalytics } from "@/lib/creator-studio.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { Eye, Heart, MessageCircle, Users, TrendingUp, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio/analytics")({
  component: AnalyticsPage,
  head: () => ({
    meta: [
      { title: "Creator analytics · DG Dashboard" },
      { name: "description", content: "See how your posts, series, and drafts are performing." },
      { property: "og:title", content: "Creator analytics · DG Dashboard" },
      {
        property: "og:description",
        content: "See how your posts, series, and drafts are performing.",
      },
    ],
  }),
});

function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const fetch = useServerFn(getCreatorAnalytics);
  const q = useQuery({
    queryKey: ["creator-analytics", days],
    queryFn: () => fetch({ data: { days } }),
  });
  const a = q.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            See what's landing. Learn what to double down on.
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi icon={TrendingUp} label="Posts" value={a?.totals.posts ?? 0} />
        <Kpi icon={Eye} label="Impressions" value={a?.totals.impressions ?? 0} />
        <Kpi icon={Heart} label="Likes" value={a?.totals.likes ?? 0} />
        <Kpi icon={MessageCircle} label="Comments" value={a?.totals.comments ?? 0} />
        <Kpi icon={Users} label="Followers" value={a?.followers ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Engagement over time</CardTitle>
          <CardDescription>
            Daily likes, comments, and impressions across your posts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={a?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" fontSize={10} tickFormatter={(v) => v.slice(5)} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="impressions"
                  stroke="hsl(var(--primary))"
                  name="Impressions"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="likes"
                  stroke="#ef4444"
                  name="Likes"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="comments"
                  stroke="#10b981"
                  name="Comments"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Best hour to post
            </CardTitle>
            <CardDescription>Total engagement grouped by hour of the day.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(a?.hourly ?? []).map((h, i) => ({
                    hour: `${i}h`,
                    engagement: h.engagement,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="hour" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="engagement" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {a?.bestHour && a.bestHour.hour >= 0 ? (
              <p className="text-sm text-muted-foreground mt-2">
                Peak engagement so far:{" "}
                <span className="font-medium text-foreground">{a.bestHour.hour}:00</span> — schedule
                high-value posts around this window.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top posts</CardTitle>
            <CardDescription>Highest combined reach + engagement.</CardDescription>
          </CardHeader>
          <CardContent>
            {!a || a.topPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No posts in this window.</p>
            ) : (
              <div className="space-y-2">
                {a.topPosts.map((p) => (
                  <Link
                    key={p.id}
                    to="/p/$postId"
                    params={{ postId: p.id }}
                    className="flex items-center justify-between border rounded-lg p-2 hover:bg-muted/40 transition"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="text-sm truncate">
                        {p.body?.slice(0, 80) ?? `[${p.type}]`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-2 shrink-0">
                      <span>👁 {p.impressions}</span>
                      <span>❤ {p.like_count}</span>
                      <span>💬 {p.comment_count}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <div className="text-xl font-bold mt-0.5 tabular-nums">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}
