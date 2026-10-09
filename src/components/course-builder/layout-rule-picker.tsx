import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RULE_FEATURE_TYPES, layoutPlaysFeature } from "@/lib/course-builder/layout-rules";

type Row = {
  id: string;
  type: string;
  label: string | null;
  layout_id: string | null;
  hole_number: number | null;
  hole_numbers: number[] | null;
  geometry: { points?: unknown } | null;
};

const TYPE_LABEL: Record<string, string> = {
  ob_line: "OB line",
  ob_area: "OB area",
  ob_reference: "OB segment",
  mando: "Mando",
  dropzone: "Drop zone",
  hazard: "Hazard",
  island_green: "Island",
};

/** Lets a layout choose which of the course's OB, mandos and drop zones it plays. Saves on every tap. */
export function LayoutRulePicker({ courseId, layoutId, layoutName }: { courseId: string; layoutId: string; layoutName?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [played, setPlayed] = useState<string[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ data: fs }, { data: lay }] = await Promise.all([
        supabase
          .from("course_features")
          .select("id, type, label, layout_id, hole_number, hole_numbers, geometry")
          .eq("course_id", courseId)
          .neq("publish_state", "draft")
          .neq("layer", "event"),
        supabase.from("course_layouts").select("played_rule_ids").eq("id", layoutId).maybeSingle(),
      ]);
      if (!alive) return;
      setRows(((fs ?? []) as unknown as Row[]).filter((f) => RULE_FEATURE_TYPES.has(f.type)));
      setPlayed((lay?.played_rule_ids as string[] | null) ?? null);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [courseId, layoutId]);

  // Identical copies (same kind, spot and holes) from other layouts show as one rule.
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const holes = r.hole_numbers ?? (r.hole_number != null ? [r.hole_number] : []);
      const k = `${r.type}|${JSON.stringify(r.geometry?.points ?? null)}|${holes.join(",")}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.values()].sort((a, b) => firstHole(a[0]) - firstHole(b[0]));
  }, [rows]);

  const isOn = (g: Row[]) => g.some((r) => layoutPlaysFeature(r, layoutId, played));

  const toggle = async (g: Row[]) => {
    const current = played ?? rows.filter((r) => layoutPlaysFeature(r, layoutId, null)).map((r) => r.id);
    const ids = new Set(current);
    const on = isOn(g);
    for (const r of g) on ? ids.delete(r.id) : ids.add(r.id);
    const next = [...ids];
    const prev = played;
    setPlayed(next);
    const { error } = await supabase.from("course_layouts").update({ played_rule_ids: next }).eq("id", layoutId);
    if (error) {
      setPlayed(prev);
      toast.error("Couldn't save that rule choice. Try again.");
    }
  };

  if (!loaded) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div>
        <div className="text-sm font-semibold">Rules played on {layoutName || "this layout"}</div>
        <p className="text-xs text-muted-foreground">Tick the OB, mandos and drop zones this layout plays. The course page shows only these.</p>
      </div>
      {groups.length ? (
        <ul className="max-h-[320px] space-y-1 overflow-y-auto">
          {groups.map((g) => {
            const r = g[0];
            const on = isOn(g);
            const holes = r.hole_numbers ?? (r.hole_number != null ? [r.hole_number] : null);
            return (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <input type="checkbox" checked={on} onChange={() => void toggle(g)} className="h-4 w-4" />
                  <span className="flex-1 truncate">{r.label || TYPE_LABEL[r.type] || "Rule"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{holes?.length ? `Hole ${holes.join(", ")}` : "Every hole"}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No OB, mandos or drop zones on this course yet. Draw them with the toolbar on the left.</p>
      )}
    </div>
  );
}

function firstHole(r: Row) {
  return r.hole_numbers?.[0] ?? r.hole_number ?? 999;
}
