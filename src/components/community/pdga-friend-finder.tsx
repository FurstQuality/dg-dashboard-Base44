import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Trash2, Copy, Check, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { addPdgaFriend, listMyPdgaInvites, cancelPdgaInvite } from "@/lib/pdga-friends.functions";
import { useSession } from "@/lib/current-user";
import { communityKeys, COMMUNITY_STALE } from "@/lib/community-queries";

type Invite = {
  id: string;
  pdga_number: string;
  display_name: string | null;
  pdga_rating: number | null;
  location: string | null;
  invite_token: string;
  status: string;
  created_at: string;
};

/**
 * Add a friend by PDGA number. If they're already on DG Dashboard, sends a friend
 * request. Otherwise, creates a shareable invite pre-filled with their PDGA
 * stats and a link that converts to a friendship on signup.
 */
export function PdgaFriendFinder() {
  const add = useServerFn(addPdgaFriend);
  const listInvites = useServerFn(listMyPdgaInvites);
  const cancel = useServerFn(cancelPdgaInvite);

  const { user } = useSession();
  const queryClient = useQueryClient();
  const [pdga, setPdga] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Cached by user, so mounting this panel on more than one tab reads once.
  const invitesQuery = useQuery({
    queryKey: communityKeys.pdgaInvites(user?.id),
    queryFn: async () => ((await listInvites()) ?? []) as Invite[],
    staleTime: COMMUNITY_STALE.short,
  });
  const invites = invitesQuery.data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: communityKeys.pdgaInvites(user?.id) });
  };

  async function submit() {
    const num = pdga.replace(/\D/g, "");
    if (!num) return toast.error("Enter a PDGA number");
    setBusy(true);
    try {
      const res = await add({ data: { pdgaNumber: num } });
      if (res.kind === "friend_request_sent") {
        toast.success(`Friend request sent to ${(res.profile as any).display_name}`);
      } else if (res.kind === "already_related") {
        toast.info("You're already connected with this player.");
      } else if (res.kind === "self") {
        toast.info("That's your own PDGA number.");
      } else if (res.kind === "invite_created") {
        toast.success("Invite ready — share the link to bring them in.");
        refresh();
      }
      setPdga("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  function shareUrl(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/invite/pdga/${encodeURIComponent(token)}`;
  }

  async function copy(token: string) {
    const url = shareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
      toast.success("Invite link copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function nativeShare(inv: Invite) {
    const url = shareUrl(inv.invite_token);
    const text = `${inv.display_name ?? `PDGA #${inv.pdga_number}`} — join me on DG Dashboard and see your rating history, projections, and events.`;
    if (
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share
    ) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: "DG Dashboard invite",
          text,
          url,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      copy(inv.invite_token);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
          <Sparkles className="h-4 w-4" /> Add by PDGA number
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1 space-y-1.5">
            <Label htmlFor="pdga-friend">PDGA number</Label>
            <Input
              id="pdga-friend"
              inputMode="numeric"
              placeholder="e.g. 12345"
              value={pdga}
              onChange={(e) => setPdga(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
          <Button onClick={submit} disabled={busy}>
            <UserPlus className="mr-1 h-4 w-4" /> {busy ? "Looking up…" : "Find & add"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          On DG Dashboard → sends a friend request. Not yet on DG Dashboard → creates a share link
          with their stats so you can invite them.
        </p>
      </div>

      {invites.length ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="text-sm font-semibold">
              Pending PDGA invites ({invites.filter((i) => i.status === "pending").length})
            </div>
          </div>
          <ul className="divide-y divide-border">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {inv.display_name ?? `Player #${inv.pdga_number}`}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                      PDGA {inv.pdga_number}
                    </span>
                    {inv.status === "joined" ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase text-emerald-500">
                        Joined
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {inv.pdga_rating ? `Rating ${inv.pdga_rating}` : "Rating —"}
                    {inv.location ? ` · ${inv.location}` : ""}
                  </div>
                </div>
                {inv.status === "pending" ? (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => copy(inv.invite_token)}>
                      {copied === inv.invite_token ? (
                        <Check className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1 h-3.5 w-3.5" />
                      )}
                      Copy link
                    </Button>
                    <Button size="sm" onClick={() => nativeShare(inv)}>
                      <Send className="mr-1 h-3.5 w-3.5" /> Share
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel invite"
                      onClick={async () => {
                        await cancel({ data: { id: inv.id } });
                        refresh();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Invite fulfilled</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
