import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";

const MAX_BYTES = 8 * 1024 * 1024;

interface EventCoverPickerProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}

export function EventCoverPicker({ value, onChange, label = "Cover photo" }: EventCoverPickerProps) {
  const { user } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (!user) return toast.error("Sign in to upload a cover photo");
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    if (file.size > MAX_BYTES) return toast.error("Image must be under 8 MB");
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-z0-9_.-]/gi, "_");
      const path = `${user.id}/event-cover-${Date.now()}-${safe}`;
      const { error } = await supabase.storage
        .from("covers")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw new Error(error.message);
      const { data: signed } = await supabase.storage
        .from("covers")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (!signed?.signedUrl) throw new Error("Could not read the uploaded photo back");
      onChange(signed.signedUrl);
      toast.success("Cover photo ready — save to publish it");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {value ? (
        <img
          src={value}
          alt="League cover photo preview"
          className="h-40 w-full rounded-xl border border-border object-cover"
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
          No cover photo yet — landscape images look best
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-1 h-4 w-4" />
          )}
          {uploading ? "Uploading…" : value ? "Replace photo" : "Upload photo"}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" onClick={() => onChange("")}>
            <Trash2 className="mr-1 h-4 w-4" /> Remove
          </Button>
        ) : null}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or paste an image link"
        aria-label="Cover photo link"
      />
    </div>
  );
}
