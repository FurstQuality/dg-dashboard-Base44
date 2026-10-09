/**
 * Overlay Lab — client-side branding overlays for creator photos and video frames.
 *
 * Everything here runs in the browser: the creator's brand kit is stored per
 * device and the overlay is composited onto a <canvas> so nothing is uploaded
 * anywhere until they choose to attach the exported PNG to a post.
 */

export type OverlayAspect = "square" | "portrait" | "story" | "landscape";
export type OverlayLayout = "lower_band" | "full_frame" | "corner_card";

export interface OverlaySponsor {
  id: string;
  name: string;
}

export interface OverlayBrandKit {
  displayName: string;
  handle: string;
  tagline: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  sponsorIntro: string;
  sponsors: OverlaySponsor[];
  accentColor: string;
  textColor: string;
  layout: OverlayLayout;
  aspect: OverlayAspect;
  /** Scrim opacity behind the text, 0–100. */
  scrim: number;
  showContactRow: boolean;
  /** Data URL of an optional logo/wordmark. */
  logoDataUrl: string | null;
}

export const ASPECT_OPTIONS: { value: OverlayAspect; label: string; width: number; height: number }[] =
  [
    { value: "square", label: "Square 1:1", width: 1080, height: 1080 },
    { value: "portrait", label: "Portrait 4:5", width: 1080, height: 1350 },
    { value: "story", label: "Story / Reel 9:16", width: 1080, height: 1920 },
    { value: "landscape", label: "Landscape 16:9", width: 1920, height: 1080 },
  ];

export const LAYOUT_OPTIONS: { value: OverlayLayout; label: string; hint: string }[] = [
  {
    value: "lower_band",
    label: "Lower band",
    hint: "Name and sponsors across the bottom — safest for reels.",
  },
  {
    value: "full_frame",
    label: "Full frame",
    hint: "Accent border with a header and a sponsor footer.",
  },
  {
    value: "corner_card",
    label: "Corner card",
    hint: "Compact card in the lower left, leaves the shot open.",
  },
];

export const OVERLAY_STORAGE_KEY = "dgd.overlay-lab.brand-kit.v1";

export function defaultBrandKit(): OverlayBrandKit {
  return {
    displayName: "",
    handle: "",
    tagline: "",
    contactEmail: "",
    contactPhone: "",
    website: "",
    sponsorIntro: "Supported by",
    sponsors: [],
    accentColor: "#22d3ee",
    textColor: "#ffffff",
    layout: "lower_band",
    aspect: "portrait",
    scrim: 55,
    showContactRow: true,
    logoDataUrl: null,
  };
}

export function newSponsor(name = ""): OverlaySponsor {
  return { id: crypto.randomUUID(), name };
}

export function loadBrandKit(): OverlayBrandKit {
  if (typeof window === "undefined") return defaultBrandKit();
  try {
    const raw = window.localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (!raw) return defaultBrandKit();
    const parsed = JSON.parse(raw) as Partial<OverlayBrandKit>;
    return { ...defaultBrandKit(), ...parsed, sponsors: parsed.sponsors ?? [] };
  } catch {
    return defaultBrandKit();
  }
}

export function saveBrandKit(kit: OverlayBrandKit): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(kit));
  } catch {
    /* storage full or blocked — the overlay still renders from memory */
  }
}

export function sponsorLine(kit: OverlayBrandKit): string {
  const names = kit.sponsors.map((s) => s.name.trim()).filter(Boolean);
  if (!names.length) return "";
  const intro = kit.sponsorIntro.trim();
  return `${intro ? `${intro} ` : ""}${names.join("  •  ")}`;
}

export function contactLine(kit: OverlayBrandKit): string {
  return [kit.website, kit.contactEmail, kit.contactPhone]
    .map((v) => v.trim())
    .filter(Boolean)
    .join("   |   ");
}

