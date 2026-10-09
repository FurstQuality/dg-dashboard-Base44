import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { shareToFeed, type ShareDraft, type ShareVisibility } from "@/lib/share-to-feed";

const VISIBILITY: { value: ShareVisibility; label: string }[] = [
  { value: "public", label: "Everyone" },
  { value: "friends", label: "Friends only" },
];

/**
 * Drop-in "Share to feed" control for any tool in the app.
 * Opens a small dialog with the text already written so posting is one more click.
 */
export function ShareToFeedButton({
  draft,
  label = "Share",
  title = "Share to your feed",
  size = "sm",
  variant = "outline",
  className,
  iconOnly = false,
  onShared,
  leadingIcon,
}: {
  /** Built fresh on open so the text always reflects current data. */
  draft: ShareDraft | (() => ShareDraft);
  label?: string;
  title?: string;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "secondary" | "default";
  className?: string;
  iconOnly?: boolean;
  /** Called after a successful post, e.g. to refresh a feed. */
  onShared?: () => void;
  /** Optional icon shown instead of the default share glyph. */
  leadingIcon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<ShareVisibility>("public");
  const [prepared, setPrepared] = useState<ShareDraft | null>(null);
  const [posting, setPosting] = useState(false);

  function openDialog() {
    const next = typeof draft === "function" ? draft() : draft;
    setPrepared(next);
    setBody(next.body);
    setVisibility(next.visibility ?? "public");
    setOpen(true);
  }

  async function post() {
    if (!prepared) return;
    setPosting(true);
    try {
      await shareToFeed({ ...prepared, body, visibility });
      toast.success("Shared to your feed");
      setOpen(false);
      onShared?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't share that. Try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={openDialog}
        className={className}
        aria-label={iconOnly ? label : undefined}
      >
        {leadingIcon ?? <Share2 className="h-4 w-4" />}
        {iconOnly ? null : <span className="ml-1.5">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Edit the note if you want, then post it.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-24"
            maxLength={2000}
            aria-label="Post text"
          />
          <DialogFooter className="gap-2 sm:justify-between">
            <Select value={visibility} onValueChange={(v) => setVisibility(v as ShareVisibility)}>
              <SelectTrigger className="h-9 w-40 text-xs" aria-label="Who can see this post">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={post} disabled={posting || !body.trim()}>
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
