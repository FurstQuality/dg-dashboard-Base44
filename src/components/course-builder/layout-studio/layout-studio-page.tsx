import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, Pencil, Signpost } from "lucide-react";
import { ArrowDown, ArrowUp, Check, Copy, GitCompare, History, Plus, Save, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  bulkSwap,
  compareLayouts,
  keepRange,
  layoutReadiness,
  layoutTotals,
  moveSlot,
  renumber,
  suggestName,
  validateLayout,
  restoreLayoutVersion,
  type Asset,
  type Slot,
} from "@/lib/course-builder/layouts";
import { buildLayoutMeasurements, layoutSlotMeasurement, layoutMeasuredTotals, type LayoutMeasurements } from "@/lib/course-builder/layout-measurements";

type LayoutRow = {
  id: string;
  name: string;
  status: string;
  is_default: boolean;
  current_version: number;
  numbering_mode: string;
  copied_from_layout_id: string | null;
  created_by: string | null;
  course_id: string;
  description: string | null;
  public_notes: string | null;
  season_notes: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  seasonal: "Seasonal",
  retired: "Retired",
  archived: "Archived",
};

function useStudioData(courseId: string) {
  return useQuery({
    queryKey: ["layout-studio", courseId],
    queryFn: async () => {
      const [course, layouts, holes, tees, baskets] = await Promise.all([
        supabase.from("courses").select("id, name").eq("id", courseId).maybeSingle(),
        supabase
          .from("course_layouts")
          .select("id, course_id, name, status, is_default, current_version, numbering_mode, copied_from_layout_id, created_by, description, public_notes, season_notes")
          .eq("course_id", courseId)
          .order("is_default", { ascending: false })
          .order("name"),
        supabase.from("course_holes").select("id, label").eq("course_id", courseId),
        supabase.from("course_tees").select("id, course_hole_id, name, latitude, longitude").eq("course_id", courseId),
        supabase.from("course_baskets").select("id, course_hole_id, name, latitude, longitude").eq("course_id", courseId),
      ]);
      for (const result of [course, layouts, holes, tees, baskets]) if (result.error) throw result.error;
      const ls = (layouts.data ?? []) as LayoutRow[];
      const slots = ls.length
        ? await supabase
            .from("layout_slots")
            .select("id, layout_id, position, display_label, course_hole_id, tee_id, basket_id, par, included, flight_path, rules, legacy_hole_id")
            .in(
              "layout_id",
              ls.map((l) => l.id),
            )
            .order("position")
        : { data: [], error: null };
      if (slots.error) throw slots.error;
      const byLayout = new Map<string, Slot[]>();
      for (const s of (slots.data ?? []) as (Slot & { layout_id: string })[]) {
        const arr = byLayout.get(s.layout_id) ?? [];
        arr.push(s);
        byLayout.set(s.layout_id, arr);
      }
      const allSlots = [...byLayout.values()].flat();
      const holeIds = [...new Set(allSlots.flatMap(slot => slot.legacy_hole_id ? [slot.legacy_hole_id] : []))];
      const [routeHoles, routeTees, routeBaskets] = holeIds.length ? await Promise.all([
        supabase.from("holes").select("id, par, tee_lat, tee_lng, basket_lat, basket_lng, tee_name, basket_name, tee_color, flight_path, distance_ft").in("id",holeIds),
        supabase.from("hole_tees").select("id, hole_id, name, color, latitude, longitude, flight_path").in("hole_id",holeIds),
        supabase.from("hole_baskets").select("id, hole_id, name, color, latitude, longitude, split_point").in("hole_id",holeIds),
      ]) : [{data:[],error:null},{data:[],error:null},{data:[],error:null}];
      for (const result of [routeHoles,routeTees,routeBaskets]) if(result.error) throw result.error;
      const measurements = buildLayoutMeasurements(allSlots,
        new Map((tees.data ?? []).map(asset => [asset.id,asset])), new Map((baskets.data ?? []).map(asset => [asset.id,asset])),
        routeHoles.data ?? [], routeTees.data ?? [], routeBaskets.data ?? []);
      return {
        courseName: course.data?.name ?? "Course",
        layouts: ls,
        slots: byLayout,
        holes: new Map((holes.data ?? []).map((h) => [h.id, h.label as string])),
        tees: (tees.data ?? []) as Asset[],
        baskets: (baskets.data ?? []) as Asset[],
        measurements,
      };
    },
  });
}

function fmtFt(n: number | null) {
  return n == null ? "—" : `${n.toLocaleString()} ft`;
}

function summarizeAssets(slots: Slot[], assets: Map<string, Asset>, key: "tee_id" | "basket_id", noun: string) {
  const names = new Set(slots.filter((s) => s.included && s[key]).map((s) => assets.get(s[key]!)?.name ?? "?"));
  if (!names.size) return null;
  return names.size === 1 ? `${[...names][0]} ${noun}` : `Mixed ${[...names].join("/")} ${noun}`;
}