/** Everything the overlay renderer needs that is not part of the brand kit. */
export interface OverlayRenderOptions {
  kit: OverlayBrandKit;
  /** Background photo/video still. When null the export is a transparent frame. */
  media: HTMLImageElement | null;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
): void {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  weight: string,
  family: string,
): number {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 12 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

const FONT_STACK =
  "'Inter', 'Helvetica Neue', Helvetica, Arial, system-ui, -apple-system, sans-serif";

/** Composites the overlay onto the canvas at the aspect's native pixel size. */
export function renderOverlay(canvas: HTMLCanvasElement, opts: OverlayRenderOptions): void {
  const { kit, media } = opts;
  const aspect = ASPECT_OPTIONS.find((a) => a.value === kit.aspect) ?? ASPECT_OPTIONS[1];
  const W = aspect.width;
  const H = aspect.height;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, W, H);
  if (media) drawCoverImage(ctx, media, W, H);

  const pad = Math.round(Math.min(W, H) * 0.055);
  const scrimAlpha = Math.min(Math.max(kit.scrim, 0), 100) / 100;
  const name = kit.displayName.trim();
  const handle = kit.handle.trim();
  const tagline = kit.tagline.trim();
  const sponsors = sponsorLine(kit);
  const contact = kit.showContactRow ? contactLine(kit) : "";

  const drawLogo = (x: number, y: number, box: number): number => {
    if (!kit.logoDataUrl) return 0;
    const img = logoCache.get(kit.logoDataUrl);
    if (!img || !img.complete || !img.naturalWidth) return 0;
    const scale = Math.min(box / img.naturalWidth, box / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, x, y + (box - h) / 2, w, h);
    return w;
  };

  if (kit.layout === "full_frame") {
    const border = Math.round(Math.min(W, H) * 0.014);
    ctx.strokeStyle = kit.accentColor;
    ctx.lineWidth = border;
    ctx.strokeRect(border / 2, border / 2, W - border, H - border);

    // Header strip
    const headerH = Math.round(H * 0.1);
    ctx.fillStyle = withAlpha("#000000", scrimAlpha);
    ctx.fillRect(border, border, W - border * 2, headerH);
    const logoW = drawLogo(border + pad * 0.6, border + headerH * 0.2, headerH * 0.6);
    const textX = border + pad * 0.6 + (logoW ? logoW + pad * 0.5 : 0);
    ctx.fillStyle = kit.textColor;
    ctx.textBaseline = "middle";
    const nameSize = fitText(
      ctx,
      name || "Your name",
      W - textX - border - pad,
      Math.round(headerH * 0.42),
      "700",
      FONT_STACK,
    );
    ctx.fillText(name || "Your name", textX, border + headerH * 0.4);
    ctx.font = `500 ${Math.round(nameSize * 0.62)}px ${FONT_STACK}`;
    ctx.fillStyle = withAlpha(kit.accentColor, 0.95);
    ctx.fillText([handle, tagline].filter(Boolean).join("  •  "), textX, border + headerH * 0.72);

    // Footer strip
    const footerH = Math.round(H * (contact ? 0.115 : 0.085));
    const fy = H - border - footerH;
    ctx.fillStyle = withAlpha("#000000", scrimAlpha);
    ctx.fillRect(border, fy, W - border * 2, footerH);
    ctx.fillStyle = kit.textColor;
    if (sponsors) {
      const size = fitText(ctx, sponsors, W - border * 2 - pad * 2, Math.round(footerH * 0.3), "600", FONT_STACK);
      ctx.fillText(sponsors, border + pad, fy + footerH * (contact ? 0.34 : 0.5));
      void size;
    }
    if (contact) {
      ctx.font = `500 ${Math.round(footerH * 0.24)}px ${FONT_STACK}`;
      ctx.fillStyle = withAlpha(kit.textColor, 0.85);
      ctx.fillText(contact, border + pad, fy + footerH * 0.72);
    }
    return;
  }

  if (kit.layout === "corner_card") {
    const cardW = Math.round(W * 0.62);
    const lines = [sponsors, contact].filter(Boolean).length;
    const cardH = Math.round(Math.min(H, W) * (0.16 + lines * 0.055));
    const x = pad;
    const y = H - pad - cardH;
    ctx.fillStyle = withAlpha("#000000", Math.max(scrimAlpha, 0.45));
    roundRect(ctx, x, y, cardW, cardH, Math.round(cardH * 0.14));
    ctx.fill();
    ctx.strokeStyle = withAlpha(kit.accentColor, 0.9);
    ctx.lineWidth = Math.max(2, Math.round(W * 0.004));
    ctx.stroke();

    const innerPad = Math.round(cardH * 0.16);
    const logoBox = Math.round(cardH * 0.32);
    const logoW = drawLogo(x + innerPad, y + innerPad, logoBox);
    const tx = x + innerPad + (logoW ? logoW + innerPad * 0.8 : 0);
    ctx.textBaseline = "middle";
    ctx.fillStyle = kit.textColor;
    const nameSize = fitText(
      ctx,
      name || "Your name",
      cardW - (tx - x) - innerPad,
      Math.round(cardH * 0.26),
      "700",
      FONT_STACK,
    );
    let cy = y + innerPad + logoBox * 0.5;
    ctx.fillText(name || "Your name", tx, cy);
    if (handle || tagline) {
      cy += nameSize * 0.95;
      ctx.font = `500 ${Math.round(nameSize * 0.62)}px ${FONT_STACK}`;
      ctx.fillStyle = withAlpha(kit.accentColor, 0.95);
      ctx.fillText([handle, tagline].filter(Boolean).join("  •  "), x + innerPad, cy);
    }
    if (sponsors) {
      cy += nameSize * 0.9;
      ctx.font = `600 ${Math.round(nameSize * 0.58)}px ${FONT_STACK}`;
      ctx.fillStyle = kit.textColor;
      ctx.fillText(sponsors, x + innerPad, cy);
    }
    if (contact) {
      cy += nameSize * 0.8;
      ctx.font = `500 ${Math.round(nameSize * 0.5)}px ${FONT_STACK}`;
      ctx.fillStyle = withAlpha(kit.textColor, 0.85);
      ctx.fillText(contact, x + innerPad, cy);
    }
    return;
  }

  // lower_band
  const bandH = Math.round(H * (contact ? 0.24 : 0.19));
  const by = H - bandH;
  const grad = ctx.createLinearGradient(0, by - bandH * 0.35, 0, H);
  grad.addColorStop(0, withAlpha("#000000", 0));
  grad.addColorStop(0.35, withAlpha("#000000", scrimAlpha * 0.85));
  grad.addColorStop(1, withAlpha("#000000", Math.min(1, scrimAlpha + 0.2)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, by - bandH * 0.35, W, bandH * 1.35);

  ctx.fillStyle = kit.accentColor;
  ctx.fillRect(0, H - Math.max(4, Math.round(H * 0.008)), W, Math.max(4, Math.round(H * 0.008)));

  ctx.textBaseline = "middle";
  const logoBox = Math.round(bandH * 0.34);
  const logoW = drawLogo(pad, by + bandH * 0.12, logoBox);
  const tx = pad + (logoW ? logoW + pad * 0.6 : 0);
  ctx.fillStyle = kit.textColor;
  const nameSize = fitText(
    ctx,
    name || "Your name",
    W - tx - pad,
    Math.round(bandH * 0.27),
    "700",
    FONT_STACK,
  );
  let y = by + bandH * 0.22;
  ctx.fillText(name || "Your name", tx, y);
  if (handle || tagline) {
    y += nameSize * 0.9;
    ctx.font = `500 ${Math.round(nameSize * 0.6)}px ${FONT_STACK}`;
    ctx.fillStyle = withAlpha(kit.accentColor, 0.95);
    ctx.fillText([handle, tagline].filter(Boolean).join("  •  "), pad, y);
  }
  if (sponsors) {
    y += nameSize * 0.85;
    ctx.font = `600 ${Math.round(nameSize * 0.58)}px ${FONT_STACK}`;
    ctx.fillStyle = kit.textColor;
    ctx.fillText(sponsors, pad, y);
  }
  if (contact) {
    y += nameSize * 0.75;
    ctx.font = `500 ${Math.round(nameSize * 0.5)}px ${FONT_STACK}`;
    ctx.fillStyle = withAlpha(kit.textColor, 0.85);
    ctx.fillText(contact, pad, y);
  }
}

/** Decoded logo images, keyed by data URL, so repeated renders stay cheap. */
const logoCache = new Map<string, HTMLImageElement>();

export function preloadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const cached = logoCache.get(src);
    if (cached?.complete && cached.naturalWidth) {
      resolve(cached);
      return;
    }
    const img = new Image();
    img.onload = () => {
      logoCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("We couldn't read that image file."));
    img.src = src;
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("We couldn't read that file."));
    reader.readAsDataURL(file);
  });
}
