import { useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { joinDgimEventChat } from "@/lib/dgim";
import { shareToFeed, organizerDraft } from "@/lib/share-to-feed";

/**
 * One place for a TD to push an official update: it posts into the event's
 * DGIM room as an announcement and can mirror the same message to the feed.
 */
export function AnnouncementComposer({
  eventId,
  eventName,
  eventSlug,
  startDate,
  courseName,
  onSent,
}: {
  eventId: string;
  eventName: string;
  eventSlug: string;
  startDate?: string | null;
  courseName?: string | null;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [toFeed, setToFeed] = useState(false);
  const [sending, setSending] = useState(false);

  async function send() {
    const text = body.trim();
    if (!text) {
      toast.error("Write your update first.");
      return;
    }
    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sign in to send announcements.");

      const conversationId = await joinDgimEventChat("tournament", eventId);
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        body: text,
        is_announcement: true,
      });
      if (error) throw error;

      if (toFeed) {
        const draft = organizerDraft({
          kind: "published",
          eventName,
          startDate: startDate ?? null,
          courseName: courseName ?? null,
          slug: eventSlug,
        });
        await shareToFeed({ ...draft, body: text });
      }

      toast.success(
        toFeed
          ? "Announcement sent to the event chat and your feed."
          : "Announcement sent to the event chat.",
      );
      setBody("");
      setToFeed(false);
      setOpen(false);
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That announcement didn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Megaphone className="mr-1 h-4 w-4" />
          Announce
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send an official update</DialogTitle>
          <DialogDescription>
            Goes to everyone in the {eventName} chat as an announcement, so players see it above
            normal messages.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Players meeting moved to 8:15 at the pavilion — hole 4 is playing to the short basket today."
          aria-label="Announcement message"
        />
        <div className="flex items-center justify-between gap-3 rounded-control border border-border/60 px-3 py-2">
          <Label htmlFor="announce-feed" className="text-sm font-normal">
            Also post this to your feed
          </Label>
          <Switch id="announce-feed" checked={toFeed} onCheckedChange={setToFeed} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={sending}>
            {sending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Megaphone className="mr-1 h-4 w-4" />
            )}
            Send announcement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
