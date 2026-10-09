import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, Video, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

type Media = {
  id: string;
  hole_id: string;
  kind: "photo" | "drone_video" | "video";
  storage_path: string;
  caption: string | null;
  sort_order: number;
  signedUrl?: string;
};

const BUCKET = "hole-media";

export function HoleMediaGallery({
  holeId,
  canEdit,
  userId,
  compact,
}: {
  holeId: string;
  canEdit: boolean;
  userId: string | null;
  compact?: boolean;
}) {
  const [items, setItems] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data, error } = await supabase
      .from("hole_media")
      .select("id, hole_id, kind, storage_path, caption, sort_order")
      .eq("hole_id", holeId)
      .order("sort_order")
      .order("created_at");
    if (error) return;
    const rows = (data as Media[]) ?? [];
    const withUrls = await Promise.all(
      rows.map(async (r) => {
        const { data: s } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(r.storage_path, 3600);
        return { ...r, signedUrl: s?.signedUrl };
      }),
    );
    setItems(withUrls);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeId]);

  async function onFiles(files: FileList | null) {
    if (!files || !files.length || !userId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`${file.name}: max 100MB`);
          continue;
        }
        const isVideo = file.type.startsWith("video/");
        const ext = file.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg");
        const path = `${userId}/${holeId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (upErr) {
          toast.error(`Upload failed: ${upErr.message}`);
          continue;
        }
        const kind: Media["kind"] = isVideo ? "drone_video" : "photo";
        const { error: insErr } = await supabase.from("hole_media").insert({
          hole_id: holeId,
          kind,
          storage_path: path,
          created_by: userId,
        });
        if (insErr) {
          await supabase.storage.from(BUCKET).remove([path]);
          toast.error(`Save failed: ${insErr.message}`);
        }
      }
      await load();
      toast.success("Media uploaded");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(m: Media) {
    if (!confirm("Delete this media?")) return;
    await supabase.storage.from(BUCKET).remove([m.storage_path]);
    await supabase.from("hole_media").delete().eq("id", m.id);
    setItems((prev) => prev.filter((x) => x.id !== m.id));
  }

  async function updateCaption(m: Media, caption: string) {
    setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, caption } : x)));
    await supabase.from("hole_media").update({ caption }).eq("id", m.id);
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && !canEdit ? null : (
        <div className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
          {items.map((m) => (
            <div
              key={m.id}
              className="group relative overflow-hidden rounded-md border border-border bg-muted"
            >
              {m.kind === "photo" ? (
                <img
                  src={m.signedUrl}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <video
                  src={m.signedUrl}
                  controls
                  preload="metadata"
                  className="aspect-square w-full object-cover"
                />
              )}
              <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                {m.kind === "photo" ? (
                  <ImageIcon className="inline h-3 w-3" />
                ) : (
                  <Video className="inline h-3 w-3" />
                )}
                <span className="ml-1">
                  {m.kind === "drone_video" ? "Drone" : m.kind === "video" ? "Video" : "Photo"}
                </span>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => remove(m)}
                  className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
              {canEdit && !compact ? (
                <input
                  className="w-full border-t border-border bg-background px-1 py-0.5 text-[11px]"
                  placeholder="Caption"
                  defaultValue={m.caption ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (m.caption ?? "")) void updateCaption(m, e.target.value);
                  }}
                />
              ) : m.caption ? (
                <div className="truncate border-t border-border bg-background px-1 py-0.5 text-[11px]">
                  {m.caption}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {canEdit ? (
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-1 h-3 w-3" />
            {uploading ? "Uploading…" : "Add photo / drone video"}
          </Button>
          <span className="text-[11px] text-muted-foreground">Images and MP4/WebM up to 100MB</span>
        </div>
      ) : null}
    </div>
  );
}
