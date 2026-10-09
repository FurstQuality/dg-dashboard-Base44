import { Loader2 } from "lucide-react";
import { CourseMapSign } from "@/components/tee-signs/course-map-sign";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { signReadiness, TERRAIN_TYPES, type SignFeature } from "@/lib/tee-sign-pro";
import { getSignTerrain } from "@/lib/tee-sign-terrain.functions";
import { detectCanopy, clearCanopy } from "@/lib/tee-sign-canopy";
import { ProSign, signToSvgBlob } from "@/components/tee-signs/pro-sign";
import { featureAppliesToHole, featureIsCourseWide, type DbFeature } from "@/lib/course-features";
import { describeMappedFeatures } from "@/lib/director-kit";
import { supabase } from "@/integrations/supabase/client";
import { loadPlayerLayoutOrder } from "@/lib/layout-activity";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Printer, TrendingUp, TrendingDown, AlertTriangle, Pencil, Paintbrush, Download } from "lucide-react";
import { SignCanvas } from "@/components/tee-signs/sign-canvas";
import { SignEditorSheet } from "@/components/tee-signs/sign-editor";
import { imagePaths, mergeDesigns, type SignDesign } from "@/lib/tee-sign-design";
import { courseRoutePreview, type CourseRoutePreview } from "@/lib/course-builder/course-route";
import { courseFeaturesForLayout } from "@/lib/course-builder/layout-rules";

type Course = { id: string; name: string; city: string | null; state: string | null };
type Layout = { id: string; name: string; par_total: number | null; distance_total: number | null };
type Hole = {
  id: string;
  number: number;
  par: number;
  distance_ft: number | null;
  tee_lat: number | null;
  tee_lng: number | null;
  basket_lat: number | null;
  basket_lng: number | null;
  tee_name: string | null;
  basket_name: string | null;
  tee_color: string | null;
  basket_color: string | null;
  caddy_notes: string | null;
  nickname: string | null;
  elevation_ft: number | null;
  shot_shape: string | null;
  hazards: string[] | null;
  designer_notes: string | null;
  map_snapshot_path: string | null;
  flight_path: [number, number][] | null;
  par_confirmed: boolean | null;
  snapshotUrl?: string | null;
};
type Pad = {
  id: string;
  hole_id: string;
  name: string;
  color: string | null;
  distance_ft: number | null;
  latitude: number | null;
  longitude: number | null;
  sort_order: number;
  flight_path?: unknown;
  split_point?: unknown;
};

const SHOT_LABEL: Record<string, string> = {
  straight: "Straight",
  hyzer: "Hyzer",
  anhyzer: "Anhyzer",
  dogleg_left: "Dogleg L",
  dogleg_right: "Dogleg R",
  tunnel: "Tunnel",
  open: "Open",
};

