import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { loadDgimInbox, conversationLabel, type DgimConversation } from "@/lib/dgim";

/**
 * Sends a post link into an existing chat. The picker lists the player's
 * conversations so sharing stays one tap instead of copy-paste.
 */
export function ShareToChatDialog({
  open,
  onOpenChange,
  postId,
  body,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  postId: string;
  body?: string | null;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [convs, setConvs] = useState<DgimConversation[] | null>(null);
  const [q, setQ] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id ?? null;
      if (!alive) return;
      setUserId(id);
      if (!id) {
        setConvs([]);
        return;
      }
      try {
        const inbox = await loadDgimInbox(id);
        if (alive) setConvs(inbox);
      } catch {
        if (alive) setConvs([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const list = convs ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list.slice(0, 25);
    return list.filter((c) => conversationLabel(c).toLowerCase().includes(needle)).slice(0, 25);
  }, [convs, q]);

  async function send(c: DgimConversation) {
    if (!userId) return;
    const url = typeof window === "undefined" ? "" : `${window.location.origin}/p/${postId}`;
    const snippet = body?.trim().slice(0, 120);
    const text = snippet ? `${snippet}${body!.length > 120 ? "…" : ""}\n${url}` : url;
    setSending(c.id);
    const { error } = await supabase.from("messages").insert({
      conversation_id: c.id,
      sender_id: userId,
      body: text,
    });
    setSending(null);
    if (error) {
      toast.error("That message didn't send. Try again.");
      return;
    }
    toast.success(`Sent to ${conversationLabel(c)}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send this post in a chat</DialogTitle>
          <DialogDescription>
            Pick a conversation and we'll drop the post in with a link.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            className="pl-9"
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {convs === null ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your chats…
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No chats yet — start one in DGIM and you can share posts straight into it.
            </p>
          ) : (
            filtered.map((c) => {
              const label = conversationLabel(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void send(c)}
                  disabled={sending !== null}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted disabled:opacity-60"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={c.other?.avatar_url ?? undefined} alt="" />
                    <AvatarFallback>{label.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {label}
                    </span>
                    {c.preview ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.preview}
                      </span>
                    ) : null}
                  </span>
                  {sending === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Send className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
