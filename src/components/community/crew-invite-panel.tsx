import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession, initials } from "@/lib/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserPlus, UserCheck, Clock, Send, Users2 } from "lucide-react";
import { toast } from "sonner";
import { addPdgaFriend } from "@/lib/pdga-friends.functions";

type CrewMember = {
  member_id: string;
  group_id: string;
  group_name: string;
  pdga_number: string;
  display_name: string | null;
  color: string | null;
};

type ProfileLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  pdga_number: string | null;
  pdga_rating: number | null;
};

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined" | "blocked";
};

/**
 * Lists every player across the current user's Tournament Tracker crews and lets
 * them either send a DG Dashboard friend request (if the player has an account
 * matched by PDGA number) or generate a share-ready invite link (if they
 * don't). Bridges the Friend Tracker directly to the Friends system.
 */
export function CrewInvitePanel() {
  const { user } = useSession();
  const uid = user?.id ?? null;
  const invite = useServerFn(addPdgaFriend);

  const [members, setMembers] = useState<CrewMember[]>([]);
  const [profileByPdga, setProfileByPdga] = useState<Record<string, ProfileLite>>({});
  const [relByUser, setRelByUser] = useState<Record<string, Friendship>>({});
  const [pendingInvites, setPendingInvites] = useState<Record<string, string>>({}); // pdga -> token
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);

    const { data: groups } = await supabase
      .from("tracker_groups")
      .select("id, name")
      .eq("owner_id", uid);
    const groupIds = (groups ?? []).map((g) => g.id);
    if (!groupIds.length) {
      setMembers([]);
      setLoading(false);
      return;
    }
    const nameById = new Map((groups ?? []).map((g) => [g.id, g.name]));

    const { data: rawMembers } = await supabase
      .from("tracker_group_members")
      .select("id, group_id, pdga_number, display_name, color, is_you")
      .in("group_id", groupIds)
      .order("display_name", { ascending: true, nullsFirst: false });

    const list: CrewMember[] = (
      (rawMembers ?? []) as Array<{
        id: string;
        group_id: string;
        pdga_number: string;
        display_name: string | null;
        color: string | null;
        is_you: boolean;
      }>
    )
      .filter((m) => !m.is_you)
      .map((m) => ({
        member_id: m.id,
        group_id: m.group_id,
        group_name: nameById.get(m.group_id) ?? "Crew",
        pdga_number: m.pdga_number,
        display_name: m.display_name,
        color: m.color,
      }));

    // Deduplicate by PDGA number, keeping the first group we see.
    const seen = new Set<string>();
    const unique: CrewMember[] = [];
    for (const m of list) {
      if (seen.has(m.pdga_number)) continue;
      seen.add(m.pdga_number);
      unique.push(m);
    }
    setMembers(unique);

    const pdgaNums = unique.map((m) => m.pdga_number);
    if (pdgaNums.length) {
      const [{ data: profs }, { data: invs }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, pdga_number, pdga_rating")
          .in("pdga_number", pdgaNums),
        supabase
          .from("pdga_friend_invites")
          .select("pdga_number, invite_token, status")
          .eq("inviter_id", uid)
          .in("pdga_number", pdgaNums)
          .eq("status", "pending"),
      ]);

      const pMap: Record<string, ProfileLite> = {};
      const profileIds: string[] = [];
      ((profs ?? []) as ProfileLite[]).forEach((p) => {
        if (p.pdga_number) pMap[p.pdga_number] = p;
        profileIds.push(p.id);
      });
      setProfileByPdga(pMap);

      const iMap: Record<string, string> = {};
      ((invs ?? []) as Array<{ pdga_number: string; invite_token: string }>).forEach((i) => {
        iMap[i.pdga_number] = i.invite_token;
      });
      setPendingInvites(iMap);

      if (profileIds.length) {
        const { data: fs } = await supabase
          .from("friendships")
          .select("id, requester_id, addressee_id, status")
          .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
        const rel: Record<string, Friendship> = {};
        ((fs ?? []) as Friendship[]).forEach((r) => {
          const other = r.requester_id === uid ? r.addressee_id : r.requester_id;
          rel[other] = r;
        });
        setRelByUser(rel);
      }
    }

    setLoading(false);
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareUrl = (token: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/invite/pdga/${encodeURIComponent(token)}`;

  async function inviteOrRequest(m: CrewMember) {
    setBusy(m.pdga_number);
    try {
      const res = await invite({ data: { pdgaNumber: m.pdga_number } });
      if (res.kind === "friend_request_sent") {
        toast.success(
          `Friend request sent to ${(res.profile as { display_name: string }).display_name}`,
        );
      } else if (res.kind === "already_related") {
        toast.info("You're already connected with this player.");
      } else if (res.kind === "self") {
        toast.info("That's your own PDGA number.");
      } else if (res.kind === "invite_created") {
        const token = (res.invite as { invite_token: string }).invite_token;
        const url = shareUrl(token);
        const text = `${m.display_name ?? `PDGA #${m.pdga_number}`} — join me on DG Dashboard so we can track events, ratings, and rounds together. ${url}`;
        const nav =
          typeof navigator !== "undefined"
            ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> })
            : null;
        if (nav?.share) {
          try {
            await nav.share({ title: "DG Dashboard invite", text, url });
          } catch {
            /* cancel */
          }
        } else {
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Invite link copied — paste it anywhere.");
          } catch {
            toast.success("Invite created — see Pending invites in Find tab.");
          }
        }
      }
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create invite");
    } finally {
      setBusy(null);
    }
  }

  async function shareExisting(m: CrewMember, token: string) {
    const url = shareUrl(token);
    const text = `${m.display_name ?? `PDGA #${m.pdga_number}`} — join me on DG Dashboard. ${url}`;
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> })
        : null;
    if (nav?.share) {
      try {
        await nav.share({ title: "DG Dashboard invite", text, url });
      } catch {
        /* cancel */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  const total = members.length;
  const onApp = useMemo(
    () => members.filter((m) => profileByPdga[m.pdga_number]).length,
    [members, profileByPdga],
  );

  if (!uid) return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Loading crew invites…
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <Users2 className="mx-auto mb-2 h-5 w-5" />
        You haven't added anyone to a{" "}
        <Link to="/tracker" className="text-primary underline">
          Tournament Tracker crew
        </Link>{" "}
        yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{total}</span> crew member
          {total === 1 ? "" : "s"}
          {" · "}
          <span className="font-semibold text-foreground">{onApp}</span> already on DG Dashboard
        </span>
        <Link to="/tracker" className="text-primary hover:underline">
          Manage crews
        </Link>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {members.map((m) => {
          const profile = profileByPdga[m.pdga_number] ?? null;
          const rel = profile ? relByUser[profile.id] : null;
          const invToken = pendingInvites[m.pdga_number];
          const name = profile?.display_name ?? m.display_name ?? `Player #${m.pdga_number}`;

          return (
            <li key={m.member_id} className="flex items-center gap-3 p-3">
              <div className="relative shrink-0">
                {profile ? (
                  <Link to="/u/$username" params={{ username: profile.username }}>
                    <Avatar className="h-10 w-10">
                      {profile.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
                      <AvatarFallback>{initials(profile.display_name)}</AvatarFallback>
                    </Avatar>
                  </Link>
                ) : (
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{initials(name)}</AvatarFallback>
                  </Avatar>
                )}
                {m.color ? (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                    style={{ background: m.color }}
                    aria-hidden
                  />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {profile ? (
                    <Link
                      to="/u/$username"
                      params={{ username: profile.username }}
                      className="hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  PDGA {m.pdga_number}
                  {profile?.pdga_rating ? ` · ${profile.pdga_rating}` : ""}
                  {" · "}
                  <span className="text-muted-foreground/80">{m.group_name}</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {profile && rel?.status === "accepted" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-primary">
                    <UserCheck className="h-3.5 w-3.5" /> Friends
                  </span>
                ) : profile && rel?.status === "pending" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {rel.requester_id === uid ? "Requested" : "Awaiting you"}
                  </span>
                ) : profile ? (
                  <Button
                    size="sm"
                    onClick={() => inviteOrRequest(m)}
                    disabled={busy === m.pdga_number}
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" /> Add friend
                  </Button>
                ) : invToken ? (
                  <Button size="sm" variant="outline" onClick={() => shareExisting(m, invToken)}>
                    <Send className="mr-1 h-3.5 w-3.5" /> Share invite
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => inviteOrRequest(m)}
                    disabled={busy === m.pdga_number}
                  >
                    <Send className="mr-1 h-3.5 w-3.5" />
                    {busy === m.pdga_number ? "Preparing…" : "Invite to app"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
