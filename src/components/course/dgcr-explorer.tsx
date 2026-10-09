import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ExternalLink, Loader2, RefreshCw, Search, Star } from "lucide-react";
import { listDgcrCourses, bulkMatchDgcrCourses, type DgcrCourseRow } from "@/lib/dgcr.functions";
import { DgcrImportDialog } from "@/components/course/dgcr-import-dialog";

type SortKey = "nearby" | "rating" | "length" | "difficulty" | "reviews";

const ANY = "any";

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-[150px] flex-1 space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Course explorer: filter the imported course-review library by the traits that
 * actually change how a round plays, and compare states, difficulty, and length.
 */
export type ExplorerFilters = {
  q: string;
  state: string;
  holes: string;
  minRating: string;
  water: string;
  foliage: string;
  terrain: string;
  sort: string;
};

const SORT_KEYS: SortKey[] = ["nearby", "rating", "length", "difficulty", "reviews"];

export function DgcrExplorer({
  filters: urlFilters,
  homeState,
}: {
  filters: ExplorerFilters;
  /** Player's own state code — used to list nearby courses first, never to hide any. */
  homeState?: string;
}) {
  const list = useServerFn(listDgcrCourses);
  const bulkMatch = useServerFn(bulkMatchDgcrCourses);

  const query = useQuery({ queryKey: ["dgcr-library"], queryFn: async () => await list() });

  const match = useMutation({
    mutationFn: async () => await bulkMatch({ data: { limit: 5 } }),
    onSuccess: (res) => {
      toast.success(
        res.matched > 0
          ? `Matched ${res.matched} course${res.matched === 1 ? "" : "s"}${res.remaining ? ` · ${res.remaining} still unmatched` : ""}.`
          : "No new matches this round — try importing those courses by name.",
      );
      query.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = query.data?.rows ?? [];

  // Seeded from the URL so the directory and the explorer share one filter set.
  const [q, setQ] = useState(urlFilters.q);
  const [state, setState] = useState(urlFilters.state === "all" ? ANY : urlFilters.state);
  const [holes, setHoles] = useState(urlFilters.holes === "24+" ? "24" : urlFilters.holes);
  const [water, setWater] = useState(urlFilters.water);
  const [foliage, setFoliage] = useState(urlFilters.foliage);
  const [terrain, setTerrain] = useState(urlFilters.terrain);
  const [minRating, setMinRating] = useState(urlFilters.minRating);
  const [sort, setSort] = useState<SortKey>(
    SORT_KEYS.includes(urlFilters.sort as SortKey)
      ? (urlFilters.sort as SortKey)
      : homeState
        ? "nearby"
        : "rating",
  );



  // Filters handed back to the directory, so the same result set can be opened
  // on the map/list view.
  const directorySearch = {
    q,
    state: state === ANY ? "all" : state,
    holes: holes === "24" ? "24+" : holes,
    minRating,
    sort: sort === "rating" ? "rating" : "name",
  };

  const states = useMemo(
    () => Array.from(new Set(rows.map((r) => r.state).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const foliages = useMemo(
    () => Array.from(new Set(rows.map((r) => r.foliage).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const terrains = useMemo(
    () => Array.from(new Set(rows.map((r) => r.terrain).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (
        needle &&
        ![r.name, r.city, r.state].some((v) => (v ?? "").toLowerCase().includes(needle))
      )
        return false;
      if (state !== ANY && r.state !== state) return false;
      if (foliage !== ANY && r.foliage !== foliage) return false;
      if (terrain !== ANY && r.terrain !== terrain) return false;
      if (water === "none" && (r.water_holes ?? 0) > 0) return false;
      if (water === "some" && (r.water_holes ?? 0) === 0) return false;
      if (minRating !== ANY && (r.rating ?? 0) < Number(minRating)) return false;
      if (holes !== ANY) {
        const h = r.hole_count ?? 0;
        if (holes === "9" && h > 12) return false;
        if (holes === "18" && (h < 13 || h > 20)) return false;
        if (holes === "24" && h < 21) return false;
      }
      return true;
    });

    if (sort === "nearby" && homeState) {
      // Courses in your state come first; everything else still shows below.
      return out.sort(
        (a, b) =>
          Number(b.state === homeState) - Number(a.state === homeState) ||
          (b.rating ?? 0) - (a.rating ?? 0),
      );
    }
    const value = (r: DgcrCourseRow) => {
      if (sort === "rating" || sort === "nearby") return r.rating ?? 0;
      if (sort === "length") return r.length_max_ft ?? 0;
      if (sort === "reviews") return r.review_count ?? 0;
      return r.sse.length ? Math.max(...r.sse) : 0;
    };
    return out.sort((a, b) => value(b) - value(a));
  }, [rows, q, state, foliage, terrain, water, minRating, holes, sort, homeState]);

  const byState = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const r of filtered) {
      if (!r.state || r.rating == null) continue;
      const cur = map.get(r.state) ?? { total: 0, count: 0 };
      cur.total += r.rating;
      cur.count += 1;
      map.set(r.state, cur);
    }
    return Array.from(map.entries())
      .map(([s, v]) => ({
        state: s,
        rating: Number((v.total / v.count).toFixed(2)),
        courses: v.count,
      }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 12);
  }, [filtered]);

  const scatter = useMemo(
    () =>
      filtered
        .filter((r) => r.rating != null && r.length_max_ft != null)
        .map((r) => ({
          name: r.name,
          length: r.length_max_ft as number,
          rating: r.rating as number,
          holes: r.hole_count ?? 18,
        })),
    [filtered],
  );

  if (query.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Filter the library</CardTitle>
            <CardDescription>
              {rows.length} course{rows.length === 1 ? "" : "s"} imported · {filtered.length} match
              your filters.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => match.mutate()}
              disabled={match.isPending}
            >
              {match.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              Match my courses
            </Button>
            <DgcrImportDialog onImported={() => query.refetch()} />
            <Button asChild variant="outline" size="sm">
              <Link to="/courses" search={directorySearch}>
                Open in the directory
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="explorer-search">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="explorer-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Course, city, or state…"
                className="pl-9"
              />
            </div>
          </div>
          <Filter
            label="State"
            value={state}
            onChange={setState}
            options={[
              { value: ANY, label: "All states" },
              ...states.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Filter
            label="Hole count"
            value={holes}
            onChange={setHoles}
            options={[
              { value: ANY, label: "Any" },
              { value: "9", label: "Short (12 or fewer)" },
              { value: "18", label: "Standard (13–20)" },
              { value: "24", label: "Big (21+)" },
            ]}
          />
          <Filter
            label="Water"
            value={water}
            onChange={setWater}
            options={[
              { value: ANY, label: "Any" },
              { value: "none", label: "No water in play" },
              { value: "some", label: "Water in play" },
            ]}
          />
          <Filter
            label="Tree cover"
            value={foliage}
            onChange={setFoliage}
            options={[
              { value: ANY, label: "Any" },
              ...foliages.map((f) => ({ value: f, label: f })),
            ]}
          />
          <Filter
            label="Landscape"
            value={terrain}
            onChange={setTerrain}
            options={[
              { value: ANY, label: "Any" },
              ...terrains.map((t) => ({ value: t, label: t })),
            ]}
          />
          <Filter
            label="Minimum rating"
            value={minRating}
            onChange={setMinRating}
            options={[
              { value: ANY, label: "Any" },
              { value: "3", label: "3.0+" },
              { value: "3.5", label: "3.5+" },
              { value: "4", label: "4.0+" },
              { value: "4.5", label: "4.5+" },
            ]}
          />
          <Filter
            label="Sort by"
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={[
              ...(homeState ? [{ value: "nearby", label: `Closest to you (${homeState})` }] : []),
              { value: "rating", label: "Player rating" },
              { value: "difficulty", label: "Scratch difficulty" },
              { value: "length", label: "Longest layout" },
              { value: "reviews", label: "Most reviewed" },
            ]}
          />
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing matches yet. Import a few courses, or loosen a filter to see the field.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Best-rated states</CardTitle>
                <CardDescription>
                  Average player rating across your matching courses.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byState} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="state"
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      domain={[0, 5]}
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 10,
                        fontSize: 13,
                      }}
                      formatter={(v: number, _n, p) => [
                        `${v} avg · ${p.payload.courses} courses`,
                        "Rating",
                      ]}
                    />
                    <Bar dataKey="rating" radius={[6, 6, 0, 0]}>
                      {byState.map((entry) => (
                        <Cell key={entry.state} fill="hsl(var(--primary))" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Length vs. rating</CardTitle>
                <CardDescription>
                  Where the long tracks and the crowd favorites overlap.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 4, right: 12, bottom: 4, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      dataKey="length"
                      name="Length"
                      unit=" ft"
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      type="number"
                      dataKey="rating"
                      name="Rating"
                      domain={[0, 5]}
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <ZAxis type="number" dataKey="holes" range={[50, 220]} name="Holes" />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 10,
                        fontSize: 13,
                      }}
                      formatter={(value: number, name: string) => [value, name]}
                      labelFormatter={() => ""}
                    />
                    <Scatter data={scatter} fill="hsl(var(--primary))" />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Matching courses</CardTitle>
              <CardDescription>
                Ratings, difficulty, and course traits pulled from course reviews.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Course</th>
                    <th className="px-4 py-2">Rating</th>
                    <th className="px-4 py-2">Holes</th>
                    <th className="px-4 py-2">Length</th>
                    <th className="px-4 py-2">Scratch difficulty</th>
                    <th className="px-4 py-2">Traits</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2">
                        <div className="font-medium">
                          {r.course_id ? (
                            <Link
                              to="/courses/$courseId"
                              params={{ courseId: r.course_id }}
                              className="hover:underline"
                            >
                              {r.name}
                            </Link>
                          ) : (
                            r.name
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[r.city, r.state].filter(Boolean).join(", ") || "Location unlisted"}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.rating != null ? (
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 text-primary" />
                            {r.rating.toFixed(2)}
                            <span className="text-xs text-muted-foreground">
                              ({r.review_count ?? 0})
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">{r.hole_count ?? "—"}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.length_max_ft ? `${r.length_max_ft.toLocaleString()} ft` : "—"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.sse.length ? r.sse.map((s) => s.toFixed(1)).join(" · ") : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.foliage ? <Badge variant="outline">{r.foliage}</Badge> : null}
                          {r.terrain ? <Badge variant="outline">{r.terrain}</Badge> : null}
                          {r.water_holes ? (
                            <Badge variant="outline">{r.water_holes} water</Badge>
                          ) : null}
                          <a
                            className="inline-flex items-center text-muted-foreground hover:text-foreground"
                            href={r.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`Open ${r.name} on Disc Golf Course Review`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
