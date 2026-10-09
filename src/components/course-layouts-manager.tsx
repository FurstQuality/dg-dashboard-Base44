import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Pencil, Plus, Star, Trash2, Copy, FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type Layout = {
  id: string;
  name: string;
  hole_count: number;
  par_total: number | null;
  distance_total: number | null;
  is_default: boolean;
};

export function CourseLayoutsManager({
  courseId,
  layouts,
  canEdit,
  canAddLayout,
  onChange,
}: {
  courseId: string;
  layouts: Layout[];
  canEdit: boolean;
  /** Any signed-in player may contribute a new layout, even without edit rights. */
  canAddLayout?: boolean;
  onChange: () => void;
}) {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renaming, setRenaming] = useState<Layout | null>(null);
  const canAdd = canEdit || !!canAddLayout;

  if (!canAdd && layouts.length <= 1) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="font-semibold">Layouts</div>
        {canAdd ? (
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add layout
          </Button>
        ) : null}
      </div>

      <div className="divide-y divide-border">
        {layouts.map((l) => (
          <LayoutRow
            key={l.id}
            layout={l}
            courseId={courseId}
            canEdit={canEdit}
            layoutsCount={layouts.length}
            onRename={() => setRenaming(l)}
            onChange={onChange}
          />
        ))}
        {layouts.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No layouts saved yet — save one from the course builder to reuse it.
          </div>
        ) : null}
      </div>

      {dialogOpen ? (
        <AddLayoutDialog
          courseId={courseId}
          layouts={layouts}
          onClose={() => setDialogOpen(false)}
          onCreated={(newId) => {
            setDialogOpen(false);
            onChange();
            navigate({
              to: "/courses/$courseId/edit",
              params: { courseId },
              search: { layout: newId },
            });
          }}
        />
      ) : null}

      {renaming ? (
        <RenameDialog
          layout={renaming}
          onClose={() => setRenaming(null)}
          onDone={() => {
            setRenaming(null);
            onChange();
          }}
        />
      ) : null}
    </div>
  );
}

