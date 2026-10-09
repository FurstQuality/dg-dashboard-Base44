import { layoutPlaysFeature } from "@/lib/course-builder/layout-rules";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard } from "lucide-react";
import { satelliteStillUrl } from "@/lib/course-imagery";
import { Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { featureAppliesToHole, featureIsCourseWide, type DbFeature } from "@/lib/course-features";
import { describeMappedFeatures } from "@/lib/director-kit";

import { supabase } from "@/integrations/supabase/client";
import { useSession, useIsSuperAdmin } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Pencil, Play, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CourseReviews } from "@/components/course-reviews";
import { HoleMediaGallery } from "@/components/hole-media-gallery";
import { CourseLayoutsManager } from "@/components/course-layouts-manager";
import { CourseCompletenessCard } from "@/components/course-builder/course-completeness-card";
import { CourseCommunityCard } from "@/components/course-builder/course-community-card";
import { CourseFlythroughPlayer, HoleFlythroughPlayer } from "@/components/course-flythrough";
import { StartRoundDialog } from "@/components/start-round-dialog";
import { CourseDataSources } from "@/components/course/course-data-sources";
import { DgcrCourseCard } from "@/components/course/dgcr-course-card";
import { CourseDirections } from "@/components/course/course-directions";
import { UdiscCourseIntel } from "@/components/course/udisc-course-intel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseConditionReports } from "@/components/courses/course-condition-reports";
import { CourseStatusCard } from "@/components/courses/course-status-card";
import { CourseMapCoverageBadge } from "@/components/courses/course-map-coverage-badge";
import { ClientOnly } from "@tanstack/react-router";
import { jsonLd } from "@/lib/jsonld";
import { fetchLayoutActivity, sortLayoutsByActivity } from "@/lib/layout-activity";

const CourseDetailMap = lazy(() => import("@/components/pages/course-detail-map"));

type Course = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  cover_url: string | null;
  hole_count: number;
  difficulty: string | null;
  created_by: string;
  moderation_status?: "pending" | "approved" | "rejected" | null;
  rejection_reason?: string | null;
  flythrough_path?: string | null;
  flythrough_url?: string | null;
  pdga_rating?: number | null;
  pdga_rating_votes?: number | null;
  year_established?: number | null;
  pdga_url?: string | null;
  postal_code?: string | null;
};

type Layout = {
  id: string;
  name: string;
  hole_count: number;
  par_total: number | null;
  distance_total: number | null;
  is_default: boolean;
  mando_count?: number | null;
  dropzone_count?: number | null;
  ob_line_feet?: number | null;
  ob_area_count?: number | null;
  water_hole_count?: number | null;
  island_green_count?: number | null;
  longest_hole_ft?: number | null;
  shortest_hole_ft?: number | null;
};
type Hole = {
  id: string;
  number: number;
  par: number;
  distance_ft: number | null;
  tee_lat: number | null;
  tee_lng: number | null;
  basket_lat: number | null;
  basket_lng: number | null;
  caddy_notes: string | null;
  flythrough_path: string | null;
};

