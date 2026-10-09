import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Share2, Copy, Check, ExternalLink, UserPlus } from "lucide-react";
import { toast } from "sonner";

const PUBLISHED_ORIGIN = "https://dgdashboard.app";

/**
 * Share a PDGA player lookup link. The URL points to the /auth landing page
 * with a `ref=share` flag so the stat preview can encourage signing up
 * naming the player, then land on the rating studio pre-loaded to that PDGA #.
 */
export function SharePlayerDialog({
  open,
  onOpenChange,
  pdgaNumber,
  playerName,
  currentRating,
  faceOff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdgaNumber: string;
  playerName?: string | null;
  currentRating?: number | null;
  /** When both PDGA numbers are known, also share the head-to-head Face Off. */
  faceOff?: { a: string; b: string } | null;
}) {
  const [copied, setCopied] = useState(false);

  // Prefer the published production URL for shareable links, even when the
  // sharer is on a preview or localhost — recipients need a stable public URL.
  const shareUrl = useMemo(() => {
    const origin =
      typeof window !== "undefined" && /lovable\.app|dgdashboard/.test(window.location.host)
        ? window.location.origin
        : PUBLISHED_ORIGIN;
    // Link straight to the player's public stat preview so recipients see the
    // stats first — signing up is a prompt on that page, not a gate in front
    // of it.
    return `${origin}/preview/${encodeURIComponent(pdgaNumber)}?ref=share`;
  }, [pdgaNumber, playerName]);

  // Second shareable link: the head-to-head Face Off between the signed-in
  // player and the player they just looked up.
  const faceOffUrl = useMemo(() => {
    if (!faceOff?.a || !faceOff?.b) return null;
    const origin =
      typeof window !== "undefined" && /lovable\.app|dgdashboard/.test(window.location.host)
        ? window.location.origin
        : PUBLISHED_ORIGIN;
    return `${origin}/compare?a=${encodeURIComponent(faceOff.a)}&b=${encodeURIComponent(faceOff.b)}&ref=invite`;
  }, [faceOff?.a, faceOff?.b]);

  const shareTitle = playerName
    ? `${playerName} (PDGA #${pdgaNumber}) — DG Dashboard`
    : `PDGA #${pdgaNumber} — DG Dashboard`;

  const shareText = currentRating
    ? `${playerName ?? `PDGA #${pdgaNumber}`} is rated ${currentRating}. See full ratings history, projections, and Monte Carlo win odds on DG Dashboard.`
    : `See ${playerName ?? `PDGA #${pdgaNumber}`}'s full ratings history and projections on DG Dashboard.`;

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Link copied — paste it anywhere");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy — long-press the link to copy it manually");
    }
  }

  async function copyLink() {
    await copyText(shareUrl);
  }

  async function nativeShare() {
    if (typeof navigator === "undefined" || !navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
    } catch {
      /* user cancelled — no-op */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Share this player
          </DialogTitle>
          <DialogDescription>
            Send this link to friends, teammates, or your division rivals. Anyone who opens it will
            be invited to create a free DG Dashboard account to view the full ratings history and
            projections.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-start gap-2 text-sm">
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <div className="font-medium">Anyone can open this — no account needed</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  The link opens {playerName ?? `PDGA #${pdgaNumber}`}'s stat page with rating, top
                  rounds and career highlights, and invites them to create a free account for the
                  full picture.
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Stat page link
            </label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={copyLink}
                aria-label="Copy link"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {faceOffUrl ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Face Off link
              </label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={faceOffUrl}
                  className="text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => copyText(faceOffUrl)}
                  aria-label="Copy Face Off link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Opens the head-to-head matchup between you and this player.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" asChild>
            <a href={shareUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Preview
            </a>
          </Button>
          <Button type="button" onClick={nativeShare}>
            <Share2 className="mr-2 h-4 w-4" />
            Share…
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