function LayoutRow({
  layout,
  courseId,
  canEdit,
  layoutsCount,
  onRename,
  onChange,
}: {
  layout: Layout;
  courseId: string;
  canEdit: boolean;
  layoutsCount: number;
  onRename: () => void;
  onChange: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function setDefault() {
    setBusy(true);
    try {
      await supabase.from("course_layouts").update({ is_default: false }).eq("course_id", courseId);
      const { error } = await supabase
        .from("course_layouts")
        .update({ is_default: true })
        .eq("id", layout.id);
      if (error) throw error;
      toast.success(`"${layout.name}" is now the default layout`);
      onChange();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "We couldn't set this as the default. Give it another shot.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (layout.is_default) {
      toast.error("Set another layout as default before deleting this one.");
      return;
    }
    if (!confirm(`Delete layout "${layout.name}" and all of its holes?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("course_layouts").delete().eq("id", layout.id);
      if (error) throw error;
      toast.success("Layout deleted");
      onChange();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't delete that. Give it another shot.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
      <div className="flex items-center gap-2">
        {layout.is_default ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : null}
        <div>
          <div className="font-medium">{layout.name}</div>
          <div className="text-xs text-muted-foreground">
            {layout.hole_count} holes
            {layout.par_total ? ` · Par ${layout.par_total}` : ""}
            {layout.distance_total ? ` · ${layout.distance_total.toLocaleString()} ft` : ""}
          </div>
        </div>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          {!layout.is_default ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={setDefault}
              disabled={busy}
              title="Set as default"
            >
              <Star className="mr-1 h-4 w-4" /> Default
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onRename} disabled={busy}>
            <Pencil className="mr-1 h-4 w-4" /> Rename
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigate({
                to: "/courses/$courseId/edit",
                params: { courseId },
                search: { layout: layout.id },
              })
            }
          >
            Edit
          </Button>
          {layoutsCount > 1 && !layout.is_default ? (
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RenameDialog({
  layout,
  onClose,
  onDone,
}: {
  layout: Layout;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(layout.name);
  const [busy, setBusy] = useState(false);

  async function save() {
    const name = value.trim();
    if (!name) return toast.error("Name required");
    setBusy(true);
    try {
      const { error } = await supabase.from("course_layouts").update({ name }).eq("id", layout.id);
      if (error) throw error;
      toast.success("Renamed");
      onDone();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't rename that. Give it another shot.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename layout</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="layout-name">Layout name</Label>
          <Input
            id="layout-name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Blue Tees, Short, Winter"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddLayoutDialog({
  courseId,
  layouts,
  onClose,
  onCreated,
}: {
  courseId: string;
  layouts: Layout[];
  onClose: () => void;
  onCreated: (newLayoutId: string) => void;
}) {
  const [mode, setMode] = useState<"blank" | "template">(layouts.length > 0 ? "template" : "blank");
  const [templateId, setTemplateId] = useState<string>(
    layouts.find((l) => l.is_default)?.id ?? layouts[0]?.id ?? "",
  );
  const [name, setName] = useState("");
  const [holeCount, setHoleCount] = useState(18);
  const [busy, setBusy] = useState(false);

  async function create() {
    const layoutName = name.trim();
    if (!layoutName) return toast.error("Give the layout a name");
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      if (mode === "template") {
        if (!templateId) throw new Error("Pick a template");
        const newId = await duplicateLayout(courseId, templateId, layoutName, user.id);
        toast.success(`Created "${layoutName}" from template`);
        onCreated(newId);
      } else {
        const newId = await createBlankLayout(
          courseId,
          layoutName,
          holeCount,
          user.id,
          layouts.length === 0,
        );

        toast.success(`Created "${layoutName}"`);
        onCreated(newId);
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't create this layout. Give it another shot.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a new layout</DialogTitle>
          <DialogDescription>
            Layouts share the course property and boundary. Use them for different tee positions,
            short/long variations, or seasonal setups.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("template")}
              disabled={layouts.length === 0}
              className={
                "rounded-lg border p-3 text-left transition disabled:opacity-40 " +
                (mode === "template"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted")
              }
            >
              <div className="flex items-center gap-2 font-semibold">
                <Copy className="h-4 w-4" /> From template
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Duplicate an existing layout — holes, tees, baskets, OB, and features come with it.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("blank")}
              className={
                "rounded-lg border p-3 text-left transition " +
                (mode === "blank" ? "border-primary bg-primary/10" : "border-border hover:bg-muted")
              }
            >
              <div className="flex items-center gap-2 font-semibold">
                <FilePlus2 className="h-4 w-4" /> Start blank
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Empty holes with no tees, baskets, or features yet.
              </div>
            </button>
          </div>

          {mode === "template" && layouts.length > 0 ? (
            <div className="space-y-2">
              <Label>Copy from</Label>
              <div className="grid gap-2">
                {layouts.map((l) => (
                  <label
                    key={l.id}
                    className={
                      "flex cursor-pointer items-center justify-between rounded-md border p-2 text-sm " +
                      (templateId === l.id ? "border-primary bg-primary/5" : "border-border")
                    }
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="template"
                        checked={templateId === l.id}
                        onChange={() => setTemplateId(l.id)}
                      />
                      <div>
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.hole_count} holes
                          {l.par_total ? ` · Par ${l.par_total}` : ""}
                        </div>
                      </div>
                    </div>
                    {l.is_default ? (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                        DEFAULT
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="new-layout-name">New layout name</Label>
            <Input
              id="new-layout-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Blue Tees, Short Course, Winter"
              autoFocus
            />
          </div>

          {mode === "blank" ? (
            <div className="space-y-2">
              <Label htmlFor="hole-count">Number of holes</Label>
              <Input
                id="hole-count"
                type="number"
                min={1}
                max={36}
                value={holeCount}
                onChange={(e) =>
                  setHoleCount(Math.max(1, Math.min(36, Number(e.target.value) || 18)))
                }
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Create layout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function createBlankLayout(
  courseId: string,
  name: string,
  holeCount: number,
  userId: string,
  makeDefault = false,
): Promise<string> {
  const { data: layout, error } = await supabase
    .from("course_layouts")
    .insert({
      course_id: courseId,
      name,
      hole_count: holeCount,
      par_total: holeCount * 3,
      distance_total: 0,
      is_default: makeDefault,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) throw error;
  const layoutId = layout!.id as string;

  const holeRows = Array.from({ length: holeCount }, (_, i) => ({
    layout_id: layoutId,
    number: i + 1,
    par: 3,
    tee_name: "Main",
    basket_name: "A",
    tee_color: "#ffffff",
    basket_color: "#a3e635",
    hazards: [] as string[],
    flight_path: [] as unknown[],
  }));
  const { error: hErr } = await (supabase.from("holes") as any).insert(holeRows);
  if (hErr) throw hErr;
  // avoid unused var lint
  void userId;
  return layoutId;
}

export async function duplicateLayout(
  courseId: string,
  sourceLayoutId: string,
  newName: string,
  userId: string,
): Promise<string> {
  const { data: src, error: sErr } = await supabase
    .from("course_layouts")
    .select("hole_count, par_total, distance_total")
    .eq("id", sourceLayoutId)
    .single();
  if (sErr) throw sErr;

  const { data: layout, error: lErr } = await supabase
    .from("course_layouts")
    .insert({
      course_id: courseId,
      name: newName,
      hole_count: src!.hole_count,
      par_total: src!.par_total,
      distance_total: src!.distance_total,
      is_default: false,
      created_by: userId,
    })

    .select("id")
    .single();
  if (lErr) throw lErr;
  const newLayoutId = layout!.id as string;

  // Copy holes
  const { data: srcHoles, error: shErr } = await supabase
    .from("holes")
    .select("*")
    .eq("layout_id", sourceLayoutId)
    .order("number");
  if (shErr) throw shErr;

  const holeIdMap = new Map<string, string>();
  if (srcHoles && srcHoles.length) {
    const rows = srcHoles.map((h: Record<string, unknown>) => {
      const {
        id: _omit,
        created_at: _c,
        updated_at: _u,
        ...rest
      } = h as {
        id: string;
        created_at?: string;
        updated_at?: string;
      };
      void _omit;
      void _c;
      void _u;
      return { ...rest, layout_id: newLayoutId };
    });
    const { data: newHoles, error: nhErr } = await (supabase.from("holes") as any)
      .insert(rows)
      .select("id, number");

    if (nhErr) throw nhErr;
    (newHoles ?? []).forEach((nh: { id: string; number: number }) => {
      const src = srcHoles.find((s: { number: number }) => s.number === nh.number);
      if (src) holeIdMap.set((src as { id: string }).id, nh.id);
    });
  }

  // Copy tees and baskets
  const srcHoleIds = (srcHoles ?? []).map((h: { id: string }) => h.id);
  if (srcHoleIds.length) {
    const [{ data: srcTees }, { data: srcBaskets }] = await Promise.all([
      supabase.from("hole_tees").select("*").in("hole_id", srcHoleIds),
      supabase.from("hole_baskets").select("*").in("hole_id", srcHoleIds),
    ]);
    const mapRow = (r: Record<string, unknown>) => {
      const {
        id: _id,
        created_at: _c,
        updated_at: _u,
        hole_id,
        ...rest
      } = r as {
        id: string;
        created_at?: string;
        updated_at?: string;
        hole_id: string;
      };
      void _id;
      void _c;
      void _u;
      const mapped = holeIdMap.get(hole_id);
      return mapped ? { ...rest, hole_id: mapped } : null;
    };
    const basketIds = new Map((srcBaskets ?? []).map(b=>[b.id,crypto.randomUUID()]));
    const teeRows = (srcTees ?? []).map(t=>{const row=mapRow(t); return row ? {...row,flight_path:remapTeePaths(t.flight_path,basketIds)} : null;}).filter(Boolean) as Record<string, unknown>[];
    const basketRows = (srcBaskets ?? []).map(b=>{const row=mapRow(b); return row ? {...row,id:basketIds.get(b.id),split_point:remapBasketPath(b.split_point,basketIds)} : null;}).filter(Boolean) as Record<string, unknown>[];
    if (teeRows.length) {
      const { error } = await (supabase.from("hole_tees") as any).insert(teeRows);
      if (error) throw error;
    }
    if (basketRows.length) {
      const { error } = await (supabase.from("hole_baskets") as any).insert(basketRows);
      if (error) throw error;
    }
  }

  // Copy course features (two-pass to remap ref_feature_id)
  const { data: srcFeatures, error: fErr } = await supabase
    .from("course_features")
    .select("*")
    .eq("layout_id", sourceLayoutId)
    .neq("layer", "event");
  if (fErr) throw fErr;

  const featureIdMap = new Map<string, string>();
  const nonRef = (srcFeatures ?? []).filter((f: { type: string }) => f.type !== "ob_reference");
  const refs = (srcFeatures ?? []).filter((f: { type: string }) => f.type === "ob_reference");

  for (const f of nonRef as Array<Record<string, unknown>>) {
    const {
      id: srcId,
      created_at: _c,
      updated_at: _u,
      ...rest
    } = f as {
      id: string;
      created_at?: string;
      updated_at?: string;
    };
    void _c;
    void _u;
    const { data, error } = await (supabase.from("course_features") as any)
      .insert({ ...rest, layout_id: newLayoutId, course_id: courseId, created_by: userId })
      .select("id")
      .single();

    if (error) throw error;
    if (data?.id) featureIdMap.set(srcId, data.id as string);
  }
  for (const f of refs as Array<Record<string, unknown>>) {
    const {
      id: srcId,
      created_at: _c,
      updated_at: _u,
      ref_feature_id,
      ...rest
    } = f as {
      id: string;
      created_at?: string;
      updated_at?: string;
      ref_feature_id: string | null;
    };
    void srcId;
    void _c;
    void _u;
    const mappedRef = ref_feature_id ? (featureIdMap.get(ref_feature_id) ?? null) : null;
    if (!mappedRef) continue;
    const { error } = await (supabase.from("course_features") as any).insert({
      ...rest,
      ref_feature_id: mappedRef,
      layout_id: newLayoutId,
      course_id: courseId,
      created_by: userId,
    });

    if (error) throw error;
  }

  return newLayoutId;
}
import { remapTeePaths, remapBasketPath } from "@/lib/course-builder/studio-fairways";
