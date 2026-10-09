import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type FeatureLike = {
  type: string;
  points: [number, number][];
  hole_numbers: number[] | null;
  ob_side: string;
  label: string;
};

/** Adds the selected map object to other layouts of the same course (as drafts). */
export function CopyToLayouts({
  courseId,
  currentLayoutId,
  feature,
  userId,
}: {
  courseId: string;
  currentLayoutId: string | null;
  feature: FeatureLike;
  userId: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const layouts = useQuery({
    queryKey: ["builder-layouts", courseId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("course_layouts").select("id, name").eq("course_id", courseId).order("name");
      return data ?? [];
    },
  });
  const others = (layouts.data ?? []).filter((l) => l.id !== currentLayoutId);

  if (!open)
    return (
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <Layers className="mr-1 h-3.5 w-3.5" /> Also use on other layouts
      </Button>
    );

  return (
    <div className="space-y-2 rounded-lg border border-border p-2">
      <div className="text-xs font-semibold">Add to these layouts</div>
      {layouts.isLoading ? <div className="text-xs text-muted-foreground">Loading…</div> : null}
      {!layouts.isLoading && !others.length ? (
        <div className="text-xs text-muted-foreground">This course has no other layouts.</div>
      ) : null}
      {others.map((l) => (
        <label key={l.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={picked.has(l.id)}
            onChange={(e) =>
              setPicked((prev) => {
                const n = new Set(prev);
                if (e.target.checked) n.add(l.id);
                else n.delete(l.id);
                return n;
              })
            }
          />
          {l.name}
        </label>
      ))}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!picked.size || busy || !userId}
          onClick={async () => {
            setBusy(true);
            const rows = [...picked].map((layout_id) => ({
              course_id: courseId,
              layout_id,
              type: feature.type,
              geometry: { points: feature.points },
              hole_number: feature.hole_numbers?.[0] ?? null,
              hole_numbers: feature.hole_numbers,
              ob_side: feature.ob_side,
              label: feature.label || null,
              created_by: userId,
              publish_state: "draft",
            }));
            const { error } = await supabase.from("course_features").insert(rows as never);
            setBusy(false);
            if (error) toast.error("Couldn't add it to those layouts. You may not have edit rights there.");
            else {
              toast.success(`Added to ${rows.length} layout${rows.length > 1 ? "s" : ""} as a draft.`);
              setOpen(false);
              setPicked(new Set());
            }
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
