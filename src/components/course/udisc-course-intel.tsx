import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Info, MapPin, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCourseUdiscIntel } from "@/lib/course-auto-populate.functions";

type Props = { courseId: string };

function formatDistance(ft: number | null): string {
  if (ft == null) return "—";
  return `${ft.toLocaleString()} ft`;
}

function scoreTone(par: number | null): string {
  if (par == null) return "text-muted-foreground";
  return par >= 4 ? "text-emerald-500" : "";
}

export function UdiscCourseIntel({ courseId }: Props) {
  const fetchIntel = useServerFn(getCourseUdiscIntel);
  const { data, isLoading } = useQuery({
    queryKey: ["udisc-intel", courseId],
    queryFn: () => fetchIntel({ data: { courseId } }),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Community insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.course) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Community insights</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No community data pulled for this course yet. Run a course data refresh from the Course
          data tab to bring in ratings, conditions and reviews.
        </CardContent>
      </Card>
    );
  }

  const c = data.course;
  const reviews = c.reviews_all?.length ? c.reviews_all : c.reviews;
  const holeRows = c.holes_detail ?? [];
  const holeTotal = holeRows.reduce((sum, h) => sum + (h.distance_ft ?? 0), 0);
  const parTotal = holeRows.reduce((sum, h) => sum + (h.par ?? 0), 0);
  const mapsHref =
    c.latitude != null && c.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Community insights</CardTitle>
            <p className="text-sm text-muted-foreground">
              {c.name}
              {c.city ? ` · ${c.city}` : ""}
              {c.state ? `, ${c.state}` : ""}
              {data.last_fetched_at
                ? ` · updated ${new Date(data.last_fetched_at).toLocaleDateString()}`
                : ""}
            </p>
          </div>
          {data.canonical_url ? (
            <Button asChild variant="outline" size="sm">
              <a href={data.canonical_url} target="_blank" rel="noreferrer">
                Source <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {c.rating != null ? (
              <Badge variant="secondary" className="gap-1">
                <Star className="h-3.5 w-3.5 fill-current" />
                {c.rating.toFixed(1)}
                {c.rating_count ? ` · ${c.rating_count.toLocaleString()} ratings` : ""}
              </Badge>
            ) : null}
            {c.difficulty ? <Badge variant="outline">{c.difficulty} difficulty</Badge> : null}
            {c.elevation ? <Badge variant="outline">{c.elevation}</Badge> : null}
            {c.tee_surface ? <Badge variant="outline">{c.tee_surface} tees</Badge> : null}
            {c.fees ? <Badge variant="outline">{c.fees}</Badge> : null}
            {c.estimated_time_minutes ? (
              <Badge variant="outline">
                {Math.floor(c.estimated_time_minutes / 60)}h {c.estimated_time_minutes % 60}m round
              </Badge>
            ) : null}
            {c.estimated_length_mi ? (
              <Badge variant="outline">{c.estimated_length_mi} mi walk</Badge>
            ) : null}
            {c.established_year ? <Badge variant="outline">Est. {c.established_year}</Badge> : null}
          </div>

          {c.conditions_status || c.conditions_note ? (
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Info className="h-4 w-4" />
                {c.conditions_status ?? "Latest conditions report"}
              </div>
              {c.conditions_note ? (
                <p className="mt-1 text-sm text-muted-foreground">{c.conditions_note}</p>
              ) : null}
            </div>
          ) : null}

          {c.description ? <p className="text-sm leading-relaxed">{c.description}</p> : null}

          {c.category_ratings?.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {c.category_ratings.map((cat) => (
                <div
                  key={cat.label}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{cat.label}</span>
                  <span className="font-semibold">{cat.value.toFixed(1)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {c.amenities?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {c.amenities.map((a) => (
                <Badge key={a} variant="secondary" className="font-normal">
                  {a}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {c.contact ? <span>Contact: {c.contact}</span> : null}
            {c.website ? (
              <a
                className="text-primary underline-offset-2 hover:underline"
                href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                target="_blank"
                rel="noreferrer"
              >
                Course website
              </a>
            ) : null}
            {mapsHref ? (
              <a
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin className="h-3.5 w-3.5" /> Open in maps
              </a>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {holeRows.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hole distances</CardTitle>
            <p className="text-sm text-muted-foreground">
              {holeRows.length} holes · par {parTotal} · {formatDistance(holeTotal)} total
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-9">
              {holeRows.map((h) => (
                <div key={h.hole} className="rounded-lg border px-2 py-1.5 text-center">
                  <div className="text-xs text-muted-foreground">Hole {h.hole}</div>
                  <div className="text-sm font-semibold">{h.distance_ft ?? "—"}</div>
                  <div className={`text-xs ${scoreTone(h.par)}`}>Par {h.par ?? "—"}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {reviews?.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Player reviews</CardTitle>
            <p className="text-sm text-muted-foreground">
              {reviews.length} recent reviews from the disc golf community
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviews.map((r, i) => (
              <div key={`${r.author ?? "player"}-${i}`} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">
                    {r.author ? `@${r.author}` : "Anonymous player"}
                  </span>
                  {r.rounds_played ? (
                    <span className="text-muted-foreground">{r.rounds_played} rounds played</span>
                  ) : null}
                  {r.reviewed_on ? (
                    <span className="text-muted-foreground">· {r.reviewed_on}</span>
                  ) : null}
                  {r.layout ? (
                    <Badge variant="outline" className="font-normal">
                      {r.layout}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed">{r.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
