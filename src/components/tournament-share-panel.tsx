import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Facebook, Twitter, Link2, Download, Copy, MessageCircle, MapPin } from "lucide-react";
import { toast } from "sonner";

type EventShare = {
  id: string;
  name: string;
  slug: string;
  start_date: string;
  end_date: string;
  location: string | null;
  description: string | null;
  cover_url: string | null;
  pdga_sanctioned: boolean;
  pdga_tier: string | null;
  entry_fee_cents: number;
  max_players: number | null;
};

export function TournamentSharePanel({
  event,
  registeredCount,
}: {
  event: EventShare;
  registeredCount: number;
}) {
  const flyerRef = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState(() => defaultCaption(event));

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return `/e/${event.slug}`;
    return `${window.location.origin}/e/${event.slug}`;
  }, [event.slug]);

  const spotsLeft = event.max_players ? Math.max(0, event.max_players - registeredCount) : null;

  async function downloadFlyer() {
    if (!flyerRef.current) return;
    try {
      // Image export only loads when the director actually downloads a flyer.
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(flyerRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#0b1220",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${event.slug}-flyer.png`;
      a.click();
      toast.success("Flyer downloaded");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't build that flyer. Give it another shot.",
      );
    }
  }

  function copy(text: string, label = "Copied") {
    navigator.clipboard.writeText(text).then(() => toast.success(label));
  }

  const encoded = encodeURIComponent(`${caption}\n\n${shareUrl}`);
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(caption)}`;
  const twUrl = `https://twitter.com/intent/tweet?text=${encoded}`;
  const smsUrl = `sms:?&body=${encoded}`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Flyer preview */}
      <div className="space-y-3">
        <div className="text-sm font-semibold">Event Flyer</div>
        <div
          ref={flyerRef}
          className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-border"
          style={{
            background: event.cover_url
              ? `linear-gradient(180deg, rgba(11,18,32,0.2) 0%, rgba(11,18,32,0.95) 100%), url(${event.cover_url}) center/cover no-repeat`
              : "linear-gradient(135deg, #0b1220 0%, #1a2b5c 60%, #0f3460 100%)",
            color: "white",
          }}
        >
          <div className="flex h-full flex-col justify-between p-6">
            <div className="flex items-start justify-between">
              <div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest backdrop-blur">
                {event.pdga_sanctioned
                  ? `PDGA ${event.pdga_tier ?? ""} Sanctioned`
                  : "Disc Golf Event"}
              </div>
              <div className="text-right text-[10px] uppercase tracking-widest text-white/70">
                DG Dashboard
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-primary/90">
                Registration Open
              </div>
              <div
                className="text-4xl font-bold leading-tight"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                {event.name}
              </div>
              <div className="text-sm text-white/80">
                {fmtDate(event.start_date)}
                {event.end_date !== event.start_date ? ` – ${fmtDate(event.end_date)}` : ""}
              </div>
              {event.location ? (
                <div className="flex items-center gap-1.5 text-sm text-white/80">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {event.location}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-3 text-xs">
                {event.entry_fee_cents > 0 ? (
                  <span className="rounded-full bg-white/15 px-3 py-1">
                    ${(event.entry_fee_cents / 100).toFixed(0)} entry
                  </span>
                ) : (
                  <span className="rounded-full bg-white/15 px-3 py-1">Free entry</span>
                )}
                {spotsLeft !== null ? (
                  <span className="rounded-full bg-primary/80 px-3 py-1 font-semibold">
                    {spotsLeft} spots left
                  </span>
                ) : null}
              </div>

              <div className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-xs backdrop-blur">
                Register: <span className="font-mono">{shareUrl.replace(/^https?:\/\//, "")}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={downloadFlyer}>
            <Download className="mr-1 h-4 w-4" />
            Download PNG
          </Button>
          <Button variant="outline" onClick={() => copy(shareUrl, "Link copied")}>
            <Link2 className="mr-1 h-4 w-4" />
            Copy link
          </Button>
        </div>
      </div>

      {/* Share caption + platforms */}
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold">Share caption</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Edit — the platform buttons will use this text with the link auto-appended.
          </p>
        </div>
        <Textarea
          rows={8}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => copy(`${caption}\n\n${shareUrl}`, "Caption + link copied")}
          >
            <Copy className="mr-1 h-4 w-4" />
            Copy caption
          </Button>
          <a href={fbUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <Facebook className="mr-1 h-4 w-4" />
              Facebook
            </Button>
          </a>
          <a href={twUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <Twitter className="mr-1 h-4 w-4" />X / Twitter
            </Button>
          </a>
          <a href={smsUrl}>
            <Button variant="outline">
              <MessageCircle className="mr-1 h-4 w-4" />
              SMS
            </Button>
          </a>
        </div>

        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">Public event page</div>
          <div className="mt-1 break-all">{shareUrl}</div>
          <div className="mt-2">
            Anyone with this link can view the event and register. Instagram doesn't accept share
            intents — download the flyer PNG and post it manually with the link in your bio or
            caption.
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function defaultCaption(e: EventShare) {
  const lines = [
    `🥏 ${e.name}`,
    `📅 ${fmtDate(e.start_date)}${e.end_date !== e.start_date ? ` – ${fmtDate(e.end_date)}` : ""}`,
  ];
  if (e.location) lines.push(`📍 ${e.location}`);
  if (e.pdga_sanctioned) lines.push(`🏆 PDGA ${e.pdga_tier ?? ""} Sanctioned`.trim());
  if (e.entry_fee_cents > 0) lines.push(`💵 $${(e.entry_fee_cents / 100).toFixed(0)} entry`);
  lines.push("", "Register through the link 👇");
  return lines.join("\n");
}
