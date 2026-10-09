import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Loader2, RefreshCw, Star } from "lucide-react";
import { getDgcrProfileForCourse, autoMatchDgcrCourse } from "@/lib/dgcr.functions";
import { DgcrImportDialog } from "@/components/course/dgcr-import-dialog";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

/** Shows the community course-review profile (rating, difficulty, terrain) for a course. */
export function DgcrCourseCard({ courseId }: { courseId: string }) {
  const fetchProfile = useServerFn(getDgcrProfileForCourse);
  const autoMatch = useServerFn(autoMatchDgcrCourse);

  const query = useQuery({
    queryKey: ["dgcr-profile", courseId],
    queryFn: async () => await fetchProfile({ data: { courseId } }),
  });

  const match = useMutation({
    mutationFn: async () => await autoMatch({ data: { courseId } }),
    onSuccess: (res) => {
      if (!res.profile) {
        toast.info("No course review match found. Try searching manually.");
        return;
      }
      toast.success(`Linked to ${res.profile.name} on Disc Golf Course Review.`);
      query.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const profile = query.data?.profile ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Course review profile</CardTitle>
          <CardDescription>
            Community ratings and difficulty data from Disc Golf Course Review.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => match.mutate()}
            disabled={match.isPending || query.isLoading}
          >
            {match.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            {profile ? "Refresh" : "Find match"}
          </Button>
          <DgcrImportDialog
            courseId={courseId}
            onImported={() => query.refetch()}
            trigger={
              <Button variant="ghost" size="sm">
                Search manually
              </Button>
            }
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? <Skeleton className="h-28 w-full rounded-lg" /> : null}

        {!query.isLoading && !profile ? (
          <p className="text-sm text-muted-foreground">
            No review profile linked yet. Find a match to pull in ratings, tee lengths, and
            difficulty numbers.
          </p>
        ) : null}

        {profile ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {profile.rating != null ? (
                <Badge variant="secondary" className="gap-1">
                  <Star className="h-3.5 w-3.5" /> {profile.rating.toFixed(2)} / 5
                  {profile.review_count ? ` · ${profile.review_count} reviews` : ""}
                </Badge>
              ) : null}
              {profile.terrain ? <Badge variant="outline">{profile.terrain}</Badge> : null}
              {profile.foliage ? <Badge variant="outline">{profile.foliage}</Badge> : null}
              {profile.conditions ? (
                <Badge variant="outline">{profile.conditions} conditions</Badge>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {profile.hole_count != null ? (
                <Stat label="Holes" value={`${profile.hole_count}`} />
              ) : null}
              {profile.basket_count != null ? (
                <Stat label="Baskets" value={`${profile.basket_count}`} />
              ) : null}
              {profile.length_min_ft != null ? (
                <Stat
                  label="Tee lengths"
                  value={
                    profile.length_max_ft && profile.length_max_ft !== profile.length_min_ft
                      ? `${profile.length_min_ft.toLocaleString()}–${profile.length_max_ft.toLocaleString()} ft`
                      : `${profile.length_min_ft.toLocaleString()} ft`
                  }
                />
              ) : null}
              {profile.pars.length > 0 ? (
                <Stat label="Par" value={profile.pars.join(" · ")} />
              ) : null}
              {profile.sse.length > 0 ? (
                <Stat
                  label="Scratch difficulty (SSE)"
                  value={profile.sse.map((v) => v.toFixed(1)).join(" · ")}
                />
              ) : null}
              {profile.water_holes != null ? (
                <Stat label="Water in play" value={`${profile.water_holes} holes`} />
              ) : null}
              {profile.designer ? <Stat label="Designer" value={profile.designer} /> : null}
              {profile.year_established ? (
                <Stat label="Established" value={`${profile.year_established}`} />
              ) : null}
              {profile.tee_type ? <Stat label="Tees" value={profile.tee_type} /> : null}
              {profile.basket_type ? (
                <Stat label="Baskets type" value={profile.basket_type} />
              ) : null}
              {profile.rounds_recorded != null ? (
                <Stat
                  label="Rounds logged"
                  value={`${profile.rounds_recorded.toLocaleString()}${profile.avg_score != null ? ` · avg ${profile.avg_score}` : ""}`}
                />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Updated {new Date(profile.fetched_at).toLocaleDateString()}</span>
              <a
                className="inline-flex items-center gap-1 underline underline-offset-2"
                href={profile.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                View on Disc Golf Course Review <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
