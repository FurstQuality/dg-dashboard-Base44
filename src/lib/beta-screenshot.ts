import { supabase } from "@/integrations/supabase/client";

export const BETA_SCREENSHOT_BUCKET = "beta-screenshots";

/** Elements carrying this attribute are left out of captured screenshots. */
export const CAPTURE_HIDE_ATTR = "data-beta-capture-hide";

const HIDE_SELECTOR = [
  `[${CAPTURE_HIDE_ATTR}]`,
  '[role="dialog"]',
  "[data-sonner-toaster]",
  "[data-radix-popper-content-wrapper]",
].join(",");

/**
 * Captures the visible page as a PNG data URL. Any open dialog, toast, or
 * element flagged with `data-beta-capture-hide` is hidden for the shot so the
 * tester sees the screen they are reporting on, not the feedback form.
 */
export async function capturePageScreenshot(): Promise<string> {
  if (typeof document === "undefined") throw new Error("Screenshots need a browser");
  const { toPng } = await import("html-to-image");

  const hidden: Array<{ el: HTMLElement; prev: string }> = [];
  const hide = (el: Element | null) => {
    if (!(el instanceof HTMLElement)) return;
    hidden.push({ el, prev: el.style.visibility });
    el.style.visibility = "hidden";
  };

  document.querySelectorAll(HIDE_SELECTOR).forEach((el) => {
    hide(el);
    // Radix renders the dialog overlay as the content's sibling.
    if (el.getAttribute("role") === "dialog") hide(el.previousElementSibling);
  });

  const target = document.body;
  const scrollY = window.scrollY;
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;

  try {
    const shot = toPng(target, {
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#0b1220",
      // Keep the snapshot cheap: web fonts and cross-origin CSS are the slowest
      // part of cloning a full app screen, and neither changes the layout here.
      skipFonts: true,
      cacheBust: false,
      pixelRatio: 1,
      width,
      height,
      style: {
        transform: `translateY(-${scrollY}px)`,
        transformOrigin: "top left",
      },
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.matches?.(HIDE_SELECTOR)) return false;
        // Third-party frames and media cannot be inlined and only slow us down.
        const tag = node.tagName;
        return tag !== "IFRAME" && tag !== "VIDEO" && tag !== "SCRIPT" && tag !== "LINK";
      },
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("this screen took too long to snapshot")), 15000),
    );
    return await Promise.race([shot, timeout]);
  } finally {
    hidden.forEach(({ el, prev }) => {
      el.style.visibility = prev;
    });
  }
}


function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(meta ?? "")?.[1] ?? "image/png";
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Uploads an annotated screenshot and returns its storage path. */
export async function uploadBetaScreenshot(
  userId: string,
  dataUrl: string,
): Promise<string> {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await supabase.storage
    .from(BETA_SCREENSHOT_BUCKET)
    .upload(path, dataUrlToBlob(dataUrl), { contentType: "image/png", upsert: false });
  if (error) throw new Error(`Screenshot upload failed: ${error.message}`);
  return path;
}

/** Signed URL for viewing a stored screenshot (owner or triage admin only). */
export async function betaScreenshotUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BETA_SCREENSHOT_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
