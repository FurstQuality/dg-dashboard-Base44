import { supabase } from "@/integrations/supabase/client";

/** Limits kept generous but bounded so a post never stalls on a huge upload. */
export const MAX_IMAGE_MB = 15;
export const MAX_VIDEO_MB = 100;
export const MAX_VIDEO_SECONDS = 180;

const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.85;
/** Signed media links live a year; render-time refreshes keep old posts working. */
export const MEDIA_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

export function isVideo(file: { type?: string | null }): boolean {
  return Boolean(file.type?.startsWith("video"));
}

/** Reads a video's length so we can reject clips that are too long to post. */
export function videoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    el.src = url;
  });
}

/**
 * Explains why a file can't be posted, or null when it's fine.
 * Videos are checked for length as well as size.
 */
export async function mediaRejectionReason(file: File): Promise<string | null> {
  const mb = file.size / (1024 * 1024);
  if (isVideo(file)) {
    if (mb > MAX_VIDEO_MB) return `${file.name} is over ${MAX_VIDEO_MB} MB. Trim it and try again.`;
    const seconds = await videoDurationSeconds(file);
    if (seconds > MAX_VIDEO_SECONDS) {
      return `${file.name} runs ${Math.round(seconds)}s — keep clips under ${MAX_VIDEO_SECONDS / 60} minutes.`;
    }
    return null;
  }
  if (!file.type.startsWith("image")) return `${file.name} isn't a photo or video.`;
  if (mb > MAX_IMAGE_MB) return `${file.name} is over ${MAX_IMAGE_MB} MB.`;
  return null;
}

/**
 * Shrinks a photo in the browser before upload so posting is quick on phone data
 * and the feed doesn't download 8 MB originals. Videos pass through untouched.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (isVideo(file) || !file.type.startsWith("image") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size < 1.5 * 1024 * 1024) return file;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const resignCache = new Map<string, string>();

/**
 * Re-signs a stored media path. Used when an old post's link has expired so the
 * photo appears instead of a broken image.
 */
export async function resignMediaUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const cached = resignCache.get(path);
  if (cached) return cached;
  const { data } = await supabase.storage.from("posts").createSignedUrl(path, MEDIA_URL_TTL_SECONDS);
  const url = data?.signedUrl ?? null;
  if (url) resignCache.set(path, url);
  return url;
}
