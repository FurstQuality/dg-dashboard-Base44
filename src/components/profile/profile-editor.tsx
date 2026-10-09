import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Camera, MapPin, User, Award, Disc, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PDGA_DIVISIONS } from "@/lib/pdga-data";
import { LinkedProfilesCard } from "@/components/linked-profiles-card";
import { useSession, useMyProfile, initials } from "@/lib/current-user";
import { importProfilePhoto } from "@/lib/profile-photo.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

export type ProfileEditorProps = {
  /** Show the Level/XP/Rounds/Aces strip above the editor. */
  showStats?: boolean;
  /** Where to go after a successful save. "profile" opens the public page. */
  afterSave?: "profile" | "stay";
};

type Stats = {
  rounds: number;
  aces: number;
  level: number;
  xp: number;
};

export function ProfileEditor({ showStats = true, afterSave = "profile" }: ProfileEditorProps) {
  const navigate = useNavigate();
  const { user } = useSession();
  const { profile, refresh } = useMyProfile(user);
  const [display, setDisplay] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [home, setHome] = useState("");
  const [homeState, setHomeState] = useState("");
  const [location, setLocation] = useState("");
  const [playerSince, setPlayerSince] = useState<string>("");
  const [favoriteAce, setFavoriteAce] = useState("");
  const [manualAces, setManualAces] = useState<string>("");
  const [division, setDivision] = useState<string>("");
  const [shareCalendar, setShareCalendar] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const importPhoto = useServerFn(importProfilePhoto);
  const [urlPhotoValue, setUrlPhotoValue] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  async function pullPhotoFromUrl() {
    if (!user) return;
    const value = urlPhotoValue.trim();
    if (!value) {
      toast.error("Paste an image or profile URL");
      return;
    }
    setPhotoBusy(true);
    try {
      toast.loading("Fetching profile photo…", { id: "photo-import" });
      await importPhoto({ data: { source: "url", value } });
      toast.success("Profile photo updated", { id: "photo-import" });
      setUrlPhotoValue("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo import failed", {
        id: "photo-import",
      });
    } finally {
      setPhotoBusy(false);
    }
  }

  useEffect(() => {
    if (!profile) return;
    setDisplay(profile.display_name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setHome(profile.home_course ?? "");
    setHomeState((profile as { home_state?: string | null }).home_state ?? "");
    setLocation((profile as { location?: string | null }).location ?? "");
    setPlayerSince(String((profile as { player_since?: number | null }).player_since ?? ""));
    setFavoriteAce((profile as { favorite_ace?: string | null }).favorite_ace ?? "");
    const mAces = (profile as { ace_count_manual?: number | null }).ace_count_manual;
    setManualAces(mAces != null ? String(mAces) : "");
    setDivision((profile as { preferred_division?: string | null }).preferred_division ?? "");
    setShareCalendar(
      Boolean((profile as { calendar_shared_with_friends?: boolean | null }).calendar_shared_with_friends),
    );
  }, [profile]);

  const linkedQ = useQuery({
    queryKey: ["profile-editor-linked", user?.id] as const,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("pdga_number, scene_profile_url, scene_profile_urls, udisc_profile_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const statsQ = useQuery<Stats>({
    queryKey: ["profile-editor-stats", user?.id] as const,
    enabled: Boolean(user?.id) && showStats,
    staleTime: 60_000,
    queryFn: async () => {
      const [roundsRes, acesRes, progRes] = await Promise.all([
        supabase
          .from("rounds")
          .select("id", { count: "exact", head: true })
          .eq("created_by", user!.id),
        supabase.from("round_scores").select("id", { count: "exact", head: true }).eq("strokes", 1),
        supabase.from("user_progress").select("level, xp").eq("user_id", user!.id).maybeSingle(),
      ]);
      if (roundsRes.error) throw roundsRes.error;
      if (acesRes.error) throw acesRes.error;
      if (progRes.error) throw progRes.error;
      return {
        rounds: roundsRes.count ?? 0,
        aces: acesRes.count ?? 0,
        level: progRes.data?.level ?? 0,
        xp: progRes.data?.xp ?? 0,
      };
    },
  });
  const stats: Stats = statsQ.data ?? { rounds: 0, aces: 0, level: 0, xp: 0 };
  const statsLoading = statsQ.isPending && Boolean(user?.id) && showStats;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: display.trim(),
          username: username.trim().toLowerCase(),
          bio: bio.trim() || null,
          home_course: home.trim() || null,
          home_state: homeState.trim() || null,
          location: location.trim() || null,
          player_since: playerSince ? Number(playerSince) : null,
          favorite_ace: favoriteAce.trim() || null,
          ace_count_manual: manualAces.trim() ? Number(manualAces) : null,
          preferred_division: division || null,
          calendar_shared_with_friends: shareCalendar,
        })
        .eq("id", user.id);
      if (error) throw error;
      await refresh();
      toast.success("Profile saved");
      if (afterSave === "profile") {
        navigate({
          to: "/players/$username",
          params: { username: username.trim().toLowerCase() },
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File, kind: "avatar" | "cover") {
    if (!user) return;
    const bucket = kind === "avatar" ? "avatars" : "covers";
    const path = `${user.id}/${kind}-${Date.now()}-${file.name.replace(/[^a-z0-9_.-]/gi, "_")}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) return toast.error(error.message);
    const { data: signed } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (!signed?.signedUrl) return;
    const patch: Record<string, string> = {
      [kind === "avatar" ? "avatar_url" : "cover_url"]: signed.signedUrl,
    };
    await (
      supabase.from("profiles") as unknown as {
        update: (v: Record<string, string>) => { eq: (k: string, v: string) => Promise<unknown> };
      }
    )
      .update(patch)
      .eq("id", user.id);
    await refresh();
    toast.success(`${kind === "avatar" ? "Photo" : "Cover"} updated`);
  }

  return (
    <div className="space-y-4">
      {showStats && statsLoading ? (
        <div aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-border bg-card/60"
            />
          ))}
        </div>
      ) : null}

      {showStats && statsQ.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3"
        >
          <p className="text-xs text-muted-foreground">
            Your level, XP, rounds and aces didn't load just now.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void statsQ.refetch()}
            disabled={statsQ.isFetching}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {showStats && statsQ.isSuccess ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Level" value={stats.level} icon={<Award className="h-4 w-4" />} />
          <StatCard
            label="XP"
            value={stats.xp.toLocaleString()}
            icon={<Award className="h-4 w-4" />}
          />
          <StatCard label="Rounds" value={stats.rounds} icon={<Disc className="h-4 w-4" />} />
          <StatCard label="Aces" value={stats.aces} icon={<Disc className="h-4 w-4" />} />
        </div>
      ) : null}

      {/* Photos */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Camera className="h-4 w-4" /> Photos
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-16 w-16">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
              <AvatarFallback>{initials(display)}</AvatarFallback>
            </Avatar>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "avatar")}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Change photo
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-16 w-28 rounded-md border bg-muted overflow-hidden">
              {profile?.cover_url ? (
                <img src={profile.cover_url} alt="cover" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "cover")}
            />
            <Button variant="outline" size="sm" onClick={() => coverRef.current?.click()}>
              Change cover
            </Button>
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Import photo from a URL
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={urlPhotoValue}
              onChange={(e) => setUrlPhotoValue(e.target.value)}
              placeholder="https://… (image or public profile page)"
            />
            <Button
              type="button"
              onClick={pullPhotoFromUrl}
              disabled={photoBusy || !urlPhotoValue.trim()}
            >
              {photoBusy ? "Pulling…" : "Use this photo"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            For PDGA, Disc Golf Scene, or UDisc, link the account in Data &amp; sync — the avatar
            gets pulled during sync.
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Linked profiles</div>
        <p className="mb-3 text-xs text-muted-foreground">
          Once your PDGA, UDisc, or Disc Golf Scene account is linked, your rating, rounds, and
          upcoming events refresh on their own in the background.
        </p>
        {user ? (
          <LinkedProfilesCard
            userId={user.id}
            pdgaNumber={linkedQ.data?.pdga_number ?? null}
            sceneUrl={linkedQ.data?.scene_profile_url ?? null}
            sceneUrls={
              (linkedQ.data?.scene_profile_urls as Record<string, string> | null) ?? null
            }
            udiscUrl={linkedQ.data?.udisc_profile_url ?? null}
            onChanged={async () => {
              await Promise.all([linkedQ.refetch(), refresh()]);
            }}
          />
        ) : null}
      </div>

      {/* Editor form */}
      <form onSubmit={save} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold flex items-center gap-2">
          <User className="h-4 w-4" /> Identity
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="display"
            label="Display name"
            required
            maxLength={60}
            value={display}
            onChange={setDisplay}
          />
          <Field
            id="uname"
            label="Username"
            required
            maxLength={30}
            value={username}
            onChange={(v) => setUsername(v.replace(/[^a-z0-9_]/gi, ""))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            maxLength={280}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell people about your game — home course, favorite discs, tournament goals…"
          />
          <div className="text-right text-[10px] text-muted-foreground">{bio.length}/280</div>
        </div>

        <div className="pt-2 text-sm font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Location & home turf
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="home" label="Home course" maxLength={120} value={home} onChange={setHome} />
          <Field id="loc" label="City" maxLength={120} value={location} onChange={setLocation} />
          <Field
            id="state"
            label="State / Region"
            maxLength={60}
            value={homeState}
            onChange={setHomeState}
          />
          <Field
            id="since"
            label="Playing since (year)"
            value={playerSince}
            onChange={(v) => setPlayerSince(v.replace(/[^0-9]/g, "").slice(0, 4))}
          />
        </div>

        <div className="pt-2 text-xs text-muted-foreground flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5" /> Manage your PDGA #, Disc Golf Scene, and UDisc links in
          the Linked profiles card above.
        </div>

        <div className="pt-2 text-sm font-semibold flex items-center gap-2">
          <Award className="h-4 w-4" /> Competition
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="division">Division you play</Label>
            <Select
              value={division || "none"}
              onValueChange={(v) => setDivision(v === "none" ? "" : v)}
            >
              <SelectTrigger id="division">
                <SelectValue placeholder="Pick a division" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {PDGA_DIVISIONS.map((d) => (
                  <SelectItem key={d.code} value={d.code}>
                    {d.code} · {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Shown on your profile and pre-filled when you register for events.
            </p>
          </div>
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-background p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Share my schedule with my Crew</div>
              <div className="text-[11px] text-muted-foreground">
                Crew members can see the events you're signed up for.
              </div>
            </div>
            <Switch checked={shareCalendar} onCheckedChange={setShareCalendar} />
          </label>
        </div>

        <div className="pt-2 text-sm font-semibold flex items-center gap-2">
          <Disc className="h-4 w-4" /> Aces
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="aces-manual"
            label="Career ace count (optional override)"
            value={manualAces}
            onChange={(v) => setManualAces(v.replace(/[^0-9]/g, "").slice(0, 4))}
          />
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="favorite-ace">Favorite ace story</Label>
            <Textarea
              id="favorite-ace"
              maxLength={280}
              value={favoriteAce}
              onChange={(e) => setFavoriteAce(e.target.value)}
              placeholder="Hole 7 at Maple Hill, 340' tomahawk into a headwind…"
            />
            <div className="text-right text-[10px] text-muted-foreground">
              {favoriteAce.length}/280
            </div>
          </div>
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        required={required}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="mx-auto mb-1 grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
