import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getFriendSuggestions } from "@/lib/friend-suggestions.functions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserPlus, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { initials } from "@/lib/current-user";
import { suggestionReason } from "@/lib/friend-suggestions";

type Suggested = {
  user_id: string;
  mutual_count: number;
  reason: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export function SuggestedCrewWidget({ userId }: { userId: string | undefined }) {
  const [rows, setRows] = useState<Suggested[] | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const fetchSuggestions = useServerFn(getFriendSuggestions);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const list = await fetchSuggestions({ data: { limit: 5 } });
        if (!alive || !list.length) {
          if (alive) setRows([]);
          return;
        }
        const ids = list.map((r) => r.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", ids);
        const map = new Map((profiles ?? []).map((p) => [p.id, p]));
        const merged: Suggested[] = list
          .map((r) => {
            const p = map.get(r.user_id);
            return {
              user_id: r.user_id,
              mutual_count: r.mutual_count,
              reason: suggestionReason(r),
              username: (p?.username as string | null) ?? null,
              display_name: (p?.display_name as string | null) ?? null,
              avatar_url: (p?.avatar_url as string | null) ?? null,
            };
          })
          .filter((r) => !!r.display_name);
        if (alive) setRows(merged);
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, fetchSuggestions]);

  async function add(target: string) {
    if (!userId) return;
    const { error } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: target,
      status: "pending",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    // A database trigger notifies the player about the waiting request.
    setSent((prev) => new Set(prev).add(target));
    toast.success("Request sent. It stays pending until they accept.");
  }

  if (rows !== null && rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> Add to your crew
        </h3>
        <Link to="/friends" className="text-[11px] font-medium text-primary hover:underline">
          More
        </Link>
      </div>
      <p className="mb-2 text-[12px] leading-snug text-muted-foreground">
        Players suggested from friends you share and courses you both play.
      </p>
      {rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, 4).map((r) => (
            <li key={r.user_id} className="flex items-center gap-2">
              <Link
                to="/u/$username"
                params={{ username: r.username ?? r.user_id }}
                className="shrink-0"
              >
                <Avatar className="h-9 w-9">
                  {r.avatar_url ? <AvatarImage src={r.avatar_url} /> : null}
                  <AvatarFallback>{initials(r.display_name)}</AvatarFallback>
                </Avatar>
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  to="/u/$username"
                  params={{ username: r.username ?? r.user_id }}
                  className="block truncate text-xs font-medium hover:underline"
                >
                  {r.display_name}
                </Link>
                <div className="truncate text-[11px] text-muted-foreground">
                  {r.reason ?? "New player nearby"}
                </div>
              </div>
              <Button
                size="sm"
                variant={sent.has(r.user_id) ? "outline" : "secondary"}
                className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                onClick={() => add(r.user_id)}
                disabled={sent.has(r.user_id)}
              >
                <UserPlus className="h-3 w-3" />
                {sent.has(r.user_id) ? "Sent" : "Add"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
