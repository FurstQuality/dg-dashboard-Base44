import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail, Phone, Users, UserPlus, X, Check, Send } from "lucide-react";
import {
  createEventInvites,
  listEventInvites,
  cancelInvite,
  getInvitePickerData,
} from "@/lib/event-invites.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type EventKind = "community" | "tournament" | "league" | "round";

interface Props {
  eventKind: EventKind;
  eventId: string;
  eventTitle?: string;
  eventStartsAt?: string;
  eventLocation?: string;
}

type PendingInvite = {
  key: string;
  invitee_user_id?: string;
  invitee_email?: string;
  invitee_phone?: string;
  invitee_name?: string;
  label: string;
  channel: "app" | "email" | "phone";
};

export function EventInvitePanel({
  eventKind,
  eventId,
  eventTitle,
  eventStartsAt,
  eventLocation,
}: Props) {
  const qc = useQueryClient();
  const fetchPicker = useServerFn(getInvitePickerData);
  const fetchInvites = useServerFn(listEventInvites);
  const sendInvites = useServerFn(createEventInvites);
  const cancelFn = useServerFn(cancelInvite);

  const picker = useQuery({
    queryKey: ["invite-picker"],
    queryFn: () => fetchPicker(),
    staleTime: 60_000,
  });
  const invitesQ = useQuery({
    queryKey: ["event-invites", eventKind, eventId],
    queryFn: () => fetchInvites({ data: { event_kind: eventKind, event_id: eventId } }),
  });

  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const friends = picker.data?.friends ?? [];
  const crews = picker.data?.crews ?? [];
  const crewMembers = picker.data?.crewMembers ?? {};

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        (f.display_name ?? "").toLowerCase().includes(q) ||
        (f.username ?? "").toLowerCase().includes(q),
    );
  }, [friends, search]);

  const pendingKeys = new Set(pending.map((p) => p.key));

  function addPending(inv: PendingInvite) {
    if (pendingKeys.has(inv.key)) return;
    setPending((p) => [...p, inv]);
  }
  function removePending(key: string) {
    setPending((p) => p.filter((x) => x.key !== key));
  }

  function addEmail() {
    const e = emailInput.trim().toLowerCase();
    if (!e) return;
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    if (!ok) {
      toast.error("Enter a valid email");
      return;
    }
    addPending({
      key: `email:${e}`,
      invitee_email: e,
      invitee_name: nameInput.trim() || undefined,
      label: nameInput.trim() ? `${nameInput.trim()} <${e}>` : e,
      channel: "email",
    });
    setEmailInput("");
    setNameInput("");
  }
  function addPhone() {
    const p = phoneInput.trim();
    if (!p) return;
    if (p.replace(/\D/g, "").length < 7) {
      toast.error("Enter a valid phone number");
      return;
    }
    addPending({
      key: `phone:${p}`,
      invitee_phone: p,
      invitee_name: nameInput.trim() || undefined,
      label: nameInput.trim() ? `${nameInput.trim()} (${p})` : p,
      channel: "phone",
    });
    setPhoneInput("");
    setNameInput("");
  }

  function addCrew(crewId: string, crewName: string) {
    const members = crewMembers[crewId] ?? [];
    let added = 0;
    for (const m of members) {
      const label = m.display_name || "Crew member";
      const key = `crew:${crewId}:${label}`;
      if (pendingKeys.has(key)) continue;
      addPending({
        key,
        invitee_name: m.display_name ?? undefined,
        label: `${label} (via ${crewName})`,
        channel: "app",
      });
      added += 1;
    }
    if (added === 0) toast.info(`No new members to add from ${crewName}`);
  }

  const sendMut = useMutation({
    mutationFn: async () => {
      const invites = pending.map((p) => ({
        invitee_user_id: p.invitee_user_id,
        invitee_email: p.invitee_email,
        invitee_phone: p.invitee_phone,
        invitee_name: p.invitee_name,
      }));
      return sendInvites({
        data: {
          event_kind: eventKind,
          event_id: eventId,
          event_title: eventTitle,
          event_starts_at: eventStartsAt,
          event_location: eventLocation,
          personal_message: message.trim() || undefined,
          invites,
        },
      });
    },
    onSuccess: (res: any) => {
      const parts = [
        `${res.emailed ?? 0} emailed`,
        `${res.texted ?? 0} texted`,
        `${res.notified ?? 0} in-app`,
      ];
      toast.success(
        `Sent ${res.created} invite${res.created === 1 ? "" : "s"} · ${parts.join(" · ")}`,
      );
      if (res.sms_skipped_unconfigured > 0) {
        toast.info(
          `${res.sms_skipped_unconfigured} phone invite${res.sms_skipped_unconfigured === 1 ? "" : "s"} saved — SMS delivery isn't configured yet. Share the RSVP link manually.`,
        );
      }
      setPending([]);
      setMessage("");
      qc.invalidateQueries({ queryKey: ["event-invites", eventKind, eventId] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to send invites"),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-invites", eventKind, eventId] }),
  });

  const sent = invitesQ.data?.rows ?? [];
  const profiles = invitesQ.data?.profiles ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Invite your crew</h3>
        <p className="text-sm text-muted-foreground">
          Invite friends, whole crews, or anyone by email — they'll get an in-app notification or
          email invite with a link to RSVP.
        </p>
      </div>

      <Tabs defaultValue="friends" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:grid sm:grid-cols-4">
          <TabsTrigger value="friends" className="shrink-0 whitespace-nowrap">
            <UserPlus className="h-4 w-4 mr-1" /> Friends
          </TabsTrigger>
          <TabsTrigger value="crews" className="shrink-0 whitespace-nowrap">
            <Users className="h-4 w-4 mr-1" /> Crews
          </TabsTrigger>
          <TabsTrigger value="email" className="shrink-0 whitespace-nowrap">
            <Mail className="h-4 w-4 mr-1" /> Email
          </TabsTrigger>
          <TabsTrigger value="phone" className="shrink-0 whitespace-nowrap">
            <Phone className="h-4 w-4 mr-1" /> Phone
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="pt-4 space-y-3">
          <Input
            placeholder="Search friends..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
            {picker.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading friends…
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                {friends.length === 0
                  ? "You haven't added any friends yet. Head to Community → Friends to build your crew."
                  : "No friends match that search."}
              </div>
            ) : (
              filteredFriends.map((f) => {
                const key = `user:${f.id}`;
                const already = pendingKeys.has(key);
                return (
                  <button
                    key={f.id}
                    type="button"
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition"
                    onClick={() =>
                      addPending({
                        key,
                        invitee_user_id: f.id,
                        invitee_name: f.display_name ?? f.username ?? undefined,
                        label: f.display_name ?? f.username ?? "Friend",
                        channel: "app",
                      })
                    }
                    disabled={already}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={f.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {(f.display_name ?? f.username ?? "?").slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {f.display_name ?? f.username}
                      </div>
                      {f.username ? (
                        <div className="text-xs text-muted-foreground truncate">@{f.username}</div>
                      ) : null}
                    </div>
                    {already ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <UserPlus className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="crews" className="pt-4">
          <div className="space-y-2">
            {crews.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No crews yet. Build one in Community → Trackers to invite a whole group at once.
              </p>
            ) : (
              crews.map((c) => (
                <div key={c.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(crewMembers[c.id] ?? []).length} members
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => addCrew(c.id, c.name)}>
                    Add crew
                  </Button>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="email" className="pt-4 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Input
              placeholder="Name (optional)"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
            <Input
              type="email"
              placeholder="friend@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
            />
          </div>
          <Button type="button" variant="secondary" onClick={addEmail}>
            <Mail className="h-4 w-4 mr-1" /> Add email invite
          </Button>
        </TabsContent>

        <TabsContent value="phone" className="pt-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Text an RSVP link over SMS. When SMS delivery isn't configured for this workspace, the
            invite is still saved and you can share the RSVP link manually.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Input
              placeholder="Name (optional)"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
            <Input
              type="tel"
              placeholder="+1 555 123 4567"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhone())}
            />
          </div>
          <Button type="button" variant="secondary" onClick={addPhone}>
            <Phone className="h-4 w-4 mr-1" /> Add phone invite
          </Button>
        </TabsContent>
      </Tabs>

      {pending.length > 0 && (
        <div className="border rounded-lg p-3 bg-muted/30">
          <div className="text-sm font-medium mb-2">
            {pending.length} invite{pending.length === 1 ? "" : "s"} ready to send
          </div>
          <div className="flex flex-wrap gap-2">
            {pending.map((p) => (
              <Badge key={p.key} variant="secondary" className="pl-2 pr-1 py-1 gap-1">
                {p.label}
                <button
                  type="button"
                  onClick={() => removePending(p.key)}
                  className="ml-1 rounded hover:bg-background p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Personal message (optional)</label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Excited to see you out there!"
          className="mt-1"
          maxLength={1000}
        />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => sendMut.mutate()}
          disabled={pending.length === 0 || sendMut.isPending}
        >
          {sendMut.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Send {pending.length > 0 ? `${pending.length} ` : ""}invite
          {pending.length === 1 ? "" : "s"}
        </Button>
      </div>

      <div className="pt-4 border-t">
        <h4 className="font-semibold mb-3">Invites for this event ({sent.length})</h4>
        {invitesQ.isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading invites…
          </div>
        ) : sent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invites sent yet.</p>
        ) : (
          <div className="space-y-2">
            {sent.map((r) => {
              const p = r.invitee_user_id ? profiles[r.invitee_user_id] : null;
              const label =
                p?.display_name ||
                p?.username ||
                r.invitee_name ||
                r.invitee_email ||
                r.invitee_phone ||
                "Invitee";
              return (
                <div key={r.id} className="flex items-center justify-between border rounded-lg p-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={p?.avatar_url ?? undefined} />
                      <AvatarFallback>{label.slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{label}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.invitee_email ??
                          r.invitee_phone ??
                          (p?.username ? `@${p.username}` : "In-app invite")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={
                        r.rsvp === "going"
                          ? "default"
                          : r.rsvp === "declined"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {r.rsvp === "none" ? "No response" : r.rsvp}
                    </Badge>
                    <Badge variant="outline">{r.status}</Badge>
                    {r.status !== "cancelled" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelMut.mutate(r.id)}
                        disabled={cancelMut.isPending}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
