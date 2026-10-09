import { useState } from "react";
import { Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { pushToUser } from "@/lib/push.functions";

/**
 * Shares an existing post into the viewer's own feed, optionally with their own
 * take. The repost keeps a reference to the original so the quoted card renders.
 */
export function RepostDialog({
  postId,
  postAuthorId,
  shareCount,
  currentUserId,
  onReposted,
}: {
  postId: string;
  postAuthorId: string;
  shareCount: number;
  currentUserId: string | null;
  onReposted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState(shareCount);

  async function repost() {
    if (!currentUserId) return toast.error("Sign in to share posts");
    setSaving(true);
    // One database action creates the share and bumps the counter, so counts
    // stay right even when several players share the same post at once.
    const { error } = await supabase.rpc("repost_post", {
      _post_id: postId,
      _body: body.trim() || undefined,
    });
    if (error) {
      setSaving(false);
      toast.error("We couldn't share that post. Try again.");
      return;
    }
    setCount((c) => c + 1);
    setSaving(false);
    setOpen(false);
    setBody("");
    toast.success("Shared to your feed.");
    if (postAuthorId !== currentUserId) {
      void supabase.rpc("notify_user", {
        _user_id: postAuthorId,
        _type: "share",
        _post_id: postId,
      });
      void pushToUser({
        data: {
          userId: postAuthorId,
          title: "Post shared",
          body: "Someone shared your post.",
          url: `/p/${postId}`,
          tag: `share:${postId}`,
        },
      }).catch(() => {});
    }
    onReposted?.();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5"
        aria-label="Share to your feed"
        onClick={() => setOpen(true)}
      >
        <Repeat2 className="h-4 w-4" />
        {count > 0 ? <span className="text-xs tabular-nums">{count}</span> : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share to your feed</DialogTitle>
            <DialogDescription>Add your own take, or share it as-is.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Say something about this post (optional)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void repost()} disabled={saving}>
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