/** embedHole: draw only that hole's sign (no page chrome) — used by the scoring screen. */
export default function TeeSignsPage({ courseId, initialLayoutId, overlayId, embedHole }: { courseId: string; initialLayoutId?: string; overlayId?: string; embedHole?: number }) {
  const [overlayName, setOverlayName] = useState<string | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [features, setFeatures] = useState<DbFeature[]>([]);
  const [tees, setTees] = useState<Pad[]>([]);
  const [baskets, setBaskets] = useState<Pad[]>([]);
  const previews=useMemo(()=>new Map(holes.map(h=>[h.id,courseRoutePreview(h,tees.filter(t=>t.hole_id===h.id),baskets.filter(b=>b.hole_id===h.id))])),[holes,tees,baskets]);
  const [pins, setPins] = useState<Record<string, string>>({});
  const extrasFor = (h: Hole): SignExtras => ({ tees: tees.filter((t) => t.hole_id === h.id), baskets: baskets.filter((b) => b.hole_id === h.id), pin: pins[h.id] ?? null,preview:previews.get(h.id) });
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [reloadToken,setReloadToken]=useState(0);
  const [designs, setDesigns] = useState<Record<string, SignDesign>>({}); // key: hole id or "shared"
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [canEdit, setCanEdit] = useState(false);
  const [canPin, setCanPin] = useState(false);
  const [sponsors, setSponsors] = useState<string[]>([]);
  useEffect(() => {
    supabase.from("course_sponsors").select("name").eq("course_id", courseId).in("category", ["course", "community"]).order("sort_order").limit(4)
      .then(({ data }) => setSponsors((data ?? []).map((x) => x.name)));
  }, [courseId]);
  const [editing, setEditing] = useState<{ key: string; holeId: string | null; label: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    setLayoutId(null);
    (async () => {
      const [{ data: c, error:courseError }, { data: ls, error:layoutsError }] = await Promise.all([
        supabase.from("courses").select("id, name, city, state").eq("id", courseId).maybeSingle(),
        supabase
          .from("course_layouts")
          .select("id, name, par_total, distance_total")
          .eq("course_id", courseId)
          .neq("status", "draft"),
      ]);
      if (!mounted) return;
      if(courseError || layoutsError) throw courseError || layoutsError;
      setCourse(c as Course | null);
      // Signs default to the layout the course is actually playing right now.
      const rows = await loadPlayerLayoutOrder(courseId, (ls as Layout[]) ?? []);
      if (!mounted) return;
      setLayouts(rows);
      setLayoutId(rows.find((r) => r.id === initialLayoutId)?.id ?? rows[0]?.id ?? null);
      if (!rows.length) setLoading(false);
    })().catch(error=>{if(mounted){setLoadError(error?.message ?? "The course could not be loaded.");setLoading(false);}});
    return () => {
      mounted = false;
    };
  }, [courseId,initialLayoutId,reloadToken]);

  useEffect(() => {
    if (!layoutId) return;
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    setCanEdit(false);
    setCanPin(false);
    (async () => {
      const [{ data: hs, error:holesError }, { data: fs, error:featuresError }] = await Promise.all([
        supabase
          .from("holes")
          .select(
            "id, number, par, distance_ft, tee_lat, tee_lng, basket_lat, basket_lng, tee_name, basket_name, tee_color, basket_color, caddy_notes, nickname, elevation_ft, shot_shape, hazards, designer_notes, map_snapshot_path, flight_path, par_confirmed",
          )
          .eq("layout_id", layoutId)
          .order("number"),
        supabase
          .from("course_features")
          .select("id, type, geometry, ob_side, label, hole_number, hole_numbers, layout_id, layer")
          .eq("course_id", courseId)
          .neq("publish_state", "draft")
        .neq("layer", "event"),
      ]);
      if (!mounted) return;
      if(holesError || featuresError) throw holesError || featuresError;
      const {data:ruleLayout,error:rulesError}=await supabase.from("course_layouts").select("played_rule_ids").eq("id",layoutId).maybeSingle();
      if(rulesError) throw rulesError;
      const groundFeatures=courseFeaturesForLayout(fs ?? [],layoutId,(ruleLayout?.played_rule_ids as string[]|null) ?? null);
      let holeRows = (hs as Hole[]) ?? [];
      // Each hole uses the layout's chosen tee pad and basket position when the layout picks them.
      const { data: slots, error:slotsError } = await supabase.from("layout_slots").select("legacy_hole_id, tee_id, basket_id").eq("layout_id", layoutId).eq("included", true);
      if(slotsError) throw slotsError;
      const teeIds = (slots ?? []).map((x) => x.tee_id).filter(Boolean) as string[];
      const bIds = (slots ?? []).map((x) => x.basket_id).filter(Boolean) as string[];
      if (teeIds.length || bIds.length) {
        const [teeResult, basketResult] = await Promise.all([
          teeIds.length ? supabase.from("course_tees").select("id, name, latitude, longitude").in("id", teeIds) : Promise.resolve({ data: [] as { id: string; name: string; latitude: number | null; longitude: number | null }[] }),
          bIds.length ? supabase.from("course_baskets").select("id, name, latitude, longitude").in("id", bIds) : Promise.resolve({ data: [] as { id: string; name: string; latitude: number | null; longitude: number | null }[] }),
        ]);
        if ("error" in teeResult && teeResult.error) throw teeResult.error;
        if ("error" in basketResult && basketResult.error) throw basketResult.error;
        const ct=teeResult.data, cb=basketResult.data;
        const tm = new Map((ct ?? []).map((x) => [x.id, x]));
        const bm = new Map((cb ?? []).map((x) => [x.id, x]));
        const bySlot = new Map((slots ?? []).filter((x) => x.legacy_hole_id).map((x) => [x.legacy_hole_id as string, x]));
        holeRows = holeRows.map((h) => {
          const sl = bySlot.get(h.id);
          const t = sl?.tee_id ? tm.get(sl.tee_id) : null;
          const b = sl?.basket_id ? bm.get(sl.basket_id) : null;
          return {
            ...h,
            // The hole's own tee/basket (what the map editor draws, with its bends) wins; the layout's
            // chosen pad/basket only fills a missing spot, so a bend is never paired with a different basket.
            ...(h.tee_lat == null && t && t.latitude != null && t.longitude != null ? { tee_lat: t.latitude, tee_lng: t.longitude, tee_name: t.name } : {}),
            ...(h.basket_lat == null && b && b.latitude != null && b.longitude != null ? { basket_lat: b.latitude, basket_lng: b.longitude, basket_name: b.name } : {}),
          };
        });
      }
      const withUrls = await Promise.all(
        holeRows.map(async (h) => {
          if (!h.map_snapshot_path) return { ...h, snapshotUrl: null };
          const { data: s } = await supabase.storage
            .from("hole-media")
            .createSignedUrl(h.map_snapshot_path, 3600);
          return { ...h, snapshotUrl: s?.signedUrl ?? null };
        }),
      );
      if (!mounted) return;
      setHoles(withUrls);
      // Event signs add the event's own rules (OB, mandos, drop zones) on top of the course map.
      let eventFs: DbFeature[] = [];
      if (overlayId) {
        const [{ data: ov, error:overlayError }, { data: ef, error:overlayFeaturesError }] = await Promise.all([
          supabase.from("course_event_overlays").select("name").eq("id", overlayId).eq("course_id", courseId).maybeSingle(),
          supabase.from("course_features").select("id, type, geometry, ob_side, label, hole_number, hole_numbers").eq("event_overlay_id", overlayId).eq("layer", "event"),
        ]);
        if (!mounted) return;
        if(overlayError || overlayFeaturesError) throw overlayError || overlayFeaturesError;
        setOverlayName(ov?.name ?? null);
        eventFs = ov ? ((ef as unknown as DbFeature[]) ?? []) : [];
      }
      setFeatures([...(groundFeatures as unknown as DbFeature[]), ...eventFs]);
      setTees([]);
      setBaskets([]);
      const [{ data: ds, error:designError }, { data: u }] = await Promise.all([
        supabase.from("tee_sign_designs").select("hole_id, design").eq("layout_id", layoutId),
        supabase.auth.getUser(),
      ]);
      if(designError) throw designError;
      const map: Record<string, SignDesign> = {};
      for (const r of ds ?? []) map[r.hole_id ?? "shared"] = (r.design ?? {}) as SignDesign;
      const paths = [...new Set(Object.values(map).flatMap(imagePaths))];
      const signed: Record<string, string> = {};
      if (paths.length) {
        const { data: su, error:imagesError } = await supabase.storage.from("hole-media").createSignedUrls(paths, 3600);
        if(imagesError) throw imagesError;
        for (const x of su ?? []) if (x.path && x.signedUrl) signed[x.path] = x.signedUrl;
      }
      if (u.user) {
        const { data: ok } = await supabase.rpc("can_edit_layout", { _layout: layoutId, _user: u.user.id });
        if (mounted) setCanEdit(!!ok);
        const { data: st } = await supabase.rpc("can_steward_course", { _course: courseId, _user: u.user.id });
        if (mounted) setCanPin(!!ok || !!st);
      }
      if (!mounted) return;
      setDesigns(map);
      setUrls(signed);
      setPins({});
      if (holeRows.length) {
        const ids = holeRows.map((h) => h.id);
        const [{ data: ts, error:teesError }, { data: bs, error:basketsError }] = await Promise.all([
          supabase
            .from("hole_tees")
            .select("id, hole_id, name, color, distance_ft, latitude, longitude, sort_order, flight_path")
            .in("hole_id", ids)
            .order("sort_order"),
          supabase
            .from("hole_baskets")
            .select("id, hole_id, name, color, distance_ft, latitude, longitude, sort_order, split_point")
            .in("hole_id", ids)
            .order("sort_order"),
        ]);
        if (!mounted) return;
        if(teesError || basketsError) throw teesError || basketsError;
        setTees((ts as Pad[]) ?? []);
        setBaskets((bs as Pad[]) ?? []);
        // Latest confirmed pin per hole; no row means the current pin stays unconfirmed.
        const { data: pp, error:pinsError } = await supabase.from("hole_pin_placements").select("hole_id, pin_name, set_at").in("hole_id", ids).order("set_at", { ascending: false });
        if (!mounted) return;
        if(pinsError) throw pinsError;
        const cur: Record<string, string> = {};
        for (const r of pp ?? []) if (!(r.hole_id in cur) && r.pin_name) cur[r.hole_id] = r.pin_name;
        setPins(cur);
      }
      setLoading(false);
    })().catch(error=>{if(mounted){setLoadError(error?.message ?? "The sign data could not be loaded.");setLoading(false);}});
    return () => {
      mounted = false;
    };
  }, [layoutId,courseId,overlayId,reloadToken]);

  const [terrain, setTerrain] = useState<SignFeature[]>([]);
  /** What the sign artwork is still waiting on, shown to the user. */
  const [terrainStage, setTerrainStage] = useState<"idle" | "ground" | "trees" | "done" | "failed">("idle");
  const featuresRef = useRef(features);
  featuresRef.current = features;
  useEffect(() => {
    const pts = holes.flatMap((h) => [
      ...(h.tee_lat != null && h.tee_lng != null ? [[h.tee_lat, h.tee_lng] as [number, number]] : []),
      ...(h.basket_lat != null && h.basket_lng != null ? [[h.basket_lat, h.basket_lng] as [number, number]] : []),
    ]);
    if (!pts.length) return;
    let live = true;
    setTerrainStage("ground");
    getSignTerrain({ data: { courseId, points: pts } })
      .then(async (r) => {
        if (!live) return;
        setTerrain(r.features);
        setTerrainStage("trees");
        // Real tree canopy from one satellite photo over the whole course.
        const canopy = await detectCanopy(pts).catch(() => [] as SignFeature[]);
        if (live && canopy.length) setTerrain([...clearCanopy(canopy, [...r.features, ...(featuresRef.current as unknown as SignFeature[])], pts, holes.flatMap((h) => h.tee_lat != null && h.tee_lng != null && h.basket_lat != null && h.basket_lng != null ? [[[h.tee_lat, h.tee_lng], [h.basket_lat, h.basket_lng]] as [[number, number], [number, number]]] : [])), ...r.features]);
        if (live) setTerrainStage("done");
      })
      .catch(() => {
        if (!live) return;
        setTerrain([]);
        setTerrainStage("failed");
      });
    return () => { live = false; };
  }, [holes, courseId]);

  const layout = layouts.find((l) => l.id === layoutId) ?? null;
  const distanceKnown=holes.length>0 && holes.every(h=>previews.get(h.id)?.distance!=null);
  const totalDistance=distanceKnown ? holes.reduce((sum,h)=>sum+previews.get(h.id)!.distance!,0) : null;
  const totalPar=holes.length>0 && holes.every(h=>h.par_confirmed) ? holes.reduce((sum,h)=>sum+h.par,0) : null;

  const setPin = async (holeId: string, name: string) => {
    const { error } = await supabase.rpc("set_hole_pin", { _hole: holeId, _pin: name });
    if (error) { toast.error("The current pin couldn't be saved. Only course stewards can set it."); return; }
    setPins((p) => ({ ...p, [holeId]: name }));
    toast.success(`Current pin set to ${name}`);
  };

  // One-click caddy book: the course map plus every hole sign, one per page, from the same drawings.
  const openCaddyBook = () => {
    const svgs = [...document.querySelectorAll("[data-sign-card] svg")].map((el) => el.outerHTML);
    if (!svgs.length) { toast.error("No signs are ready to put in the caddy book yet."); return; }
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to open the caddy book."); return; }
    const title = `${course?.name ?? "Course"}${overlayName ? ` ${overlayName}` : ""} caddy book`;
    w.document.write(`<!doctype html><html><head><title>${title.replace(/</g, "")}</title><style>body{margin:0;font-family:Arial,sans-serif}.pg{page-break-after:always;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box}.pg svg{max-width:100%;max-height:95vh;height:auto}</style></head><body>${svgs.map((x) => `<div class="pg">${x}</div>`).join("")}<script>setTimeout(()=>print(),400)<\/script></body></html>`);
    w.document.close();
  };

  if(loadError) return <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
    <p>Course signs could not be loaded. {loadError}</p>
    <Button className="mt-2" variant="outline" onClick={()=>setReloadToken(value=>value+1)}>Retry signs</Button>
  </div>;
  if (loading)
    return (
      <div role="status" aria-live="polite" className={embedHole != null ? "grid h-full w-full place-items-center p-4 text-center text-sm text-muted-foreground" : "flex h-96 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground"}>
        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-primary" />Loading this course's holes and sign designs…</span>
      </div>
    );
  if (embedHole != null && (!course || !layout)) return <div className="grid h-full place-items-center p-4 text-center text-sm text-white/80">This layout has no tee sign yet.</div>;
  if (!course || !layout) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        This course doesn’t have a built layout yet. Build one to print tee signs.
      </div>
    );
  }

  // Terrain (trees, water, paths, benches…) is real ground, so every sign shows whatever falls inside its frame; rules only for this hole.
  const holeFeatures = (n: number) =>
    features.filter((f) => TERRAIN_TYPES.has(f.type) || featureIsCourseWide(f) || featureAppliesToHole(f, n));
  const renderBase = (holeId: string | null) => (d: SignDesign) => {
    const h = holes.find((x) => x.id === holeId) ?? holes[0];
    if (!h) return null;
    return <ProSign courseName={course.name} hole={toSignHole(h, d, extrasFor(h))} features={holeFeatures(h.number)} terrain={terrain} design={d} urls={urls} qrUrl={courseUrl(course.id)} />;
  };

  if (embedHole != null) {
    const h = holes.find((x) => x.number === embedHole);
    if (!h) return <div className="grid h-full place-items-center p-4 text-center text-sm text-white/80">No tee sign for this hole yet.</div>;
    const d = mergeDesigns(designs.shared ?? null, designs[h.id] ?? null);
    if (h.tee_lat == null || h.basket_lat == null) return <div className="grid h-full place-items-center p-4 text-center text-sm text-white/80">This hole isn't on the course map yet, so there's no tee sign to show.</div>;
    return (
      <div className="relative flex h-full w-full items-center justify-center [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full">
        <ProSign courseName={course.name} hole={toSignHole(h, d, extrasFor(h))} features={holeFeatures(h.number)} terrain={terrain} design={d} urls={urls} qrUrl={courseUrl(course.id)} includeElements />
        {terrainStage === "ground" || terrainStage === "trees" ? (
          <div role="status" aria-live="polite" className="absolute inset-x-2 top-2 flex items-center gap-2 rounded-md bg-background/90 px-2 py-1 text-xs shadow">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            {terrainStage === "ground" ? "Loading ground details for this sign…" : "Adding trees from the satellite photo — up to half a minute on big courses…"}
          </div>
        ) : null}
      </div>
    );
  }

  const courseWideChips = describeMappedFeatures(
    features.filter((f) => featureIsCourseWide(f)).map((f) => f.type),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-semibold">{course.name} — {overlayName ? `${overlayName} signs` : "tee signs"}</h1>
          <SignLoadNotice stage={terrainStage} courseName={course.name} />
          {overlayName ? <p className="text-sm font-medium text-primary">Includes this event's own rules</p> : null}
          <p className="text-sm text-muted-foreground">
            {layout.name} · par {totalPar ?? "—"} ·{" "}
            {totalDistance==null ? "Distance —" : `${totalDistance.toLocaleString()} ft`} · {holes.length} holes
          </p>
          <p className="mt-1 text-sm">
            {holes.filter((h) => readinessOf(h,extrasFor(h)) === "ready").length} of {holes.length} signs ready to print
          </p>
          {courseWideChips.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Course-wide: {courseWideChips.join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {layouts.length > 1 ? (
            <select
              aria-label="Layout"
              value={layoutId ?? ""}
              onChange={(e) => setLayoutId(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              {layouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          ) : null}
          {canEdit ? (
            <Button variant="secondary" onClick={() => setEditing({ key: "shared", holeId: null, label: "all signs" })}>
              <Paintbrush className="mr-1 h-4 w-4" /> Edit all signs
            </Button>
          ) : null}
          <Button variant="secondary" onClick={openCaddyBook}>
            <BookOpen className="mr-1 h-4 w-4" /> Caddy book
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {holes.some((h) => h.tee_lat != null && h.basket_lat != null) ? (
        <section className="rounded-xl border border-border bg-card p-3" data-sign-card>
          <div className="mb-2 flex items-center justify-between print:hidden">
            <h2 className="text-sm font-semibold">Course map sign</h2>
            <span className="text-xs text-muted-foreground">Every hole on one sign</span>
          </div>
          <CourseMapSign
            courseName={course.name}
            holes={holes.map(h=>toSignHole(h,{},extrasFor(h)))}
            features={[...terrain, ...features] as never}
            sponsors={sponsors}
          />
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {holes.map((h) => {
          const hasCoords = h.tee_lat != null && h.tee_lng != null;
          const center: [number, number] | null = hasCoords ? [h.tee_lat!, h.tee_lng!] : null;
          const featureChips = describeMappedFeatures(
            features
              .filter((f) => !featureIsCourseWide(f) && featureAppliesToHole(f, h.number))
              .map((f) => f.type),
          );
          const holeTees = tees.filter((t) => t.hole_id === h.id);
          const holeBaskets = baskets.filter((b) => b.hole_id === h.id);
          const hazards = h.hazards ?? [];
          const design = mergeDesigns(designs.shared ?? null, designs[h.id] ?? null);
          const hide = design.hide ?? {};
          const notes = design.notes ?? h.caddy_notes;

          const allTeePins: Array<{
            name: string;
            color: string | null;
            pt: [number, number];
            id: string;
          }> = [];
          if (h.tee_lat != null && h.tee_lng != null) {
            allTeePins.push({
              name: h.tee_name || "Main",
              color: h.tee_color,
              pt: [h.tee_lat, h.tee_lng],
              id: "main-tee",
            });
          }
          holeTees.forEach((t) => {
            if (t.latitude != null && t.longitude != null)
              allTeePins.push({
                name: t.name,
                color: t.color,
                pt: [t.latitude, t.longitude],
                id: t.id,
              });
          });
          const allBasketPins: Array<{
            name: string;
            color: string | null;
            pt: [number, number];
            id: string;
          }> = [];
          if (h.basket_lat != null && h.basket_lng != null) {
            allBasketPins.push({
              name: h.basket_name || "A",
              color: h.basket_color,
              pt: [h.basket_lat, h.basket_lng],
              id: "main-basket",
            });
          }
          holeBaskets.forEach((b) => {
            if (b.latitude != null && b.longitude != null)
              allBasketPins.push({
                name: b.name,
                color: b.color,
                pt: [b.latitude, b.longitude],
                id: b.id,
              });
          });

          const preview=previews.get(h.id)!;

          return (
            <article
              key={h.number}
              className="break-inside-avoid overflow-hidden rounded-xl border border-border bg-card"
            >
              <header
                className="relative flex items-baseline justify-between border-b border-border bg-primary/10 px-3 py-2"
                style={design.accent ? { backgroundColor: design.accent + "26", borderBottomColor: design.accent } : undefined}
              >
                <div>
                  <div
                    className="font-display text-xl font-bold text-primary leading-tight"
                    style={design.accent ? { color: design.accent } : undefined}
                  >
                    {design.title || `Hole ${h.number}`}
                  </div>
                  {(design.subtitle || h.nickname?.trim()) ? (
                    <div className="text-xs font-medium text-foreground/80">
                      {design.subtitle || h.nickname!.trim()}
                    </div>
                  ) : null}
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Position {h.number} of {holes.length}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 print:hidden">
                    <ReadinessBadge h={h} extras={extrasFor(h)} />
                    {canEdit ? (
                      <Link to="/courses/$courseId/edit" params={{ courseId: course.id }} search={{ layout: layout.id, hole: h.number }} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                        Edit hole map
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div>
                    Par <span className="font-semibold">{h.par_confirmed ? h.par : "—"}</span> ·{" "}
                    {preview.distance != null ? (
                      `${preview.distance} ft`
                    ) : (
                      <span className="italic text-muted-foreground">Distance —</span>
                    )}
                  </div>
                  {h.elevation_ft != null && h.elevation_ft !== 0 ? (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      {h.elevation_ft > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {Math.abs(h.elevation_ft)} ft {h.elevation_ft > 0 ? "up" : "down"}
                    </div>
                  ) : null}
                </div>
              </header>

              <div className="relative">
                {design.style !== "photo" ? (
                  <ProSignCard
                    courseName={course.name}
                    courseId={course.id}
                    h={h}
                    extras={extrasFor(h)}
                    design={design}
                    features={holeFeatures(h.number)}
                    terrain={terrain}
                    urls={urls}
                  />
                ) : (
                  <SignCanvas
                    design={design}
                    fallbackUrl={h.snapshotUrl ?? null}
                    urls={urls}
                    alt={`Hole ${h.nickname?.trim() || h.number} tee sign`}
                  />
                )}
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute right-2 top-2 print:hidden"
                    onClick={() => setEditing({ key: h.id, holeId: h.id, label: `Hole ${h.number}` })}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit sign
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2 p-3 text-sm">
                {allTeePins.length && !hide.tees ? (
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      Tees
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {allTeePins.map((t) => (
                        <span
                          key={"pill-t-" + t.id}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs"
                        >
                          <span
                            aria-hidden
                            className="inline-block h-3 w-3 rounded-full border border-border"
                            style={{ backgroundColor: t.color ?? "transparent" }}
                          />
                          <span className="font-medium">{t.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {allBasketPins.length && !hide.baskets ? (
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      Baskets
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {allBasketPins.map((b) => (
                        <span
                          key={"pill-b-" + b.id}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs"
                        >
                          <span
                            aria-hidden
                            className="inline-block h-3 w-3 rounded-sm border border-border"
                            style={{ backgroundColor: b.color ?? "transparent" }}
                          />
                          <span className="font-medium">{b.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {allTeePins.length && allBasketPins.length && !hide.distances ? (
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      Distances (ft)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr>
                            <th className="px-1.5 py-0.5 text-left text-muted-foreground">
                              Tee ↓ / Basket →
                            </th>
                            {allBasketPins.map((b) => (
                              <th
                                key={"h-" + b.id}
                                className="px-1.5 py-0.5 text-right font-medium"
                              >
                                {b.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {allTeePins.map((t) => (
                            <tr key={"r-" + t.id} className="border-t border-border">
                              <td className="px-1.5 py-0.5 font-medium">{t.name}</td>
                              {allBasketPins.map((b) => {
                                const score=preview.pairs?.[`${t.id}/${b.id}`];
                                return (
                                  <td key={`${t.id}-${b.id}`} className="px-1.5 py-0.5 text-right" title={score ? score.distanceOverride==null ? "Mapped fairway" : "Measured distance" : "Pairing not mapped or assigned"}>
                                    {score?.distance ?? "—"}
                                    {score && <span className="block text-[10px] text-muted-foreground">Par {score.par ?? "—"}{score.distanceOverride!=null ? " · measured" : ""}</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {!hide.chips && (h.shot_shape || hazards.length || featureChips.length) ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {h.shot_shape ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {SHOT_LABEL[h.shot_shape] ?? h.shot_shape}
                      </span>
                    ) : null}
                    {hazards.map((hz) => (
                      <span
                        key={hz}
                        className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" /> {hz}
                      </span>
                    ))}
                    {featureChips.map((c) => (
                      <span
                        key={c}
                        className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  Distance:{" "}
                  {preview.source==="mapped" ? "mapped fairways; measured overrides labelled in the table" : preview.source==="measured" ? "measured override; mapped fairways for other assigned pairings" : "—"}
                </p>
                {canPin && allBasketPins.length > 1 ? (
                  <label className="flex items-center gap-2 text-xs print:hidden">
                    <span className="font-semibold">Current pin</span>
                    <select
                      value={pins[h.id] ?? ""}
                      onChange={(e) => e.target.value && setPin(h.id, e.target.value)}
                      className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                    >
                      <option value="">Not confirmed</option>
                      {allBasketPins.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </label>
                ) : null}
                {notes && !hide.caddy ? (
                  <div>
                    <div className="mb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      Caddy notes
                    </div>
                    <p className="whitespace-pre-wrap">{notes}</p>
                  </div>
                ) : null}

                {h.designer_notes && !hide.designer ? (
                  <div className="border-t border-border pt-2">
                    <div className="mb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      Designer
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {h.designer_notes}
                    </p>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {editing && layoutId ? (
        <SignEditorSheet
          open
          onOpenChange={(v) => !v && setEditing(null)}
          layoutId={layoutId}
          scope={editing.holeId ? { holeId: editing.holeId, holeLabel: editing.label } : null}
          title={editing.holeId ? `Edit sign — ${editing.label}` : "Edit all signs"}
          shared={editing.holeId ? designs.shared ?? null : null}
          initial={designs[editing.key] ?? null}
          fallbackUrl={editing.holeId ? holes.find((x) => x.id === editing.holeId)?.snapshotUrl ?? null : holes[0]?.snapshotUrl ?? null}
          urls={urls}
          onUrls={(u) => setUrls((p) => ({ ...p, ...u }))}
          onSaved={(d) => setDesigns((p) => ({ ...p, [editing.key]: d }))}
          renderBase={renderBase(editing.holeId)}
        />
      ) : null}
    </div>
  );
}

const courseUrl = (id: string) => `https://dgdashboard.app/courses/${id}`;

type SignExtras = { tees: Pad[]; baskets: Pad[]; pin: string | null;preview?:CourseRoutePreview };
const padsOf = (ps: Pad[]) =>
  ps.filter((p) => p.latitude != null && p.longitude != null).map((p) => ({ id:p.id,name: p.name, color: p.color, at: [p.latitude!, p.longitude!] as [number, number] }));

function toSignHole(h: Hole, d: SignDesign, x?: SignExtras) {
  const preview=x?.preview ?? courseRoutePreview(h,x?.tees,x?.baskets);
  return {
    tees: [...(h.tee_lat!=null && h.tee_lng!=null ? [{id:"main-tee",name:h.tee_name || "Main",color:h.tee_color,at:[h.tee_lat,h.tee_lng] as [number,number]}] : []),...(x ? padsOf(x.tees) : [])],
    baskets: [...(h.basket_lat!=null && h.basket_lng!=null ? [{id:"main-basket",name:h.basket_name || "A",color:h.basket_color,at:[h.basket_lat,h.basket_lng] as [number,number]}] : []),...(x ? padsOf(x.baskets) : [])],
    currentPin: x?.pin ?? null,
    elevationFt: h.elevation_ft ?? null,
    number: h.number,
    label: d.title && d.title.length <= 3 ? d.title : null,
    // Par prints only when it's confirmed — never guessed.
    par: h.par_confirmed ? h.par : null,
    distanceFt: preview.distance,
    tee: h.tee_lat != null && h.tee_lng != null ? ([h.tee_lat, h.tee_lng] as [number, number]) : null,
    basket: h.basket_lat != null && h.basket_lng != null ? ([h.basket_lat, h.basket_lng] as [number, number]) : null,
    flightPath: Array.isArray(h.flight_path) ? h.flight_path : null,
    routeCurve: preview.curve,
    pairDistances:preview.pairs ?? {},
  };
}

function ProSignCard({ courseName, courseId, h, extras, design, features, terrain, urls }: {
  courseName: string; courseId: string; h: Hole; extras: SignExtras; design: SignDesign; features: DbFeature[]; terrain: SignFeature[]; urls: Record<string, string>;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const blob = await signToSvgBlob(ref.current);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${courseName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-hole-${h.number}-sign.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch {
      toast.error("The sign file couldn't be made. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relative" data-sign-card>
      <ProSign ref={ref} courseName={courseName} hole={toSignHole(h, design, extras)} features={features} terrain={terrain} design={design} urls={urls} qrUrl={courseUrl(courseId)} includeElements />
      <Button size="sm" variant="secondary" className="absolute bottom-2 right-2 print:hidden" disabled={busy} onClick={download}>
        <Download className="mr-1 h-3.5 w-3.5" /> Sign file
      </Button>
    </div>
  );
}

const readinessOf = (h: Hole, extras?:SignExtras) =>
  signReadiness({ tee: h.tee_lat != null && h.tee_lng != null, basket: h.basket_lat != null && h.basket_lng != null, parConfirmed: !!h.par_confirmed,
    routeReady:!!(extras?.preview ?? courseRoutePreview(h,extras?.tees,extras?.baskets)).curve });

function ReadinessBadge({ h,extras }: { h: Hole;extras:SignExtras }) {
  const r = readinessOf(h,extras);
  const label = r === "ready" ? "Ready" : r === "needs_map" ? "Needs map" : r === "needs_route" ? "Review fairway" : "Needs par";
  return (
    <span title={extras.preview?.issue} className={"rounded-full px-2 py-0.5 text-xs font-medium " + (r === "ready" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
      {label}
    </span>
  );
}

function SignLoadNotice({ stage, courseName }: { stage: "idle" | "ground" | "trees" | "done" | "failed"; courseName: string }) {
  if (stage === "idle" || stage === "done") return null;
  if (stage === "failed")
    return (
      <p role="status" className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        We couldn't load the trees and ground details right now. Signs show the course map only — reload the page to try again.
      </p>
    );
  return (
    <div role="status" aria-live="polite" className="mt-2 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
      <div>
        <div className="font-medium">Please wait while we load your {courseName} tee sign graphics</div>
        <div className="text-muted-foreground">
          {stage === "ground"
            ? "Step 1 of 2: reading paths, water and open ground around every hole…"
            : "Step 2 of 2: finding the trees in the satellite photo. On big courses this can take up to half a minute."}
        </div>
      </div>
    </div>
  );
}