export default function LayoutStudioPage({ courseId, embedded = false, onEditMap, onEditorState, onLayoutSaved }: {
  courseId: string; embedded?: boolean;
  onEditMap?: (id: string) => void;
  onEditorState?: (state: {dirty: boolean; busy: boolean}) => void;
  onLayoutSaved?: (id: string) => void;
}) {
  const { user } = useSession();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useStudioData(courseId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<LayoutRow | null>(null);
  const [compare, setCompare] = useState<[string, string] | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const canSteward = useQuery({
    queryKey: ["can-steward", courseId, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("can_steward_course", { _course: courseId, _user: user!.id });
      return !!data;
    },
  });

  const teeMap = useMemo(() => new Map((data?.tees ?? []).map((t) => [t.id, t])), [data?.tees]);
  const basketMap = useMemo(() => new Map((data?.baskets ?? []).map((b) => [b.id, b])), [data?.baskets]);

  if (error) return <div role="alert" className="p-4">Layouts could not be loaded. Your map is unchanged.<Button onClick={() => void refetch()}>Retry layouts</Button></div>;
  if (isLoading || !data) return <div className="p-6 text-muted-foreground">Loading layouts…</div>;

  const open = openId ? data.layouts.find((l) => l.id === openId) : null;

  return (
    <div className={embedded ? "space-y-4" : "mx-auto max-w-[1320px] space-y-6 px-5 py-6"}>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {!embedded && <Link to="/courses/$courseId" params={{ courseId }} className="text-sm text-muted-foreground hover:text-foreground">
            ← {data.courseName}
          </Link>}
          <h1 className="mt-1 text-2xl font-semibold">Layouts</h1>
          <p className="text-sm text-muted-foreground">
            Every layout points at the same tees and baskets — copy one to make a new layout in seconds.
          </p>
        </div>
        {user && !open ? (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New layout
          </Button>
        ) : null}
        {!open && data.layouts.length >= 2 ? (
          <Button variant="outline" onClick={() => setCompare([data.layouts[0].id, data.layouts[1].id])}>
            <GitCompare className="mr-1.5 h-4 w-4" /> Compare layouts
          </Button>
        ) : null}
      </header>

      {open ? (
        <LayoutEditor
          key={open.id}
          layout={open}
          initial={data.slots.get(open.id) ?? []}
          holes={data.holes}
          tees={data.tees}
          baskets={data.baskets}
          teeMap={teeMap}
          basketMap={basketMap}
          measurements={data.measurements}
          otherSlots={[...data.slots.entries()].filter(([id]) => id !== open.id).flatMap(([, v]) => v)}
          canPublish={!!canSteward.data}
          canEdit={!!canSteward.data || (open.status === "draft" && open.created_by === user?.id)}
          onClose={() => setOpenId(null)}
          onEditorState={onEditorState}
          onEditMap={onEditMap ? () => onEditMap(open.id) : undefined}
          onSaved={() => {void qc.invalidateQueries({queryKey: ["layout-studio", courseId]}); onLayoutSaved?.(open.id);}}
        />
      ) : (
        <section className={embedded ? "grid gap-3" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
          {data.layouts.map((l) => {
            const slots = data.slots.get(l.id) ?? [];
            const t = {...layoutTotals(slots, teeMap, basketMap), ...layoutMeasuredTotals(slots,teeMap,basketMap,data.measurements)};
            const teeSum = summarizeAssets(slots, teeMap, "tee_id", "tees");
            const basketSum = summarizeAssets(slots, basketMap, "basket_id", "baskets");
            return (
              <article key={l.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{l.name}</h2>
                  <Badge variant={l.status === "draft" ? "outline" : "secondary"}>{STATUS_LABEL[l.status] ?? l.status}</Badge>
                </div>
                <div className="text-sm">
                  {t.holes} holes · Par {t.par ?? "—"} · {fmtFt(t.distanceFt)}
                  {t.directHoles > 0 ? <span className="text-muted-foreground"> · {t.directHoles} direct {t.directHoles === 1 ? "distance" : "distances"}</span> : null}
                  {t.distanceFt != null && t.measuredHoles < t.holes ? (
                    <span className="text-muted-foreground"> ({t.measuredHoles} mapped)</span>
                  ) : null}
                </div>
                <div className="text-sm text-muted-foreground">
                  {[teeSum, basketSum, l.is_default ? "Default layout" : null, `v${l.current_version}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {(() => {
                  const r = layoutReadiness(slots, teeMap, basketMap);
                  const pill = (label: string, x: { ready: boolean; missing: number }) => (
                    <span
                      className={
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium " +
                        (x.ready ? "border-primary/40 text-foreground" : "border-border text-muted-foreground")
                      }
                    >
                      {x.ready ? <Check className="h-3 w-3 text-primary" /> : null}
                      {x.ready ? `${label} ready` : `${label}: ${x.missing} hole${x.missing === 1 ? "" : "s"} to finish`}
                    </span>
                  );
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      {pill("Scoring", r.scoring)}
                      {pill("Map", r.map)}
                    </div>
                  );
                })()}
                {!embedded && <LayoutUses courseId={courseId} layoutId={l.id} />}
                <div className="mt-auto flex flex-wrap gap-2">
                  {onEditMap && <Button size="sm" variant="outline" onClick={() => onEditMap(l.id)}>Map this layout</Button>}
                  <Button size="sm" onClick={() => setOpenId(l.id)}>
                    {canSteward.data || (l.status === "draft" && l.created_by === user?.id) ? (<><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit layout</>) : "View layout"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setCopyFrom(l)} disabled={!slots.length}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
              </article>
            );
          })}
          {data.layouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This course has no layouts yet. Map the holes in the course builder first.
            </p>
          ) : null}
        </section>
      )}

      {copyFrom ? (
        <CopyWizard
          source={copyFrom}
          sourceSlots={data.slots.get(copyFrom.id) ?? []}
          tees={data.tees}
          baskets={data.baskets}
          teeMap={teeMap}
          basketMap={basketMap}
          onClose={() => setCopyFrom(null)}
          onCreated={async (id) => {
            setCopyFrom(null);
            await qc.invalidateQueries({ queryKey: ["layout-studio", courseId] });
            setOpenId(id);
          }}
        />
      ) : null}

      {newOpen ? (
        <NewLayoutDialog
          courseId={courseId}
          userId={user?.id ?? ""}
          layouts={data.layouts.filter((l) => (data.slots.get(l.id) ?? []).length > 0)}
          holes={data.holes}
          tees={data.tees}
          baskets={data.baskets}
          allSlots={[...data.slots.values()].flat()}
          onCopy={(l) => { setNewOpen(false); setCopyFrom(l); }}
          onClose={() => setNewOpen(false)}
          onCreated={async (id) => {
            setNewOpen(false);
            await qc.invalidateQueries({ queryKey: ["layout-studio", courseId] });
            setOpenId(id);
          }}
        />
      ) : null}

      {compare ? (
        <CompareDialog
          layouts={data.layouts}
          slots={data.slots}
          pair={compare}
          onPair={setCompare}
          teeMap={teeMap}
          basketMap={basketMap}
          onClose={() => setCompare(null)}
        />
      ) : null}
    </div>
  );
}

function LayoutEditor(props: {
  layout: LayoutRow;
  initial: Slot[];
  holes: Map<string, string>;
  tees: Asset[];
  baskets: Asset[];
  teeMap: Map<string, Asset>;
  basketMap: Map<string, Asset>;
  measurements: LayoutMeasurements;
  otherSlots: Slot[];
  canPublish: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  onEditMap?: () => void;
  onEditorState?: (state: {dirty: boolean; busy: boolean}) => void;
}) {
  const { layout, teeMap, basketMap } = props;
  const [slots, setSlots] = useState<Slot[]>(props.initial);
  const [mode, setMode] = useState<"route" | "course">(layout.numbering_mode === "course" ? "course" : "route");
  const [dirty, setDirty] = useState(false);
  const [detailsState, setDetailsState] = useState({dirty: false, busy: false});
  const [showHistory, setShowHistory] = useState(false);
  const totals = {...layoutTotals(slots, teeMap, basketMap), ...layoutMeasuredTotals(slots,teeMap,basketMap,props.measurements)};
  const issues = validateLayout(slots, teeMap, basketMap);
  const teeNames = [...new Set(props.tees.map((t) => t.name))].sort();
  const basketNames = [...new Set(props.baskets.map((b) => b.name))].sort();
  const usedHoles = new Set(slots.map((s) => s.course_hole_id));
  // Physical holes that actually have a tee or basket, in course order (1, 2, … then X, Y, Z).
  const holeOrder = [...props.holes.entries()]
    .filter(([id]) => props.tees.some((t) => t.course_hole_id === id) || props.baskets.some((b) => b.course_hole_id === id))
    .sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
  const holeLabel = (id: string) => props.holes.get(id) ?? "?";
  // Default for a hole: the tee + basket most other layouts use there, else the hole's only tee/basket.
  const defaultsFor = (holeId: string): { tee_id: string | null; basket_id: string | null } => {
    const counts = new Map<string, number>();
    for (const o of props.otherSlots)
      if (o.course_hole_id === holeId && o.tee_id && o.basket_id) {
        const k = `${o.tee_id}|${o.basket_id}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
      const [tee_id, basket_id] = ranked[0][0].split("|");
      return { tee_id, basket_id };
    }
    const ht = props.tees.filter((t) => t.course_hole_id === holeId);
    const hb = props.baskets.filter((b) => b.course_hole_id === holeId);
    return { tee_id: ht.length === 1 ? ht[0].id : null, basket_id: hb.length === 1 ? hb[0].id : null };
  };
  const addHole = () => {
    const next = holeOrder.find(([id]) => !usedHoles.has(id)) ?? holeOrder[0];
    if (!next) return toast.error("Map a tee and basket in Course Studio first.");
    const n = slots.length + 1;
    update([...slots, { position: n, display_label: String(n), course_hole_id: next[0], ...defaultsFor(next[0]), par: null, included: true }]);
  };
  const included = slots.filter((s) => s.included);
  const complete = included.filter((s) => s.tee_id && s.basket_id && s.par != null).length;

  const update = (next: Slot[]) => {
    if (busy || !props.canEdit) return;
    setSlots(next);
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = renumber(slots, mode);
      const structuralErrors = validateLayout(payload, teeMap, basketMap).filter(issue => issue.level === "error" && !issue.message.includes("has no"));
      if (structuralErrors.length) throw new Error(structuralErrors[0].message);
      const { error } = await supabase.rpc("save_layout_slots", {
        _layout: layout.id,
        _slots: payload as never,
        _numbering: mode,
      });
      if (error) throw error;
      setSlots(payload);
    },
    onSuccess: () => {
      setDirty(false);
      toast.success("Layout saved.");
      props.onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save this layout. Check your connection and try again."),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const problems = validateLayout(slots, teeMap, basketMap).filter(issue => issue.level === "error");
      if (problems.length) throw new Error(problems[0].message);
      if (dirty) await save.mutateAsync();
      const { data, error } = await supabase.rpc("publish_layout", { _layout: layout.id, _summary: undefined });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (v) => {
      toast.success(`Published as version ${v}.`);
      props.onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't publish this layout. Check the issues and your steward access."),
  });

  const versions = useQuery({
    queryKey: ["layout-versions", layout.id],
    enabled: showHistory,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("layout_versions")
        .select("version, summary, published_at, snapshot")
        .eq("layout_id", layout.id)
        .order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const bulk = (kind: "tee" | "basket", name: string) => {
    const r = bulkSwap(slots, kind, name, kind === "tee" ? props.tees : props.baskets);
    update(r.slots);
    toast(
      r.exceptions.length
        ? `${r.changed} holes switched to ${name}. ${r.exceptions.length} need review: ${r.exceptions.join(", ")}.`
        : `${r.changed} holes switched to ${name}. Review their pars before publishing.`,
    );
  };

  const errors = issues.filter((i) => i.level === "error");
  const busy = save.isPending || publish.isPending || detailsState.busy;
  const hasChanges = dirty || detailsState.dirty;
  useEffect(() => { props.onEditorState?.({dirty: hasChanges, busy}); }, [hasChanges, busy, props.onEditorState]);
  useEffect(() => () => props.onEditorState?.({dirty: false, busy: false}), [props.onEditorState]);
  const leave = (action: () => void) => {
    if (busy) return;
    if (!hasChanges || window.confirm("Discard unsaved layout changes?")) action();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => leave(props.onClose)}>
          ← All layouts
        </Button>
        {props.onEditMap && <Button size="sm" variant="outline" disabled={busy} onClick={() => leave(props.onEditMap!)}>Map this layout</Button>}
        <h2 className="text-xl font-semibold">{layout.name}</h2>
        <Badge variant="outline">{STATUS_LABEL[layout.status] ?? layout.status}</Badge>
        <span className="text-sm text-muted-foreground">
          {totals.holes} holes · Par {totals.par ?? "—"} · {fmtFt(totals.distanceFt)}
          {totals.directHoles > 0 ? ` · ${totals.directHoles} direct distances` : ""}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
            <History className="mr-1.5 h-4 w-4" /> History
          </Button>
          {props.canEdit ? (
            <Button size="sm" variant="outline" disabled={!dirty || busy} onClick={() => save.mutate()}>
              <Save className="mr-1.5 h-4 w-4" /> Save
            </Button>
          ) : null}
          {props.canPublish ? (
            <Button size="sm" disabled={errors.length > 0 || busy || detailsState.dirty} onClick={() => publish.mutate()}>
              <Send className="mr-1.5 h-4 w-4" /> Publish
            </Button>
          ) : null}
        </div>
      </div>

      <LayoutDetails layout={layout} canEdit={props.canEdit && !save.isPending && !publish.isPending} canSetDefault={props.canPublish && !save.isPending && !publish.isPending} onSaved={props.onSaved} onEditorState={setDetailsState} />

      {showHistory ? (
        <div className="rounded-xl border border-border bg-card p-3 text-sm">
          {versions.isLoading && <p className="text-muted-foreground">Loading published versions…</p>}
          {versions.error && <div role="alert">Published versions could not be loaded.<Button size="sm" variant="outline" onClick={()=>void versions.refetch()}>Retry history</Button></div>}
          {(versions.data ?? []).map((v) => (
            <div key={v.version} className="flex gap-3 py-1">
              <span className="font-medium">v{v.version}</span>
              <span className="text-muted-foreground">{new Date(v.published_at).toLocaleDateString()}</span>
              <span>{v.summary ?? "Published"}</span>
              {props.canEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7"
                  disabled={busy}
                  onClick={() => {
                    try {
                      update(restoreLayoutVersion(slots,v.snapshot));
                      toast.success(`Version ${v.version} loaded. Save, then publish to make it current.`);
                    } catch(error) { toast.error(error instanceof Error ? error.message : "This version could not be restored."); }
                  }}
                >
                  Restore
                </Button>
              ) : null}
            </div>
          ))}
          {versions.data && !versions.data.length ? <p className="text-muted-foreground">Not published yet.</p> : null}
        </div>
      ) : null}

      {props.canEdit ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
          <span className="font-medium">All holes:</span>
          {teeNames.map((n) => (
            <Button key={`t-${n}`} size="sm" variant="outline" disabled={busy} onClick={() => bulk("tee", n)}>
              {n} tees
            </Button>
          ))}
          {basketNames.length > 1
            ? basketNames.map((n) => (
                <Button key={`b-${n}`} size="sm" variant="outline" disabled={busy} onClick={() => bulk("basket", n)}>
                  Basket {n}
                </Button>
              ))
            : null}
          <span className="mx-1 h-5 w-px bg-border" />
          <span className="font-medium">Numbering:</span>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(["route", "course"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                className={`rounded-md px-2 py-1 ${mode === m ? "bg-primary text-primary-foreground" : ""}`}
                onClick={() => {
                  setMode(m);
                  setDirty(true);
                }}
              >
                {m === "route" ? "1, 2, 3…" : "Course labels"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={complete === included.length && included.length ? "font-medium text-primary" : "font-medium"}>
          {complete} of {included.length} holes complete
        </span>
        {issues.map((i, k) => (
          <span key={k} className="inline-flex items-center gap-1 text-warning"><TriangleAlert className="h-4 w-4" /> {i.message}</span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Par</th>
              <th className="px-3 py-2">Tee</th>
              <th className="px-3 py-2">Basket</th>
              <th className="px-3 py-2">Distance</th>
              <th className="px-3 py-2">In layout</th>
              <th className="px-3 py-2 sr-only">Order</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s, i) => {
              const holeTees = props.tees.filter((t) => t.course_hole_id === s.course_hole_id);
              const holeBaskets = props.baskets.filter((b) => b.course_hole_id === s.course_hole_id);
              const set = (patch: Partial<Slot>) => update(slots.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <tr key={s.id ?? `${s.course_hole_id}-${i}`} className={`border-t border-border ${s.included ? "" : "opacity-50"}`}>
                  <td className="px-3 py-1.5 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <Input
                      value={s.display_label}
                      disabled={!props.canEdit || busy}
                      aria-label={`Label for position ${i + 1}`}
                      className="h-8 w-20"
                      onChange={(e) => set({ display_label: e.target.value.slice(0, 6) })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      min={2}
                      max={7}
                      value={s.par ?? ""}
                      disabled={!props.canEdit || busy}
                      aria-label={`Par for hole ${s.display_label}`}
                      className="h-8 w-16"
                      onChange={(e) => set({ par: e.target.value ? Number(e.target.value) : null })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2"
                      value={s.tee_id ?? ""}
                      disabled={!props.canEdit || busy}
                      aria-label={`Tee for hole ${s.display_label}`}
                      onChange={(e) => {
                        const t = props.tees.find((x) => x.id === e.target.value);
                        const nextId=e.target.value || null;
                        if(nextId!==s.tee_id) set({ tee_id: nextId, par:null, flight_path:null,
                          ...(t ? { course_hole_id: t.course_hole_id, ...(t.course_hole_id!==s.course_hole_id ? {basket_id:null} : {}) } : {}) });
                      }}
                    >
                      <option value="">Choose tee</option>
                      {[s.course_hole_id, ...holeOrder.map(([id]) => id).filter((id) => id !== s.course_hole_id)].map((hid) => {
                        const opts = props.tees.filter((t) => t.course_hole_id === hid);
                        return opts.length ? (
                          <optgroup key={hid} label={`Hole ${holeLabel(hid)}`}>
                            {opts.map((t) => <option key={t.id} value={t.id}>Hole {holeLabel(hid)} · {t.name} tee</option>)}
                          </optgroup>
                        ) : null;
                      })}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2"
                      value={s.basket_id ?? ""}
                      disabled={!props.canEdit || busy}
                      aria-label={`Basket for hole ${s.display_label}`}
                      onChange={(e) => {const nextId=e.target.value || null; if(nextId!==s.basket_id) set({ basket_id: nextId, par:null, flight_path:null });}}
                    >
                      <option value="">Choose basket</option>
                      {[s.course_hole_id, ...holeOrder.map(([id]) => id).filter((id) => id !== s.course_hole_id)].map((hid) => {
                        const opts = props.baskets.filter((b) => b.course_hole_id === hid);
                        return opts.length ? (
                          <optgroup key={hid} label={`Hole ${holeLabel(hid)}`}>
                            {opts.map((b) => <option key={b.id} value={b.id}>Hole {holeLabel(hid)} · Basket {b.name}</option>)}
                          </optgroup>
                        ) : null;
                      })}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {(() => {const measurement=layoutSlotMeasurement(s,teeMap,basketMap,props.measurements); return <>
                      {fmtFt(measurement.distance)}{measurement.distance != null && <span className="block text-[11px] text-muted-foreground">{measurement.source === "direct" ? "Direct tee to basket" : measurement.source === "measured" ? "Measured distance" : "Mapped fairway"}</span>}
                      {measurement.issue && <p className="max-w-48 text-xs text-warning">{measurement.issue}</p>}
                    </>;})()}
                    {s.included && (!s.tee_id || !s.basket_id || s.par == null) ? (
                      <div className="flex items-center gap-1 text-xs text-warning">
                        <TriangleAlert className="h-3.5 w-3.5" />
                        {!s.tee_id ? "Choose a tee" : !s.basket_id ? "Choose a basket" : "Set par"}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={s.included}
                      disabled={!props.canEdit || busy}
                      aria-label={`Include hole ${s.display_label}`}
                      onChange={(e) => set({ included: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    {props.canEdit ? (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up" disabled={busy || i === 0} onClick={() => update(moveSlot(slots, i, i - 1))}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down" disabled={busy || i === slots.length - 1} onClick={() => update(moveSlot(slots, i, i + 1))}>
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {props.canEdit ? (
        <Button variant="outline" disabled={busy} onClick={addHole}>
          <Plus className="mr-1.5 h-4 w-4" /> Add hole
        </Button>
      ) : null}
    </section>
  );
}

function CopyWizard(props: {
  source: LayoutRow;
  sourceSlots: Slot[];
  tees: Asset[];
  baskets: Asset[];
  teeMap: Map<string, Asset>;
  basketMap: Map<string, Asset>;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [tee, setTee] = useState("");
  const [basket, setBasket] = useState("");
  const [holes, setHoles] = useState<"same" | "front" | "back">("same");
  const [name, setName] = useState(`${props.source.name} copy`);
  const [nameTouched, setNameTouched] = useState(false);
  const teeNames = [...new Set(props.tees.map((t) => t.name))].sort();
  const basketNames = [...new Set(props.baskets.map((b) => b.name))].sort();

  const preview = useMemo(() => {
    let s = props.sourceSlots;
    let teeEx: string[] = [];
    let basketEx: string[] = [];
    let teesChanged = 0;
    let basketsChanged = 0;
    if (tee) {
      const r = bulkSwap(s, "tee", tee, props.tees);
      s = r.slots;
      teeEx = r.exceptions;
      teesChanged = r.changed;
    }
    if (basket) {
      const r = bulkSwap(s, "basket", basket, props.baskets);
      s = r.slots;
      basketEx = r.exceptions;
      basketsChanged = r.changed;
    }
    if (holes === "front") s = keepRange(s, 1, 9);
    if (holes === "back") s = keepRange(s, 10, 18);
    return { slots: s, teeEx, basketEx, teesChanged, basketsChanged };
  }, [tee, basket, holes, props.sourceSlots, props.tees, props.baskets]);

  const before = layoutTotals(props.sourceSlots, props.teeMap, props.basketMap);
  const after = layoutTotals(preview.slots, props.teeMap, props.basketMap);
  const suggested = suggestName(props.source.name, { tee: tee || undefined, holes: holes === "same" ? null : holes });
  const finalName = nameTouched ? name : suggested;

  const create = useMutation({
    mutationFn: async () => {
      const { data: id, error } = await supabase.rpc("copy_layout", { _source: props.source.id, _name: finalName });
      if (error) throw error;
      const { data: fresh } = await supabase
        .from("layout_slots")
        .select("id, position")
        .eq("layout_id", id as string)
        .order("position");
      const payload = preview.slots.map((s, i) => ({ ...s, id: fresh?.[i]?.id }));
      const { error: e2 } = await supabase.rpc("save_layout_slots", {
        _layout: id as string,
        _slots: renumber(payload, "route") as never,
        _numbering: null as never,
      });
      if (e2) throw e2;
      return id as string;
    },
    onSuccess: (id) => {
      toast.success(`${finalName} created as a draft.`);
      props.onCreated(id);
    },
    onError: () => toast.error("Couldn't copy this layout. Try again in a moment."),
  });

  const pickRow = (label: string, value: string, options: string[], onChange: (v: string) => void, extra?: [string, string][]) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 text-sm font-medium">{label}</span>
      {[["", "Same"] as [string, string], ...(extra ?? []), ...options.map((o) => [o, o] as [string, string])].map(([v, l]) => (
        <button
          key={v || "same"}
          type="button"
          className={`rounded-lg border px-2.5 py-1 text-sm ${value === v ? "border-primary bg-primary/10" : "border-border"}`}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy {props.source.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {pickRow("Tees", tee, teeNames, setTee)}
          {basketNames.length > 1 ? pickRow("Baskets", basket, basketNames, setBasket) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-sm font-medium">Holes</span>
            {(
              [
                ["same", "Same"],
                ["front", "Front 9"],
                ["back", "Back 9"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                disabled={v !== "same" && props.sourceSlots.length < 18}
                className={`rounded-lg border px-2.5 py-1 text-sm disabled:opacity-40 ${holes === v ? "border-primary bg-primary/10" : "border-border"}`}
                onClick={() => setHoles(v)}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">New layout name</span>
            <Input
              value={finalName}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
            />
          </label>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div>
              {after.holes} holes · {preview.teesChanged} tees changed · {preview.basketsChanged} baskets changed
            </div>
            <div>
              Par {before.par ?? "—"} → {after.par ?? "—"} · Distance {fmtFt(before.distanceFt)} → {fmtFt(after.distanceFt)}
            </div>
            {preview.teeEx.length ? (
              <div className="mt-1 text-warning">
                No {tee} tee on {preview.teeEx.length} holes ({preview.teeEx.join(", ")}) — kept as is.
              </div>
            ) : null}
            {preview.basketEx.length ? (
              <div className="mt-1 text-warning">
                No basket {basket} on {preview.basketEx.length} holes — kept as is.
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={!finalName.trim() || create.isPending} onClick={() => create.mutate()}>
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompareDialog(props: {
  layouts: LayoutRow[];
  slots: Map<string, Slot[]>;
  pair: [string, string];
  onPair: (p: [string, string]) => void;
  teeMap: Map<string, Asset>;
  basketMap: Map<string, Asset>;
  onClose: () => void;
}) {
  const [a, b] = props.pair;
  const nameOf = (m: Map<string, Asset>) => (id: string | null) => (id ? (m.get(id)?.name ?? "?") : "None");
  const r = compareLayouts(props.slots.get(a) ?? [], props.slots.get(b) ?? [], {
    tee: nameOf(props.teeMap),
    basket: nameOf(props.basketMap),
  });
  const sel = (v: string, on: (v: string) => void) => (
    <select className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm" value={v} onChange={(e) => on(e.target.value)}>
      {props.layouts.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Compare layouts</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          {sel(a, (v) => props.onPair([v, b]))}
          <span className="text-sm text-muted-foreground">vs</span>
          {sel(b, (v) => props.onPair([a, v]))}
        </div>
        <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
          {r.diffs.map((d, i) => (
            <li key={i}>
              <span className="font-medium">Hole {d.label}:</span> {d.changes.join(" · ")}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          {r.diffs.length ? `${r.same} holes are the same.` : "These layouts are identical."}
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** Where a layout is used: upcoming events, plus its caddy book and tee signs. */
function LayoutUses({ courseId, layoutId }: { courseId: string; layoutId: string }) {
  const events = useQuery({
    queryKey: ["layout-uses", layoutId],
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [t, n] = await Promise.all([
        supabase.from("tournaments").select("id", { count: "exact", head: true }).eq("layout_id", layoutId).gte("start_date", today),
        supabase.from("league_events").select("id", { count: "exact", head: true }).eq("layout_id", layoutId).gte("event_date", today),
      ]);
      return (t.count ?? 0) + (n.count ?? 0);
    },
  });
  const count = events.data ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" />
        {events.isLoading ? "Checking events…" : count ? `${count} upcoming event${count === 1 ? "" : "s"}` : "No upcoming events"}
      </span>
      <Link to="/courses/$courseId" params={{ courseId }} search={{ tab: "caddy", layout: layoutId }} className="inline-flex items-center gap-1 text-primary hover:underline">
        <BookOpen className="h-3.5 w-3.5" /> Caddy book
      </Link>
      <Link to="/courses/$courseId/tee-signs" params={{ courseId }} search={{ layout: layoutId }} className="inline-flex items-center gap-1 text-primary hover:underline">
        <Signpost className="h-3.5 w-3.5" /> Tee signs
      </Link>
    </div>
  );
}

/** Physical holes with at least one tee or basket, in course order (1, 2, … then X, Y, Z). */
function physicalHoleOrder(holes: Map<string, string>, tees: Asset[], baskets: Asset[]) {
  return [...holes.entries()]
    .filter(([id]) => tees.some((t) => t.course_hole_id === id) || baskets.some((b) => b.course_hole_id === id))
    .sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
}

/** The tee + basket most layouts use on a hole; else the hole's only tee/basket; else none (user picks). */
function defaultAssets(holeId: string, allSlots: Slot[], tees: Asset[], baskets: Asset[]) {
  const counts = new Map<string, number>();
  for (const o of allSlots)
    if (o.course_hole_id === holeId && o.tee_id && o.basket_id) {
      const k = `${o.tee_id}|${o.basket_id}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
    const [tee_id, basket_id] = ranked[0][0].split("|");
    return { tee_id, basket_id };
  }
  const ht = tees.filter((t) => t.course_hole_id === holeId);
  const hb = baskets.filter((b) => b.course_hole_id === holeId);
  return { tee_id: ht.length === 1 ? ht[0].id : null, basket_id: hb.length === 1 ? hb[0].id : null };
}

function NewLayoutDialog(props: {
  courseId: string;
  userId: string;
  layouts: LayoutRow[];
  holes: Map<string, string>;
  tees: Asset[];
  baskets: Asset[];
  allSlots: Slot[];
  onCopy: (l: LayoutRow) => void;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const order = physicalHoleOrder(props.holes, props.tees, props.baskets);
  const [mode, setMode] = useState<"copy" | "all" | "count">(props.layouts.length ? "copy" : "all");
  const [name, setName] = useState("");
  const [count, setCount] = useState(Math.min(18, order.length || 18));
  const [source, setSource] = useState(props.layouts[0]?.id ?? "");
  const create = useMutation({
    mutationFn: async () => {
      const n = mode === "all" ? order.length : Math.max(1, Math.min(54, count));
      const { data: row, error } = await supabase
        .from("course_layouts")
        .insert({ course_id: props.courseId, name: name.trim(), status: "draft", created_by: props.userId, is_default: false } as never)
        .select("id")
        .single();
      if (error || !row) throw error ?? new Error("create failed");
      // Hole k uses the k-th physical hole (wrapping for longer routes) with the course's usual tee and basket.
      const slots = Array.from({ length: n }, (_, k) => {
        const [hid] = order[k % Math.max(1, order.length)] ?? [];
        return {
          position: k + 1,
          display_label: mode === "all" ? (order[k]?.[1] ?? String(k + 1)) : String(k + 1),
          course_hole_id: hid,
          ...defaultAssets(hid, props.allSlots, props.tees, props.baskets),
          par: null,
          included: true,
        };
      });
      const { error: e2 } = await supabase.rpc("save_layout_slots", {
        _layout: (row as { id: string }).id,
        _slots: slots as never,
        _numbering: mode === "all" ? "course" : "route",
      });
      if (e2) throw e2;
      return (row as { id: string }).id;
    },
    onSuccess: (id) => {
      toast.success("Layout created as a draft. Check each hole, then publish.");
      props.onCreated(id);
    },
    onError: () => toast.error("Couldn't create the layout. The course may still be waiting for approval."),
  });
  const opt = (m: typeof mode, title: string, sub: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={"w-full rounded-xl border p-3 text-left " + (mode === m ? "border-primary bg-primary/10" : "border-border")}
    >
      <div className="font-medium">{title}</div>
      <div className="text-sm text-muted-foreground">{sub}</div>
    </button>
  );
  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New layout</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {mode !== "copy" ? (
            <label className="block text-sm">
              Layout name
              <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blue Tees" className="mt-1" />
            </label>
          ) : null}
          <div className="text-sm font-medium">Start from</div>
          {props.layouts.length ? opt("copy", "Copy an existing layout", "Same holes, tees and baskets — change only what's different.") : null}
          {mode === "copy" ? (
            <select className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm" value={source} onChange={(e) => setSource(e.target.value)}>
              {props.layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          ) : null}
          {opt("all", `All course holes (${order.length})`, "Every mapped hole in course order, using the usual tee and basket.")}
          {opt("count", "Choose how many holes", "Start with a set number of holes, then pick each tee and basket.")}
          {mode === "count" ? (
            <div className="flex flex-wrap items-center gap-2">
              {[9, 18, 21, 24, 27].map((n) => (
                <Button key={n} size="sm" variant={count === n ? "default" : "outline"} onClick={() => setCount(n)}>{n}</Button>
              ))}
              <Input type="number" min={1} max={54} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} className="h-8 w-20" aria-label="Number of holes" />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
          {mode === "copy" ? (
            <Button disabled={!source} onClick={() => { const l = props.layouts.find((x) => x.id === source); if (l) props.onCopy(l); }}>Next</Button>
          ) : (
            <Button disabled={!name.trim() || !order.length || create.isPending} onClick={() => create.mutate()}>Create layout</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Name, description, notes and default flag for one layout. Saves straight to the layout row (RLS decides who may). */
function LayoutDetails({ layout, canEdit, canSetDefault, onSaved, onEditorState }: { layout: LayoutRow; canEdit: boolean; canSetDefault: boolean; onSaved: () => void; onEditorState?: (state: {dirty: boolean; busy: boolean}) => void }) {
  // Private manager notes live in their own table that only course managers can read.
  const [savedNotes, setSavedNotes] = useState("");
  useEffect(() => {
    if (!canSetDefault) return;
    void supabase.from("layout_manager_notes").select("notes").eq("layout_id", layout.id).maybeSingle().then(({ data }) => {
      const n = data?.notes ?? "";
      setSavedNotes(n);
      setF((x) => ({ ...x, manager_notes: n }));
    });
  }, [layout.id, canSetDefault]);
  const [f, setF] = useState({
    name: layout.name,
    description: layout.description ?? "",
    public_notes: layout.public_notes ?? "",
    season_notes: layout.season_notes ?? "",
    manager_notes: "",
  });
  const changed =
    f.name !== layout.name ||
    f.description !== (layout.description ?? "") ||
    f.public_notes !== (layout.public_notes ?? "") ||
    f.season_notes !== (layout.season_notes ?? "") ||
    f.manager_notes !== savedNotes;
  const save = useMutation({
    mutationFn: async () => {
      const name = f.name.trim();
      if (!name) throw new Error("Give the layout a name.");
      if (name.length > 80) throw new Error("Keep the name under 80 characters.");
      const clip = (v: string) => (v.trim() ? v.trim().slice(0, 2000) : null);
      const { error } = await supabase
        .from("course_layouts")
        .update({ name, description: clip(f.description), public_notes: clip(f.public_notes), season_notes: clip(f.season_notes) })
        .eq("id", layout.id);
      if (error) throw new Error("Couldn't save the layout details. Try again.");
      if (canSetDefault && f.manager_notes !== savedNotes) {
        const n = await supabase.from("layout_manager_notes").upsert({ layout_id: layout.id, course_id: layout.course_id, notes: clip(f.manager_notes) });
        if (n.error) throw new Error("Couldn't save the private notes. Try again.");
        setSavedNotes(f.manager_notes);
      }
    },
    onSuccess: () => { toast.success("Layout details saved"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const makeDefault = useMutation({
    mutationFn: async () => {
      const a = await supabase.from("course_layouts").update({ is_default: false }).eq("course_id", layout.course_id).neq("id", layout.id);
      if (a.error) throw a.error;
      const b = await supabase.from("course_layouts").update({ is_default: true }).eq("id", layout.id);
      if (b.error) throw b.error;
    },
    onSuccess: () => { toast.success(`${layout.name} is now the default layout`); onSaved(); },
    onError: () => toast.error("Couldn't change the default layout. Try again."),
  });
  useEffect(() => {onEditorState?.({dirty: changed, busy: save.isPending || makeDefault.isPending});}, [changed, save.isPending, makeDefault.isPending, onEditorState]);
  const field = (k: keyof typeof f, label: string, hint: string, rows = 2) => (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        value={f[k]}
        rows={rows}
        disabled={!canEdit}
        placeholder={hint}
        onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-70"
      />
    </label>
  );
  if (!canEdit && !layout.description && !layout.public_notes && !layout.season_notes) return null;
  return (
    <details open={canEdit} className="rounded-xl border border-border bg-card p-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer text-base font-semibold">Layout details</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Layout name</span>
          <Input value={f.name} disabled={!canEdit} maxLength={80} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />
        </label>
        <div className="flex items-end gap-2">
          {layout.is_default ? (
            <Badge variant="outline">Default layout</Badge>
          ) : canSetDefault ? (
            <Button size="sm" variant="outline" disabled={makeDefault.isPending} onClick={() => makeDefault.mutate()}>Make default layout</Button>
          ) : null}
        </div>
        {field("description", "Short description", "e.g. Long tees, full 27 for league nights")}
        {field("public_notes", "Notes for players", "Shown on the course page — parking, tee order, crossovers")}
        {field("season_notes", "Seasonal info", "e.g. Holes X–Z close Nov–Mar for flooding")}
        {canSetDefault ? field("manager_notes", "Private notes for course managers", "Only course managers see these") : null}
      </div>
      {canEdit ? (
        <div className="mt-3 flex justify-end">
          <Button size="sm" disabled={!changed || save.isPending} onClick={() => save.mutate()}>
            <Save className="mr-1.5 h-4 w-4" /> Save details
          </Button>
        </div>
      ) : null}
    </details>
  );
}
