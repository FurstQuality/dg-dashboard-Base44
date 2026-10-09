import { useState } from "react";
import { Link2, MessageSquare, Share2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareToChatDialog } from "@/components/feed/share-to-chat-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

/** Share options for a post: device share sheet, copy link, or send in a chat. */
export function ShareSheet({ postId, body }: { postId: string; body?: string | null }) {
  const [chatOpen, setChatOpen] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/p/${postId}`;
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
      return true;
    } catch {
      toast.error("We couldn't copy that link.");
      return false;
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: "DG Dashboard",
        text: body?.slice(0, 140) || "Check out this post on DG Dashboard",
        url,
      });
    } catch {
      /* the player closed the share sheet — nothing to report */
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" aria-label="Share post">
          <Share2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {canNativeShare ? (
          <DropdownMenuItem onSelect={() => void nativeShare()}>
            <Smartphone className="mr-2 h-4 w-4" /> Share…
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => void copyLink()}>
          <Link2 className="mr-2 h-4 w-4" /> Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setChatOpen(true)}>
          <MessageSquare className="mr-2 h-4 w-4" /> Send in a chat
        </DropdownMenuItem>
      </DropdownMenuContent>
      <ShareToChatDialog
        open={chatOpen}
        onOpenChange={setChatOpen}
        postId={postId}
        body={body}
      />
    </DropdownMenu>
  );
}
