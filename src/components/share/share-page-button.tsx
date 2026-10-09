import { useState } from "react";
import { Link2, Share2, Smartphone, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mascot } from "@/components/mascot";
import { InviteSharePanel } from "@/components/community/invite-share-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Public app address used when we invite someone who isn't here yet. */
export const APP_SHARE_URL = "https://dgdashboard.app";

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("We couldn't copy that link. Try again.");
  }
}

async function deviceShare(title: string, text: string, url: string, fallbackNote: string) {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title, text, url });
    } catch {
      /* the player closed the share sheet — nothing to report */
    }
    return;
  }
  await copyText(url, fallbackNote);
}

/**
 * Share control that sits in every page header: send this page to a friend,
 * copy its link, or invite someone who isn't on DG Dashboard yet.
 */
export function SharePageButton({
  title,
  label = "Share",
}: {
  /** Page title, used as the share text so the message reads naturally. */
  title: string;
  label?: string;
}) {
  const pageUrl = typeof window === "undefined" ? APP_SHARE_URL : window.location.href;
  const inviteText = "Come track rounds, ratings and events with me on DG Dashboard.";
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Send this to a friend — the more players here, the better everyone's stats get.
          </DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() =>
              void deviceShare(title, `${title} on DG Dashboard`, pageUrl, "Page link copied")
            }
          >
            <Smartphone className="mr-2 h-4 w-4" /> Share this page…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyText(pageUrl, "Page link copied")}>
            <Link2 className="mr-2 h-4 w-4" /> Copy page link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" /> Invite a friend to the app
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Invite a friend to DG Dashboard</DialogTitle>
            <DialogDescription>{inviteText}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/15 via-secondary/10 to-accent/15 p-4">
            <Mascot name="ace" pose="action" size={96} className="h-20 w-20 shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-lg font-bold leading-tight">Bring your card mates</p>
              <p className="text-sm text-muted-foreground">
                Rounds, ratings, leagues and tournaments — all in one place. Ace will show them
                around.
              </p>
            </div>
          </div>
          <InviteSharePanel
            url={APP_SHARE_URL}
            title="Join me on DG Dashboard"
            message={inviteText}
            compact
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
