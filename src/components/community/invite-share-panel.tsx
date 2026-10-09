import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Share2, MessageCircle, Mail, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Props = {
  url: string;
  title?: string;
  message?: string;
  compact?: boolean;
};

export function InviteSharePanel({
  url,
  title = "Join me on DG Dashboard",
  message,
  compact,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const text = useMemo(() => message ?? `${title} — ${url}`, [title, message, url]);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    // Loaded on demand so the QR encoder never ships in the page's first chunk.
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toCanvas(canvas, url, { width: compact ? 140 : 200, margin: 1 }),
      )
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, compact]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function nativeShare() {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title, text: message, url });
      } catch {
        /* user cancelled */
      }
      return;
    }
    await copy();
  }

  const encoded = encodeURIComponent(text);
  const encUrl = encodeURIComponent(url);

  return (
    <div
      className={
        "rounded-2xl border border-border/60 bg-card/60 p-5 " +
        (compact ? "space-y-3" : "space-y-4")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold tracking-tight">{title}</h3>
          <p className="text-xs text-muted-foreground">
            Share this link anywhere — SMS, Messenger, IG DM, email.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <canvas
          ref={canvasRef}
          className={
            "rounded-lg bg-white p-2 border border-border/40 " + (ready ? "" : "opacity-40")
          }
        />
        <div className="flex-1 w-full space-y-2">
          <div className="flex gap-2">
            <Input
              readOnly
              value={url}
              className="text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button size="icon" variant="outline" aria-label="Copy invite link" onClick={copy}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={nativeShare}>
              <Share2 className="h-4 w-4 mr-1" /> Share
            </Button>
            <a
              href={`sms:?&body=${encoded}`}
              className="inline-flex items-center h-9 px-3 rounded-md border border-border/60 text-sm hover:bg-accent"
            >
              <MessageCircle className="h-4 w-4 mr-1" /> SMS
            </a>
            <a
              href={`https://wa.me/?text=${encoded}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center h-9 px-3 rounded-md border border-border/60 text-sm hover:bg-accent"
            >
              WhatsApp
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encUrl}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center h-9 px-3 rounded-md border border-border/60 text-sm hover:bg-accent"
            >
              Facebook
            </a>
            <a
              href={`https://www.facebook.com/dialog/send?app_id=140586622674265&link=${encUrl}&redirect_uri=${encUrl}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center h-9 px-3 rounded-md border border-border/60 text-sm hover:bg-accent"
            >
              Messenger
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=${encoded}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center h-9 px-3 rounded-md border border-border/60 text-sm hover:bg-accent"
            >
              <Twitter className="h-4 w-4 mr-1" /> X / Twitter
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(title)}&body=${encoded}`}
              className="inline-flex items-center h-9 px-3 rounded-md border border-border/60 text-sm hover:bg-accent"
            >
              <Mail className="h-4 w-4 mr-1" /> Email
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Instagram doesn't allow prefilled DMs — copy the link and paste it into a DM.
          </p>
        </div>
      </div>
    </div>
  );
}
