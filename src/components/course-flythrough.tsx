import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Loader2, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";

const BUCKET = "courses";
const MAX_MB = 500;

export function CourseFlythroughUploader({
  courseId,
  userId,
  initialUrl,
  initialPath,
  onChange,
}: {
  courseId: string;
  userId: string;
  initialUrl: string | null;
  initialPath: string | null;
  onChange?: (next: { url: string | null; path: string | null }) => void;
}) {
  const [path, setPath] = useState<string | null>(initialPath);
  const [signedUrl, setSignedUrl] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!path) {
        setSignedUrl(null);
        return;
      }
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 4);
      if (mounted) setSignedUrl(data?.signedUrl ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [path]);

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      toast.error("Please choose a video file");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Video is too large — keep it under ${MAX_MB} MB`);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const newPath = `${userId}/${courseId}/flythrough-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(newPath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;

      // Best-effort remove old file
      if (path && path !== newPath) {
        await supabase.storage
          .from(BUCKET)
          .remove([path])
          .catch(() => {});
      }

      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(newPath, 60 * 60 * 4);
      const url = signed?.signedUrl ?? null;

      const { error: dbErr } = await supabase
        .from("courses")
        .update({ flythrough_path: newPath, flythrough_url: url })
        .eq("id", courseId);
      if (dbErr) throw dbErr;

      setPath(newPath);
      setSignedUrl(url);
      onChange?.({ url, path: newPath });
      toast.success("Flythrough uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!path) return;
    if (!confirm("Remove the drone flythrough video?")) return;
    setRemoving(true);
    try {
      await supabase.storage
        .from(BUCKET)
        .remove([path])
        .catch(() => {});
      const { error } = await supabase
        .from("courses")
        .update({ flythrough_path: null, flythrough_url: null })
        .eq("id", courseId);
      if (error) throw error;
      setPath(null);
      setSignedUrl(null);
      onChange?.({ url: null, path: null });
      toast.success("Flythrough removed");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't remove that. Give it another shot.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <VideoIcon className="h-4 w-4" /> Drone flythrough
          </div>
          <div className="text-xs text-muted-foreground">
            Showcase the course with an aerial video. Shown on the course page.
          </div>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || removing}
          >
            {uploading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            {path ? "Replace" : "Upload video"}
          </Button>
          {path ? (
            <Button size="sm" variant="ghost" onClick={remove} disabled={uploading || removing}>
              <Trash2 className="mr-1 h-4 w-4" /> Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div className="p-3">
        {uploading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading video…
            {progress > 0 ? <span>{progress}%</span> : null}
          </div>
        ) : signedUrl ? (
          <video
            key={signedUrl}
            src={signedUrl}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-lg bg-black"
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
            <VideoIcon className="mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-medium">No flythrough yet</div>
            <div className="mt-1 max-w-md text-xs text-muted-foreground">
              Upload an MP4 or MOV from your drone (up to {MAX_MB} MB). This lives on the course
              itself, separate from social posts and hole-by-hole caddy media.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CourseFlythroughPlayer({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!path) return;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 4);
      if (mounted) setUrl(data?.signedUrl ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [path]);
  if (!path || !url) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-3 font-semibold">Drone flythrough</div>
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full bg-black"
      />
    </div>
  );
}

/**
 * Standalone per-hole flythrough uploader.
 *
 * Unlike the course-level uploader, this component does NOT write to the
 * database itself — the hole editor owns the HoleDraft state and persists
 * `flythrough_path` / `flythrough_url` when the course is saved. This
 * component only handles the upload/remove of the underlying video file
 * in storage and reports the new path/url back via `onChange`.
 */
export function HoleFlythroughUploader({
  courseId,
  holeNumber,
  holeLabel,
  userId,
  path,
  url,
  onChange,
  compact = true,
}: {
  courseId: string;
  holeNumber: number;
  holeLabel?: string;
  userId: string;
  path: string | null;
  url: string | null;
  onChange: (next: { url: string | null; path: string | null }) => void;
  compact?: boolean;
}) {
  const label = (holeLabel && holeLabel.trim()) || String(holeNumber);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(url);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!path) {
        setSignedUrl(null);
        return;
      }
      if (url) {
        setSignedUrl(url);
        return;
      }
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 4);
      if (mounted) setSignedUrl(data?.signedUrl ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [path, url]);

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      toast.error("Please choose a video file");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Video is too large — keep it under ${MAX_MB} MB`);
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const newPath = `${userId}/${courseId}/holes/${holeNumber}/flythrough-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(newPath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      if (path && path !== newPath) {
        await supabase.storage
          .from(BUCKET)
          .remove([path])
          .catch(() => {});
      }
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(newPath, 60 * 60 * 4);
      const nextUrl = signed?.signedUrl ?? null;
      setSignedUrl(nextUrl);
      onChange({ url: nextUrl, path: newPath });
      toast.success(`Hole ${label} flythrough uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!path) return;
    if (!confirm(`Remove the flythrough for hole ${label}?`)) return;
    setRemoving(true);
    try {
      await supabase.storage
        .from(BUCKET)
        .remove([path])
        .catch(() => {});
      setSignedUrl(null);
      onChange({ url: null, path: null });
      toast.success("Flythrough removed");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't remove that. Give it another shot.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div
      className={
        compact
          ? "rounded-md border border-border bg-muted/20"
          : "rounded-xl border border-border bg-card"
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-border p-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <VideoIcon className="h-3.5 w-3.5" /> Hole {label} flythrough
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            Short aerial clip for this hole (up to {MAX_MB} MB).
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || removing}
          >
            {uploading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3.5 w-3.5" />
            )}
            {path ? "Replace" : "Upload"}
          </Button>
          {path ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={remove}
              disabled={uploading || removing}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="p-2">
        {uploading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
          </div>
        ) : signedUrl ? (
          <video
            key={signedUrl}
            src={signedUrl}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-md bg-black"
          />
        ) : (
          <div className="py-3 text-center text-[11px] text-muted-foreground">
            No flythrough for this hole yet.
          </div>
        )}
      </div>
    </div>
  );
}

export function HoleFlythroughPlayer({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!path) return;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 4);
      if (mounted) setUrl(data?.signedUrl ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [path]);
  if (!path || !url) return null;
  return (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      className="aspect-video w-full rounded-md bg-black"
    />
  );
}