export default function CourseDetail({ courseId, initialTab, initialLayoutId }: { courseId: string; initialTab?: string; initialLayoutId?: string }) {
  const { user } = useSession();
  const isSuperAdmin = useIsSuperAdmin(user);
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [features, setFeatures] = useState<DbFeature[]>([]);
  // Directions go to the mapped course entrance when there is one; the directory pin is only for finding the course.
  const entrancePoint = features.find((f) => f.type === "entrance")?.geometry?.points?.[0] ?? null;
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  const reloadLayouts = async () => {
    const { data: ls } = await supabase
      .from("course_layouts")
      .select("*")
      .eq("course_id", courseId);
    // Draft layouts stay in Layout Studio until a steward publishes them.
    const rows = ((ls as (Layout & { status?: string })[]) ?? []).filter((l) => l.status !== "draft");
    const activity = await fetchLayoutActivity(courseId);
    const arr = sortLayoutsByActivity(rows, activity);
    setLayouts(arr);
    setLayoutId((prev) => {
      if (prev && arr.find((l) => l.id === prev)) return prev;
      if (initialLayoutId && arr.find((l) => l.id === initialLayoutId)) return initialLayoutId;
      return arr[0]?.id ?? null;
    });
    return arr;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: c } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .maybeSingle();
      if (!mounted) return;
      setCourse(c as Course | null);
      await reloadLayouts();
      if (!mounted) return;
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // The course map stays live: reload holes and map items every 30 s and whenever
  // the player comes back to the tab, so steward edits show without a refresh.
  useEffect(() => {
    if (!layoutId) return;
    let alive = true;
    const load = () => {
      supabase
        .from("holes")
        .select(
          "id, number, par, par_confirmed, current_pin, tee_source, basket_source, distance_ft, tee_lat, tee_lng, basket_lat, basket_lng, caddy_notes, flythrough_path, flight_path, hole_tees(id, name, color, latitude, longitude, flight_path), hole_baskets(id, name, color, latitude, longitude, split_point)",
        )
        .eq("layout_id", layoutId)
        .order("number")
        .then(({ data }) => { if (alive && data) setHoles(data as Hole[]); });
      // Layout items plus course-wide items (boundary, parking, paths) shared by every layout.
      supabase
        .from("course_features")
        .select("id, type, geometry, ob_side, label, hole_number, hole_numbers, layout_id")
        .eq("course_id", courseId)
        .neq("publish_state", "draft")
        .neq("layer", "event")
        .then(async ({ data }) => {
          if (!alive || !data) return;
          // One physical map for every layout: ground always shows; play rules (OB, mandos,
          // drop zones) show only when this layout plays them (picked in the course builder).
          const { data: lay } = await supabase.from("course_layouts").select("played_rule_ids").eq("id", layoutId).maybeSingle();
          if (!alive) return;
          const played = (lay?.played_rule_ids as string[] | null) ?? null;
          setFeatures(
            (data as Array<DbFeature & { layout_id: string | null; type: string; id: string }>).filter((f) =>
              layoutPlaysFeature(f, layoutId, played),
            ),
          );
        });
      // Course details and layout list also stay current (new layouts, renamed layouts, edits).
      supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .maybeSingle()
        .then(({ data }) => { if (alive && data) setCourse(data as Course); });
      void reloadLayouts();
    };
    load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutId, courseId]);

  const withCoords = holes.filter((h) => h.tee_lat != null && h.tee_lng != null);
  const center: [number, number] | null =
    withCoords.length > 0
      ? [withCoords[0].tee_lat!, withCoords[0].tee_lng!]
      : course?.latitude != null && course?.longitude != null
        ? [course.latitude, course.longitude]
        : null;

  const parTotal = holes.reduce((s, h) => s + h.par, 0);
  const distTotal = holes.reduce((s, h) => s + (h.distance_ft ?? 0), 0);
  // A total built from half the holes is misleading unless the gap is stated,
  // so the scorecard says how many holes actually carry a measured distance.
  const holesWithDistance = holes.filter((h) => h.distance_ft != null).length;
  const distanceComplete = holes.length > 0 && holesWithDistance === holes.length;

  async function deleteCourse() {
    if (!course) return;
    if (!confirm("Delete this course and all its data?")) return;
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) return toast.error(error.message);
    toast.success("Course deleted");
    navigate({ to: "/courses" });
  }

  if (loading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!course)
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <h3 className="font-display text-lg font-semibold">Course not found</h3>
      </div>
    );

  const isOwner = user?.id === course.created_by;
  const canEdit = isOwner || isSuperAdmin;
  // Any signed-in player can contribute a scoring layout to a published course.
  const canAddLayout = !!user;
  const needsLayout = layouts.length === 0;

  return (
    <div className="space-y-4">
      <div
        className="grid gap-3 overflow-hidden rounded-xl border border-border p-3"
      >
        <div className="min-w-0 self-center">
        {(() => {
          const pts: Array<{ lat: number; lng: number; kind: "tee" | "basket"; n: number }> = [];
          for (const h of holes) {
            if (h.tee_lat != null && h.tee_lng != null)
              pts.push({ lat: h.tee_lat, lng: h.tee_lng, kind: "tee", n: h.number });
            if (h.basket_lat != null && h.basket_lng != null)
              pts.push({ lat: h.basket_lat, lng: h.basket_lng, kind: "basket", n: h.number });
          }
          const W = 1200,
            H = 400;
          if (course.cover_url) {
            return (
              <div className="relative aspect-[6/1] overflow-hidden rounded-lg bg-muted">
                <img
                  src={course.cover_url}
                  className="h-full w-full object-cover"
                  alt={course.name}
                  onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              </div>
            );
          }
          // The live course map below already shows the holes — no second drawn overview.
          void pts; void W; void H;
          return null;
        })()}
        </div>

        <script
          type="application/ld+json"
          // Structured data for search engines: describes this disc golf course.
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              "@context": "https://schema.org",
              "@type": "GolfCourse",
              name: course.name,
              ...(course.description ? { description: course.description } : {}),
              ...(course.cover_url?.startsWith("https://") ? { image: course.cover_url } : {}),
              ...(course.city || course.state || course.postal_code
                ? {
                    address: {
                      "@type": "PostalAddress",
                      ...(course.city ? { addressLocality: course.city } : {}),
                      ...(course.state ? { addressRegion: course.state } : {}),
                      ...(course.postal_code ? { postalCode: course.postal_code } : {}),
                      addressCountry: "US",
                    },
                  }
                : {}),
              ...(course.latitude != null && course.longitude != null
                ? {
                    geo: {
                      "@type": "GeoCoordinates",
                      latitude: course.latitude,
                      longitude: course.longitude,
                    },
                  }
                : {}),
              ...(course.pdga_url ? { sameAs: course.pdga_url } : {}),
              amenityFeature: {
                "@type": "LocationFeatureSpecification",
                name: "Holes",
                value: holes.length || course.hole_count,
              },
            }),
          }}
        />

        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <div className="flex flex-col items-center">
            <h1 className="font-display text-2xl font-semibold">{course.name}</h1>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {[course.city, course.state].filter(Boolean).join(", ") || "Unknown"}
            </div>
            {course.description ? (
              <p className="mx-auto mt-2 max-w-2xl text-sm">{course.description}</p>
            ) : null}
            {course.moderation_status && course.moderation_status !== "approved" ? (
              <div
                className={`mt-2 rounded-md border px-3 py-2 text-xs ${course.moderation_status === "pending" ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200" : "border-red-500/40 bg-red-500/10 text-red-200"}`}
              >
                {course.moderation_status === "pending"
                  ? "Pending admin review — not yet visible to other players."
                  : `Rejected${course.rejection_reason ? `: ${course.rejection_reason}` : ""}`}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
              <span className="rounded-full bg-muted px-2 py-1">{course.hole_count} holes</span>
              {parTotal ? (
                <span className="rounded-full bg-muted px-2 py-1">
                  Par {parTotal}
                  {holes.some((x) => (x as unknown as { par_confirmed?: boolean }).par_confirmed === false) ? " · not confirmed" : ""}
                </span>
              ) : null}
              {distTotal ? (
                <span className="rounded-full bg-muted px-2 py-1">
                  {distTotal.toLocaleString()} ft
                </span>
              ) : null}
              {course.difficulty ? (
                <span className="rounded-full bg-muted px-2 py-1">{course.difficulty}</span>
              ) : null}
              {course.pdga_rating != null ? (
                <span className="rounded-full bg-muted px-2 py-1">
                  {course.pdga_rating.toFixed(1)}★ player rating
                  {course.pdga_rating_votes ? ` · ${course.pdga_rating_votes} ratings` : ""}
                </span>
              ) : null}
              {course.year_established ? (
                <span className="rounded-full bg-muted px-2 py-1">
                  Est. {course.year_established}
                </span>
              ) : null}
              {course.pdga_url ? (
                <a
                  href={course.pdga_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-muted px-2 py-1 underline underline-offset-2"
                >
                  PDGA listing
                </a>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {needsLayout && canAddLayout ? (
              <Button asChild>
                <Link to="/courses/$courseId/edit" params={{ courseId: course.id }}>
                  <Pencil className="mr-1 h-4 w-4" /> Build the scoring layout
                </Link>
              </Button>
            ) : (
              <Button onClick={() => setStartOpen(true)} disabled={starting || !layoutId}>
                <Play className="mr-1 h-4 w-4" /> Start a round
              </Button>
            )}

            <Button variant="outline" asChild>
              <Link to="/courses/$courseId/tee-signs" params={{ courseId: course.id }}>
                <Printer className="mr-1 h-4 w-4" /> Tee signs
              </Link>
            </Button>
            {canEdit ? (
              <>
                <Button variant="outline" asChild>
                  <Link to="/courses/$courseId/studio" params={{ courseId: course.id }}>
                    <LayoutDashboard className="mr-1 h-4 w-4" /> Edit in Course Studio
                  </Link>
                </Button>

                <Button variant="outline" onClick={deleteCourse}>
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {needsLayout ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div>
            <div className="font-semibold text-amber-500">Scoring layout pending</div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              This course is in the library but nobody has mapped its holes yet. Build a layout with
              tees, pars and basket positions to unlock scoring, GPS distances and the caddy book
              for everyone who plays here.
            </p>
          </div>
          {canAddLayout ? (
            <Button asChild>
              <Link to="/courses/$courseId/edit" params={{ courseId: course.id }}>
                <Pencil className="mr-1 h-4 w-4" /> Build a layout
              </Link>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Sign in to build this layout.</span>
          )}
        </div>
      ) : null}

      {layouts.length > 1 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Layout">
          <span className="text-sm text-muted-foreground">Layout:</span>
          {layouts.map((l) => (
            <button
              key={l.id}
              onClick={() => setLayoutId(l.id)}
              className={
                "rounded-full border px-3 py-1 text-sm " +
                (l.id === layoutId
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border")
              }
            >
              {l.name}
              {l.is_default ? " ★" : ""}
            </button>
          ))}
        </div>
      ) : null}
      <Tabs defaultValue={initialTab ?? "overview"} className="w-full">
        <div className="-mx-1 px-1">
          <TabsList className="inline-flex w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="layouts">Layouts</TabsTrigger>
            <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
            <TabsTrigger value="caddy">Caddy book</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="directions">Directions</TabsTrigger>
            <TabsTrigger value="sources">Course data</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {([
                  ["Holes", String(holes.length || course.hole_count)],
                  ["Par", parTotal ? String(parTotal) : "Not set"],
                  ["Distance", distTotal ? `${distTotal.toLocaleString()} ft` : "Not mapped"],
                  ["Layouts", String(layouts.length || 0)],
                  ["Player rating", course.pdga_rating != null ? `${course.pdga_rating.toFixed(1)}★` : "Not rated"],
                  ["Ratings", course.pdga_rating_votes ? String(course.pdga_rating_votes) : "0"],
                  ["Established", course.year_established ? String(course.year_established) : "Unknown"],
                  ["ZIP code", course.postal_code || "Unlisted"],
                ] as Array<[string, string]>).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="truncate font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              {course.description ? (
                <p className="rounded-xl border border-border bg-card p-4 text-sm leading-relaxed">
                  {course.description}
                </p>
              ) : null}
              <CourseConditionReports courseId={course.id} />
              <CourseMapCoverageBadge courseId={course.id} />
              <CourseStatusCard courseId={course.id} />
              {course.flythrough_path ? (
                <div className="min-w-0">
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">Course flythrough</div>
                  <CourseFlythroughPlayer path={course.flythrough_path} />
                </div>
              ) : null}
            </div>
            <div className="min-w-0">
              {layouts.length > 0 ? (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <label htmlFor="overview-layout" className="text-sm text-muted-foreground">Layout</label>
                  <select
                    id="overview-layout"
                    value={layoutId ?? ""}
                    onChange={(e) => setLayoutId(e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-sm"
                  >
                    {layouts.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}{l.is_default ? " (default)" : ""}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              {center ? (
                <ClientOnly fallback={<Skeleton className="h-[380px] w-full rounded-xl" />}>
                  <Suspense fallback={<Skeleton className="h-[380px] w-full rounded-xl" />}>
                    <CourseDetailMap center={center} holes={holes} features={features} courseId={course.id} />
                  </Suspense>
                </ClientOnly>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  This course has no mapped holes yet. Map it in Course Studio to unlock the map,
                  caddy book and GPS distances.
                </div>
              )}
              <p className="mt-1.5 text-xs text-muted-foreground">Turn the map with the compass button, a two-finger twist, or Shift + drag. Updates on its own as the course map changes.</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="layouts" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Every way this course is played. Pick one to see it on the map and scorecard.
            </p>
            {canEdit ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/courses/$courseId/layouts" params={{ courseId: course.id }}>
                  <Pencil className="mr-1 h-4 w-4" /> Manage layouts in Course Studio
                </Link>
              </Button>
            ) : null}
          </div>
          {layouts.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {layouts.map((l) => {
                const on = l.id === layoutId;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLayoutId(l.id)}
                    aria-pressed={on}
                    className={"rounded-xl border bg-card p-4 text-left transition-colors " + (on ? "border-primary" : "border-border hover:border-primary/50")}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">{l.name}</span>
                      {l.is_default ? <Badge variant="secondary">Default</Badge> : null}
                      {on ? <Badge>Showing</Badge> : null}
                    </div>
                    <div className="mt-1 text-sm">
                      {l.hole_count} holes · Par {l.par_total || "—"} · {l.distance_total ? `${l.distance_total.toLocaleString()} ft` : "distance not mapped"}
                    </div>
                    {l.longest_hole_ft || l.shortest_hole_ft ? (
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        {l.shortest_hole_ft ? `Shortest ${l.shortest_hole_ft.toLocaleString()} ft` : ""}
                        {l.shortest_hole_ft && l.longest_hole_ft ? " · " : ""}
                        {l.longest_hole_ft ? `Longest ${l.longest_hole_ft.toLocaleString()} ft` : ""}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No layouts yet.{canEdit ? " Build the first one in Course Studio." : ""}
            </p>
          )}
        </TabsContent>

        <TabsContent value="scorecard" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
              <span className="font-semibold">Scorecard</span>
              {holes.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {distanceComplete
                    ? `All ${holes.length} holes measured`
                    : `${holesWithDistance} of ${holes.length} holes measured · total is partial`}
                </span>
              ) : null}
            </div>
            {holes.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No holes recorded for this layout yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left">Hole</th>
                      {holes.map((h) => (
                        <th key={h.number} className="px-2 py-2 text-center">
                          {h.number}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-2 py-2 font-semibold">Par</td>
                      {holes.map((h) => (
                        <td key={h.number} className="px-2 py-2 text-center">
                          {h.par}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center font-semibold">{parTotal}</td>
                    </tr>
                    <tr className="text-muted-foreground">
                      <td className="px-2 py-2">Distance</td>
                      {holes.map((h) => (
                        <td key={h.number} className="px-2 py-2 text-center">
                          {h.distance_ft ?? "—"}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center">{distTotal || "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="caddy" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-3">
              <div className="font-semibold">Caddy book</div>
              <button
                onClick={() => window.print()}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                Print
              </button>
            </div>
            {holes.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                Map the holes to build a caddy book with distances, notes and photos.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {holes.map((h) => {
                  const drop =
                    h.tee_lat != null && h.basket_lat != null
                      ? Math.round(
                          Math.sqrt(
                            Math.pow((h.tee_lat! - h.basket_lat!) * 364000, 2) +
                              Math.pow((h.tee_lng! - h.basket_lng!) * 288200, 2),
                          ),
                        )
                      : null;
                  return (
                    <div
                      key={h.number}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <div className="flex items-baseline justify-between">
                        <div className="font-display text-lg font-semibold">Hole {h.number}</div>
                        <div className="text-sm text-muted-foreground">
                          Par {h.par}
                          {(h as { par_confirmed?: boolean }).par_confirmed === false && (
                            <span className="ml-1 text-xs">
                              {(h as { par_source?: string | null }).par_source === "udisc_listing"
                                ? "· from UDisc listing"
                                : (h as { par_source?: string | null }).par_source === "disc_golf_scene_listing"
                                  ? "· from Disc Golf Scene listing"
                                  : "· not confirmed"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {h.distance_ft ? `${h.distance_ft} ft` : "Distance TBD"}
                        {drop && !h.distance_ft ? ` · ~${drop} ft (GPS)` : ""}
                        {(h as { current_pin?: string | null }).current_pin
                          ? ` · Basket in ${(h as { current_pin?: string | null }).current_pin} pin`
                          : ""}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Tee:{" "}
                        {h.tee_lat != null
                          ? `${h.tee_lat.toFixed(5)}, ${h.tee_lng!.toFixed(5)}${placedLabel((h as { tee_source?: string | null }).tee_source)}`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Basket:{" "}
                        {h.basket_lat != null
                          ? `${h.basket_lat.toFixed(5)}, ${h.basket_lng!.toFixed(5)}${placedLabel((h as { basket_source?: string | null }).basket_source)}`
                          : "—"}
                      </div>
                      {(() => {
                        const chips = describeMappedFeatures(
                          features
                            .filter(
                              (f) => !featureIsCourseWide(f) && featureAppliesToHole(f, h.number),
                            )
                            .map((f) => f.type),
                        );
                        if (!chips.length) return null;
                        return (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {chips.map((c) => (
                              <span
                                key={c}
                                className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                      {h.caddy_notes ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm">{h.caddy_notes}</p>
                      ) : null}

                      <div className="mt-3 border-t border-border pt-2">
                        <HoleMediaGallery
                          holeId={h.id}
                          canEdit={isOwner}
                          userId={user?.id ?? null}
                          compact
                        />
                      </div>
                      {h.flythrough_path ? (
                        <div className="mt-2">
                          <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                            Flythrough
                          </div>
                          <HoleFlythroughPlayer path={h.flythrough_path} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4 space-y-4">
          <CourseReviews courseId={course.id} />
          <UdiscCourseIntel courseId={course.id} />
        </TabsContent>

        <TabsContent value="directions" className="mt-4">
          <CourseDirections
            name={course.name}
            city={course.city}
            state={course.state}
            latitude={entrancePoint?.[0] ?? course.latitude}
            longitude={entrancePoint?.[1] ?? course.longitude}
            isEntrance={entrancePoint != null}
          />
        </TabsContent>

        <TabsContent value="sources" className="mt-4 space-y-4">
          <CourseDataSources courseId={course.id} />
          <DgcrCourseCard courseId={course.id} />
        </TabsContent>
      </Tabs>

      <div className="text-center">
        <Link to="/play" className="text-sm text-muted-foreground hover:text-foreground">
          View your round history →
        </Link>
      </div>

      <StartRoundDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        courseId={course.id}
        courseName={course.name}
        layoutId={layoutId}
        holeCount={holes.length || course.hole_count}
      />
    </div>
  );
}

function placedLabel(source: string | null | undefined): string {
  if (source === "gps") return " · walked with GPS";
  if (source === "aerial_map") return " · placed on aerial map";
  if (source === "import") return " · from a course listing";
  return "";
}
