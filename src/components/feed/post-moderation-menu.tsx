import { useState } from "react";
import { Flag, EyeOff, VolumeX, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invalidateFeedAudience } from "@/lib/feed";

export const REPORT_REASONS = [
  { value: "spam", label: "Spam or scam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech" },
  { value: "false_score", label: "Fake round or score" },
  { value: "nudity", label: "Nudity or graphic content" },
  { value: "other", label: "Something else" },
] as const;

/**
 * Viewer-side controls on someone else's post: report to admins, hide the post
 * from your own feed, or mute the author entirely.
 */
export function PostModerationMenu({
  postId,
  authorId,
  authorName,
  currentUserId,
  onHidden,
}: {
  postId: string;
  authorId: string;
  authorName: string;
  currentUserId: string | null;
  onHidden?: () => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitReport() {
    if (!currentUserId) return toast.error("Sign in to report a post");
    setSaving(true);
    const { error } = await supabase.from("post_reports").insert({
      post_id: postId,
      reporter_id: currentUserId,
      reason,
      details: details.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505" || error.message.includes("duplicate")
          ? "You already reported this post."
          : "We couldn't send that report. Try again.",
      );
      return;
    }
    setReportOpen(false);
    setDetails("");
    toast.success("Report sent. Our team will review it.");
  }

  async function hidePost() {
    if (!currentUserId) return toast.error("Sign in to hide posts");
    const { error } = await supabase
      .from("hidden_posts")
      .insert({ post_id: postId, user_id: currentUserId });
    if (error) return toast.error("We couldn't hide that post. Try again.");
    toast.success("Hidden from your feed.", {
      action: {
        label: "Undo",
        onClick: () => {
          void (async () => {
            const { error: undoError } = await supabase
              .from("hidden_posts")
              .delete()
              .eq("post_id", postId)
              .eq("user_id", currentUserId);
            if (undoError) return toast.error("We couldn't bring that post back.");
            invalidateFeedAudience();
            toast.success("Post is back in your feed.");
            onHidden?.();
          })();
        },
      },
    });
    invalidateFeedAudience();
    onHidden?.();
  }

  async function muteAuthor() {
    if (!currentUserId) return toast.error("Sign in to mute players");
    const { error } = await supabase
      .from("muted_authors")
      .insert({ muted_id: authorId, user_id: currentUserId });
    if (error) return toast.error("We couldn't mute that player. Try again.");
    toast.success(`${authorName} muted.`, {
      action: {
        label: "Undo",
        onClick: () => {
          void (async () => {
            const { error: undoError } = await supabase
              .from("muted_authors")
              .delete()
              .eq("muted_id", authorId)
              .eq("user_id", currentUserId);
            if (undoError) return toast.error(`We couldn't unmute ${authorName}.`);
            invalidateFeedAudience();
            toast.success(`${authorName} is unmuted.`);
            onHidden?.();
          })();
        },
      },
    });
    invalidateFeedAudience();
    onHidden?.();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Post options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void hidePost()}>
            <EyeOff className="mr-2 h-4 w-4" /> Hide this post
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void muteAuthor()}>
            <VolumeX className="mr-2 h-4 w-4" /> Mute {authorName}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              setReportOpen(true);
            }}
          >
            <Flag className="mr-2 h-4 w-4" /> Report post
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this post</DialogTitle>
            <DialogDescription>
              Tell us what's wrong. Reports go to the DG Dashboard review queue — the author isn't
              notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Add any detail that helps us review it (optional)"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitReport()} disabled={saving}>
              Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
