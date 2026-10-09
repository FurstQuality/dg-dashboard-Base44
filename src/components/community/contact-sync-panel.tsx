import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload, Users, ShieldCheck, Trash2, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { sendFriendRequest } from "@/lib/friends.functions";
import {
  extractContacts,
  hashContact,
  hashMany,
  normalizeEmail,
  type NormalizedContact,
} from "@/lib/contact-hash";

type MatchedProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  match_via: string;
};

// Contact Picker API — Chrome Android only. Feature-detect at runtime.
type ContactInfoLike = { email?: string[]; tel?: string[]; name?: string[] };
type ContactsManagerLike = {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<ContactInfoLike[]>;
};

function getContactPicker(): ContactsManagerLike | null {
  const nav = navigator as unknown as { contacts?: ContactsManagerLike };
  return nav.contacts && typeof nav.contacts.select === "function" ? nav.contacts : null;
}

export function ContactSyncPanel() {
  const { user } = useSession();
  const sendRequestFn = useServerFn(sendFriendRequest);
  const [published, setPublished] = useState<{ kind: string; hash: string }[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [manualText, setManualText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [matches, setMatches] = useState<MatchedProfile[]>([]);
  const [scanned, setScanned] = useState(0);

  const picker = useMemo(() => (typeof navigator !== "undefined" ? getContactPicker() : null), []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_contact_hashes")
      .select("kind, hash")
      .eq("user_id", user.id)
      .then(({ data }) => setPublished((data ?? []) as { kind: string; hash: string }[]));
  }, [user?.id]);

  async function publishMyEmail() {
    if (!user) return;
    setPublishing(true);
    try {
      const email = normalizeEmail(user.email ?? "");
      if (!email) throw new Error("No email on your account");
      const hash = await hashContact({ kind: "email", value: email, original: email });
      const { error } = await supabase
        .from("user_contact_hashes")
        .upsert({ user_id: user.id, kind: "email", hash }, { onConflict: "user_id,hash" });
      if (error) throw error;
      setPublished((p) => [...p.filter((x) => x.hash !== hash), { kind: "email", hash }]);
      toast.success("You're discoverable by email");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not publish";
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  }

  async function removeMine() {
    if (!user) return;
    const { error } = await supabase.from("user_contact_hashes").delete().eq("user_id", user.id);
    if (error) return toast.error(error.message);
    setPublished([]);
    toast.success("Contact discovery disabled");
  }

  async function matchAgainst(contacts: NormalizedContact[]) {
    if (!user) return;
    if (contacts.length === 0) {
      toast.error("No valid emails or phone numbers found");
      return;
    }
    setScanning(true);
    setScanned(contacts.length);
    try {
      const pairs = await hashMany(contacts);
      const hashList = pairs.map((p) => p.hash);
      // Query in chunks of 200 to stay within URL limits.
      const found = new Map<string, string>(); // profile_id -> match hash
      for (let i = 0; i < hashList.length; i += 200) {
        const slice = hashList.slice(i, i + 200);
        const { data, error } = await supabase
          .from("user_contact_hashes")
          .select("user_id, hash")
          .in("hash", slice);
        if (error) throw error;
        (data ?? []).forEach((row) => {
          if (row.user_id !== user.id) found.set(row.user_id, row.hash);
        });
      }
      if (found.size === 0) {
        setMatches([]);
        toast.info("Scanned " + contacts.length + " contacts — no DG Dashboard users matched yet");
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", [...found.keys()]);
      const hashToOriginal = new Map(pairs.map((p) => [p.hash, p.contact.original]));
      const rows: MatchedProfile[] = (profiles ?? []).map((p) => ({
        ...p,
        match_via: hashToOriginal.get(found.get(p.id) ?? "") ?? "",
      })) as MatchedProfile[];
      setMatches(rows);
      toast.success(
        "Found " + rows.length + " friend" + (rows.length === 1 ? "" : "s") + " on DG Dashboard",
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Match failed";
      toast.error(msg);
    } finally {
      setScanning(false);
    }
  }

  async function scanManual() {
    const contacts = extractContacts(manualText);
    await matchAgainst(contacts);
  }

  async function scanFromPicker() {
    if (!picker) return;
    try {
      const results = await picker.select(["email", "tel", "name"], { multiple: true });
      const contacts: NormalizedContact[] = [];
      results.forEach((r) => {
        (r.email ?? []).forEach((e) => contacts.push(...extractContacts(e)));
        (r.tel ?? []).forEach((t) => contacts.push(...extractContacts(t)));
      });
      await matchAgainst(contacts);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Contact picker unavailable";
      toast.error(msg);
    }
  }

  async function scanCsv(file: File) {
    const text = await file.text();
    await matchAgainst(extractContacts(text));
  }

  /**
   * One shared path for every friend request in the app, so blocked players and
   * the "you have a new request" notification are handled the same way here.
   */
  async function sendRequest(targetId: string) {
    if (!user) return;
    try {
      await sendRequestFn({ data: { targetId } });
      toast.success("Friend request sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that request");
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Find friends from your contacts</h3>
          <p className="text-sm text-muted-foreground">
            Match your address book against DG Dashboard. Contacts are hashed in your browser — we
            never see raw emails or phone numbers.
          </p>
        </div>
        <ShieldCheck className="h-6 w-6 text-emerald-500 shrink-0" />
      </header>

      <div className="rounded-xl bg-muted/40 border border-border/50 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <div className="font-medium">Let friends find you</div>
          <div className="text-muted-foreground">
            {published.length > 0 ? (
              <>
                Discoverable by{" "}
                <Badge variant="secondary">
                  {published.length} hash{published.length === 1 ? "" : "es"}
                </Badge>
              </>
            ) : (
              <>You're not discoverable by contact yet.</>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {published.length === 0 ? (
            <Button size="sm" onClick={publishMyEmail} disabled={publishing}>
              {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Enable
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={removeMine}>
              <Trash2 className="h-4 w-4 mr-1" /> Turn off
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {picker ? (
          <Button variant="outline" onClick={scanFromPicker} disabled={scanning}>
            <Smartphone className="h-4 w-4 mr-2" /> Pick from contacts
          </Button>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
            Mobile contact picker isn't available in this browser. Use paste or CSV.
          </div>
        )}

        <label className="inline-flex">
          <input
            type="file"
            accept=".csv,text/csv,text/plain,text/vcard"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void scanCsv(f);
              e.currentTarget.value = "";
            }}
          />
          <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border/60 text-sm font-medium cursor-pointer hover:bg-accent">
            <Upload className="h-4 w-4 mr-2" /> Upload CSV / vCard
          </span>
        </label>

        <div className="text-xs text-muted-foreground self-center">
          Export from Google Contacts, iCloud, or any address book.
        </div>
      </div>

      <div>
        <Textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="Or paste emails / phone numbers, one per line..."
          rows={3}
        />
        <div className="mt-2 flex justify-end">
          <Button onClick={scanManual} disabled={scanning || !manualText.trim()}>
            {scanning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Users className="h-4 w-4 mr-2" />
            )}
            Scan for friends
          </Button>
        </div>
      </div>

      {matches.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <div className="text-sm font-medium">
            {matches.length} match{matches.length === 1 ? "" : "es"} of {scanned} contact
            {scanned === 1 ? "" : "s"}
          </div>
          <ul className="divide-y divide-border/40">
            {matches.map((m) => (
              <li key={m.id} className="py-2 flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={m.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {(m.display_name ?? m.username)[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <Link to="/community" className="font-medium truncate block">
                    {m.display_name ?? m.username}
                  </Link>
                  <div className="text-xs text-muted-foreground truncate">
                    @{m.username} · matched {m.match_via}
                  </div>
                </div>
                <Button size="sm" onClick={() => sendRequest(m.id)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
