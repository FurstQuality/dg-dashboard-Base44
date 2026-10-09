import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookMarked, MapPin, Camera, Pin, Search, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell, PageHeader } from "@/components/shell";
import { matchesOmnisearch } from "@/lib/omnisearch";

import {
  listPlayedCourses,
  openCourseBookEntry,
  type PlayedCourse,
} from "@/lib/course-book.functions";
import { CourseMasteryCard } from "@/components/statlink/course-mastery-card";

export const Route = createFileRoute("/_authenticated/course-book/")({
  head: () => ({
    meta: [
      { title: "Course Book · DG Dashboard" },
      {
        name: "description",
        content: "Every course you've ever played, with photos, saved scorecards, and notes.",
      },
      { property: "og:title", content: "Course Book · DG Dashboard" },
      {
        property: "og:description",
        content: "Your personal scrapbook of every disc golf course you've played.",
      },
    ],
  }),
  component: CourseBookPage,
});

const SOURCE_LABEL: Record<string, string> = {
  chainlink: "DG Dashboard",
  udisc: "UDisc",
  pdga: "PDGA",
  manual: "Manual",
};

function CourseBookPage() {
  const list = useServerFn(listPlayedCourses);
  const open = useServerFn(openCourseBookEntry);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "pinned" | "chainlink" | "udisc" | "pdga">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["course-book", "played"],
    queryFn: () => list(),
  });

  const openMut = useMutation({
    mutationFn: (row: PlayedCourse) =>
      open({
        data: {
          course_key: row.course_key,
          display_name: row.display_name,
          location: row.location,
          course_id: row.course_id ?? undefined,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["course-book"] });
      navigate({ to: "/course-book/$entryId", params: { entryId: res.id } });
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesOmnisearch(r, query)) return false;
      if (filter === "pinned") return r.pinned;
      if (filter === "all") return true;
      return r.sources.includes(filter);
    });
  }, [data, q, filter]);

  const totals = useMemo(() => {
    const rows = data ?? [];
    return {
      courses: rows.length,
      rounds: rows.reduce((n, r) => n + r.round_count, 0),
      photos: rows.reduce((n, r) => n + r.media_count, 0),
      pinned: rows.filter((r) => r.pinned).length,
    };
  }, [data]);

  return (
    <PageShell section="courses">
      <PageHeader
        eyebrow="Course Book"
        leading={<BookMarked className="h-6 w-6 text-primary" aria-hidden />}
        title="Every course you've played"
        description="Every course from your DG rounds, UDisc and PDGA imports, tournaments, and league nights. Add photos, videos, scorecards, and notes."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { k: "Courses", v: totals.courses },
          { k: "Rounds", v: totals.rounds },
          { k: "Photos & cards", v: totals.photos },
          { k: "Pinned", v: totals.pinned },
        ].map((s) => (
          <Card key={s.k}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{s.k}</div>
              <div className="text-xl font-semibold">{s.v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CourseMasteryCard />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses…"
            className="pl-8"
          />
        </div>
        {(["all", "pinned", "chainlink", "udisc", "pdga"] as const).map((k) => (
          <Button
            key={k}
            variant={filter === k ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(k)}
            className="capitalize"
          >
            {k === "all" ? "All" : k === "pinned" ? "Pinned" : SOURCE_LABEL[k]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading course book…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No courses match. Play a round, import from UDisc, or sync PDGA to fill your book.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((row) => (
            <button
              key={row.course_key}
              onClick={() => openMut.mutate(row)}
              disabled={openMut.isPending}
              className="group text-left"
            >
              <Card className="h-full overflow-hidden transition hover:border-primary/40 hover:shadow-md">
                <div className="relative aspect-video bg-muted">
                  {row.cover_url ? (
                    <img
                      src={row.cover_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground/60">
                      <MapPin className="h-8 w-8" />
                    </div>
                  )}
                  {row.pinned && (
                    <div className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium flex items-center gap-1">
                      <Pin className="h-3 w-3" /> Pinned
                    </div>
                  )}
                  {row.media_count > 0 && (
                    <div className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium flex items-center gap-1">
                      <Camera className="h-3 w-3" /> {row.media_count}
                    </div>
                  )}
                </div>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{row.display_name}</div>
                      {row.location && (
                        <div className="text-xs text-muted-foreground truncate">{row.location}</div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {row.sources.map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px]">
                        {SOURCE_LABEL[s] ?? s}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {row.round_count} round{row.round_count === 1 ? "" : "s"}
                    </span>
                    {row.last_played && <span>Last {row.last_played}</span>}
                  </div>
                  {(row.best_rating != null || row.best_to_par != null) && (
                    <div className="text-xs text-muted-foreground">
                      {row.best_rating != null && (
                        <>
                          Best rating <b>{row.best_rating}</b>
                        </>
                      )}
                      {row.best_rating != null && row.best_to_par != null && " · "}
                      {row.best_to_par != null && (
                        <>
                          Best score{" "}
                          <b>{row.best_to_par > 0 ? `+${row.best_to_par}` : row.best_to_par}</b>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground pt-4">
        Missing courses?{" "}
        <Link to="/settings/imports" className="underline">
          Import from UDisc or sync PDGA
        </Link>{" "}
        to keep your book complete.
      </div>
    </PageShell>
  );
}
