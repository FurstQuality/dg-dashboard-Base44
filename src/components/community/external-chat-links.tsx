import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, ExternalLink, MessagesSquare } from "lucide-react";
import { toast } from "sonner";

export type ExtOwnerType = "club" | "league" | "tournament";
export type Platform =
  | "facebook_group"
  | "facebook_messenger"
  | "whatsapp"
  | "discord"
  | "groupme"
  | "telegram"
  | "slack"
  | "other";

type Row = {
  id: string;
  owner_type: ExtOwnerType;
  owner_id: string;
  platform: Platform;
  url: string;
  label: string | null;
  created_by: string;
};

const PLATFORM_LABEL: Record<Platform, string> = {
  facebook_group: "Facebook Group",
  facebook_messenger: "Facebook Messenger",
  whatsapp: "WhatsApp",
  discord: "Discord",
  groupme: "GroupMe",
  telegram: "Telegram",
  slack: "Slack",
  other: "Other",
};

function detectPlatform(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes("facebook.com/groups/")) return "facebook_group";
  if (u.includes("m.me") || u.includes("messenger.com")) return "facebook_messenger";
  if (u.includes("wa.me") || u.includes("chat.whatsapp.com")) return "whatsapp";
  if (u.includes("discord.gg") || u.includes("discord.com/invite")) return "discord";
  if (u.includes("groupme.com")) return "groupme";
  if (u.includes("t.me")) return "telegram";
  if (u.includes("slack.com")) return "slack";
  return "other";
}

export function ExternalChatLinks({
  ownerType,
  ownerId,
  canManage,
}: {
  ownerType: ExtOwnerType;
  ownerId: string;
  canManage: boolean;
}) {
  const { user } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("external_chat_links")
      .select("*")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    // A failed read used to look identical to "this group has no chat links",
    // which quietly hid links that do exist.
    setLoadFailed(!!error);
    if (!error) setRows((data ?? []) as Row[]);
  }, [ownerType, ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!user || !url.trim()) return;
    try {
      new URL(url);
    } catch {
      toast.error("That doesn't look like a valid URL");
      return;
    }
    setAdding(true);
    const platform = detectPlatform(url);
    const { error } = await supabase.from("external_chat_links").insert({
      owner_type: ownerType,
      owner_id: ownerId,
      platform,
      url: url.trim(),
      label: label.trim() || null,
      created_by: user.id,
    });
    setAdding(false);
    if (error) return toast.error(error.message);
    setUrl("");
    setLabel("");
    toast.success("Chat link saved — no message was sent to the group");
    void load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("external_chat_links").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  }

  if (rows.length === 0 && !canManage && !loadFailed) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-3">
      <header className="flex items-center gap-2">
        <MessagesSquare className="h-5 w-5 text-primary" />
        <h3 className="font-bold tracking-tight">Community chats</h3>
      </header>

      {loadFailed ? (
        <div className="text-sm text-muted-foreground">
          We couldn&apos;t load the chat links.{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No external chats linked yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/60 p-3"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{r.label ?? PLATFORM_LABEL[r.platform]}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {PLATFORM_LABEL[r.platform]} · {r.url}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href={r.url} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-4 w-4 mr-1" /> Open
                  </Button>
                </a>
                {(canManage || user?.id === r.created_by) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    aria-label="Remove chat link"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="pt-2 border-t border-border/40 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label htmlFor="chat-url" className="text-xs">
                Chat URL
              </Label>
              <Input
                id="chat-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="facebook.com/groups/... , chat.whatsapp.com/... , discord.gg/..."
              />
            </div>
            <div>
              <Label htmlFor="chat-label" className="text-xs">
                Label (optional)
              </Label>
              <Input
                id="chat-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Members chat"
              />
            </div>
            <div className="self-end">
              <Button onClick={add} disabled={adding || !url.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Paste an invite link from Facebook Group, WhatsApp, Discord, GroupMe, Telegram, Slack,
            or Messenger. Only the link is saved — Ace never posts, messages, or announces anything
            in the linked chat. Members see a one-tap "Open" button and communicate inside that chat
            as normal.
          </p>
        </div>
      )}
    </section>
  );
}
