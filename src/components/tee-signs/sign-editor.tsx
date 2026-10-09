import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { SignCanvas } from "./sign-canvas";
import { SignStyleSection } from "./sign-style-section";
import {
  SECTION_LABELS,
  mergeDesigns,
  newElement,
  type SignDesign,
  type SignElement,
  type SignSections,
} from "@/lib/tee-sign-design";

const MAX_BYTES = 8 * 1024 * 1024;

export async function uploadSignImage(layoutId: string, file: File): Promise<{ path: string; url: string }> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error("Use a PNG, JPG, WEBP or SVG picture.");
  if (file.size > MAX_BYTES) throw new Error("That picture is over 8 MB.");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to add pictures.");
  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${u.user.id}/tee-signs/${layoutId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("hole-media").upload(path, file, { contentType: file.type });
  if (error) throw new Error("The picture couldn't be uploaded. Try again.");
  const { error: mErr } = await supabase.from("tee_sign_media").insert({ storage_path: path, layout_id: layoutId });
  if (mErr) throw new Error("You don't have permission to edit signs on this layout.");
  const { data: s } = await supabase.storage.from("hole-media").createSignedUrl(path, 3600);
  return { path, url: s?.signedUrl ?? "" };
}

export function SignEditorSheet({
  open,
  onOpenChange,
  layoutId,
  scope,
  title,
  shared,
  initial,
  fallbackUrl,
  urls,
  onUrls,
  onSaved,
  renderBase,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  layoutId: string;
  /** null = shared design for every sign */
  scope: { holeId: string; holeLabel: string } | null;
  title: string;
  shared: SignDesign | null;
  initial: SignDesign | null;
  fallbackUrl: string | null;
  urls: Record<string, string>;
  onUrls: (u: Record<string, string>) => void;
  onSaved: (d: SignDesign) => void;
  /** Draws the printed hole-map sign for a design (Pro style). */
  renderBase?: (d: SignDesign) => React.ReactNode;
}) {
  const [d, setD] = useState<SignDesign>(initial ?? {});
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (open) { setD(initial ?? {}); setSel(null); } }, [open, initial]);

  const preview = scope ? mergeDesigns(shared, d) : d;
  const lockedIds = useMemo(
    () => new Set(scope ? (shared?.elements ?? []).map((e) => e.id) : []),
    [scope, shared],
  );
  const els = d.elements ?? [];
  const selected = els.find((e) => e.id === sel) ?? null;
  const setEl = (el: SignElement) => setD((p) => ({ ...p, elements: (p.elements ?? []).map((e) => (e.id === el.id ? el : e)) }));
  const reorder = (dir: 1 | -1) => {
    if (!selected) return;
    const i = els.indexOf(selected);
    const j = i + dir;
    if (j < 0 || j >= els.length) return;
    const next = [...els];
    [next[i], next[j]] = [next[j], next[i]];
    setD({ ...d, elements: next });
  };

  const pick = (onFile: (f: File) => Promise<void>) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      setUploading(true);
      try { await onFile(f); } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed."); }
      finally { setUploading(false); }
    };
    inp.click();
  };

  const save = async () => {
    setBusy(true);
    const q = supabase.from("tee_sign_designs").select("id").eq("layout_id", layoutId);
    const { data: existing } = await (scope ? q.eq("hole_id", scope.holeId) : q.is("hole_id", null)).maybeSingle();
    const payload = { design: d as never, updated_at: new Date().toISOString() };
    const { error } = existing
      ? await supabase.from("tee_sign_designs").update(payload).eq("id", existing.id)
      : await supabase.from("tee_sign_designs").insert({ ...payload, layout_id: layoutId, hole_id: scope?.holeId ?? null });
    setBusy(false);
    if (error) return toast.error("Couldn't save the sign. You may not have permission to edit this layout.");
    toast.success(scope ? `Sign for ${scope.holeLabel} saved.` : "Design saved for every sign.");
    onSaved(d);
    onOpenChange(false);
  };

  const hide = d.hide ?? {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {scope
              ? "Changes apply to this sign only. Logos added under \"Edit all signs\" show here too but are edited there."
              : "Logos, text and settings here appear on every sign in this layout."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="overflow-hidden rounded-xl border border-border">
              <SignCanvas
                design={preview}
                fallbackUrl={fallbackUrl}
                urls={urls}
                alt="Sign preview"
                editable
                selectedId={sel}
                onSelect={setSel}
                onChangeElement={setEl}
                lockedIds={lockedIds}
                base={preview.style !== "photo" && renderBase ? renderBase(preview) : undefined}
              />
            </div>
            <p className="text-sm text-muted-foreground">Drag a box to move it. Drag its corner square to resize.</p>
          </div>

          <div className="space-y-5 text-sm">
            <section className="space-y-2">
              <h3 className="font-semibold">Add</h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => { const e = newElement("text"); setD({ ...d, elements: [...els, e] }); setSel(e.id); }}>
                  <Type className="mr-1 h-4 w-4" /> Text
                </Button>
                <Button size="sm" variant="secondary" disabled={uploading} onClick={() => pick(async (f) => {
                  const { path, url } = await uploadSignImage(layoutId, f);
                  onUrls({ [path]: url });
                  const e = newElement("image", { path });
                  setD((p) => ({ ...p, elements: [...(p.elements ?? []), e] }));
                  setSel(e.id);
                })}>
                  {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />} Logo or picture
                </Button>
              </div>
            </section>

            {selected ? (
              <section className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{selected.kind === "text" ? "Selected text" : "Selected picture"}</h3>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label="Bring forward" onClick={() => reorder(1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Send back" onClick={() => reorder(-1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => { setD({ ...d, elements: els.filter((e) => e.id !== selected.id) }); setSel(null); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {selected.kind === "text" ? (
                  <>
                    <Textarea rows={2} value={selected.text ?? ""} onChange={(e) => setEl({ ...selected, text: e.target.value })} />
                    <label className="flex items-center gap-2">
                      <span className="w-20 text-muted-foreground">Size</span>
                      <input type="range" min={2} max={20} step={0.5} value={selected.fontSize ?? 6} onChange={(e) => setEl({ ...selected, fontSize: Number(e.target.value) })} className="flex-1" />
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1"><span className="text-muted-foreground">Text</span>
                        <input type="color" value={selected.color ?? "#ffffff"} onChange={(e) => setEl({ ...selected, color: e.target.value })} />
                      </label>
                      <label className="flex items-center gap-1"><span className="text-muted-foreground">Box</span>
                        <input type="color" value={selected.background?.startsWith("#") ? selected.background : "#000000"} onChange={(e) => setEl({ ...selected, background: e.target.value })} />
                      </label>
                      <Button size="sm" variant="ghost" onClick={() => setEl({ ...selected, background: null })}>No box</Button>
                      <label className="flex items-center gap-1"><Switch checked={!!selected.bold} onCheckedChange={(v) => setEl({ ...selected, bold: v })} /> Bold</label>
                      <select value={selected.align ?? "center"} onChange={(e) => setEl({ ...selected, align: e.target.value as SignElement["align"] })} className="rounded-md border border-input bg-background px-1 py-0.5">
                        <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
                      </select>
                    </div>
                  </>
                ) : null}
              </section>
            ) : null}

            <SignStyleSection d={d} setD={setD} shared={shared} isShared={!scope} layoutId={layoutId} onUrls={onUrls} pick={pick} uploading={uploading} />

            <section className="space-y-2">
              <h3 className="font-semibold">{preview.style !== "photo" ? "Background artwork" : "Picture"}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" disabled={uploading} onClick={() => pick(async (f) => {
                  const { path, url } = await uploadSignImage(layoutId, f);
                  onUrls({ [path]: url });
                  setD((p) => ({ ...p, photoPath: path }));
                })}>
                  <ImagePlus className="mr-1 h-4 w-4" /> {d.photoPath ? "Replace photo" : "Use a photo"}
                </Button>
                {d.photoPath ? <Button size="sm" variant="ghost" onClick={() => setD({ ...d, photoPath: null })}>Back to map picture</Button> : null}
                <select value={d.photoFit ?? "cover"} onChange={(e) => setD({ ...d, photoFit: e.target.value as SignDesign["photoFit"] })} className="rounded-md border border-input bg-background px-1 py-1">
                  <option value="cover">Fill the sign</option>
                  <option value="contain">Show whole photo</option>
                </select>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Wording</h3>
              {scope ? (
                <>
                  <Input placeholder={`Title (default: ${scope.holeLabel})`} value={d.title ?? ""} onChange={(e) => setD({ ...d, title: e.target.value || undefined })} />
                  <Input placeholder="Subtitle (default: hole nickname)" value={d.subtitle ?? ""} onChange={(e) => setD({ ...d, subtitle: e.target.value || undefined })} />
                  <Textarea rows={3} placeholder="Notes printed on the sign (default: caddy notes)" value={d.notes ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value || undefined })} />
                </>
              ) : (
                <label className="flex items-center gap-2">
                  <span className="text-muted-foreground">Header colour</span>
                  <input type="color" value={d.accent ?? "#0ea5e9"} onChange={(e) => setD({ ...d, accent: e.target.value })} />
                  {d.accent ? <Button size="sm" variant="ghost" onClick={() => setD({ ...d, accent: undefined })}>Default</Button> : null}
                </label>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Show on the sign</h3>
              {(Object.keys(SECTION_LABELS) as (keyof SignSections)[]).map((k) => (
                <label key={k} className="flex items-center justify-between">
                  <span>{SECTION_LABELS[k]}</span>
                  <Switch checked={!hide[k]} onCheckedChange={(v) => setD({ ...d, hide: { ...hide, [k]: !v } })} />
                </label>
              ))}
            </section>

            <div className="flex gap-2 border-t border-border pt-3">
              <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Save sign</Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              {scope && initial ? (
                <Button variant="ghost" className="ml-auto" onClick={() => setD({})}>Reset this sign</Button>
              ) : null}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
