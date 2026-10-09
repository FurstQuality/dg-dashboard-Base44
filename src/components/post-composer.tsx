import { useState, useRef, useEffect } from "react";
import {
  Camera,
  MapPin,
  Target,
  Trophy,
  ImagePlus,
  Video,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
  ChevronDown,
  Share2,
  BarChart3,
  CalendarDays,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { initials, type ProfileRow } from "@/lib/current-user";
import { fetchManageableClubs, type ManageableClub } from "@/lib/club-posting";
import { extractMentions } from "@/components/feed/post-body";
import { pushToUser } from "@/lib/push.functions";
import { RoundAttachPicker, type AttachedRound } from "@/components/feed/round-attach-picker";
import {
  isVideo,
  mediaRejectionReason,
  shrinkImage,
  MEDIA_URL_TTL_SECONDS,
} from "@/lib/post-media";
import { PlaceAttachPicker, type AttachedPlace } from "@/components/feed/place-attach-picker";

type PostType = "text" | "photo" | "video" | "ace" | "checkin" | "roundcard" | "tournament";

type Visibility = "public" | "friends" | "club";

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "Everyone" },
  { value: "friends", label: "Friends only" },
  { value: "club", label: "Club only" },
];

const TYPE_OPTIONS: {
  value: PostType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "text", label: "Update", icon: Send },
  { value: "photo", label: "Photo", icon: Camera },
  { value: "video", label: "Video", icon: Video },
  { value: "ace", label: "Ace!", icon: Target },
  { value: "checkin", label: "Check-in", icon: MapPin },
  { value: "roundcard", label: "Round", icon: Target },
  { value: "tournament", label: "Tournament", icon: Trophy },
];

/** Notifies any @mentioned players (max 10) that they were tagged in a post. */
async function notifyMentions(text: string | null, authorId: string, postId: string) {
  const names = extractMentions(text).slice(0, 10);
  if (names.length === 0) return;
  try {
    const { data } = await supabase.from("profiles").select("id, username").in("username", names);
    const targets = (data ?? []).filter((p) => p.id !== authorId);
    if (targets.length === 0) return;
    for (const t of targets) {
      await supabase.rpc("notify_user", {
        _user_id: t.id,
        _type: "mention",
        _post_id: postId,
      });
    }
    for (const t of targets) {
      void pushToUser({
        data: {
          userId: t.id,
          title: "You were mentioned",
          body: "Someone tagged you in a post.",
          url: `/p/${postId}`,
          tag: `mention:${postId}`,
        },
      }).catch(() => {});
    }
  } catch {
    /* mentions are best-effort — never block a post */
  }
}

/**
 * Compact horizontal composer (Facebook-style).
 * - Collapsed: avatar + full-width prompt input + 4 quick actions + Post button. ~130px tall.
 * - Expanded: reveals textarea, type picker, media grid, location field.
 */
export function PostComposer({
  profile,
  clubId,
  onCreated,
}: {
  profile: ProfileRow | null;
  clubId?: string | null;
  onCreated?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState<PostType>("text");
  const [body, setBody] = useState("");
  const [location, setLocation] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [round, setRound] = useState<AttachedRound | null>(null);
  const [place, setPlace] = useState<AttachedPlace | null>(null);
  const [eventMode, setEventMode] = useState<"event" | "league">("event");
  const [visibility, setVisibility] = useState<Visibility>(clubId ? "club" : "public");
  const [clubOptions, setClubOptions] = useState<ManageableClub[]>([]);
  const [postAsClubId, setPostAsClubId] = useState<string>("");
  const [uploadStep, setUploadStep] = useState<{ index: number; total: number } | null>(null);
  const draftKey = "dgd:composer-draft:" + (clubId ?? "home");

  // Text-only draft recovery: photos and videos can't survive a page reload.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as { body?: string; location?: string; type?: PostType };
      if (d.body || d.location) {
        setBody(d.body ?? "");
        setLocation(d.location ?? "");
        if (d.type) setType(d.type);
        setExpanded(true);
      }
    } catch {
      /* ignore unreadable drafts */
    }
  }, [draftKey]);

  useEffect(() => {
    try {
      if (!body.trim() && !location.trim()) localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey, JSON.stringify({ body, location, type }));
    } catch {
      /* storage full or blocked */
    }
  }, [body, location, type, draftKey]);

  useEffect(() => {
    let active = true;
    void fetchManageableClubs(profile?.id ?? null).then((clubs) => {
      if (active) setClubOptions(clubs);
    });
    return () => {
      active = false;
    };
  }, [profile?.id]);

  // On a club page, default to posting as that club when the player manages it.
  useEffect(() => {
    if (clubId && clubOptions.some((c) => c.id === clubId)) setPostAsClubId(clubId);
  }, [clubId, clubOptions]);

  const activeClub = clubOptions.find((c) => c.id === postAsClubId) ?? null;
  const effectiveClubId = activeClub?.id ?? clubId ?? null;

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (expanded) textareaRef.current?.focus();
  }, [expanded]);

  async function pickFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).slice(0, 4);
    const keep: File[] = [];
    for (const file of arr) {
      const reason = await mediaRejectionReason(file);
      if (reason) {
        toast.error(reason);
        continue;
      }
      keep.push(file);
    }
    if (keep.length === 0) return;
    // A clip and a photo can't share one post cleanly — the first pick wins.
    const hasVideo = keep.some(isVideo);
    const chosen = hasVideo ? keep.filter(isVideo).slice(0, 1) : keep;
    if (hasVideo && keep.length > chosen.length) {
      toast.info("One video per post — the other files were left out.");
    }
    setFiles(chosen);
    setPreviews(chosen.map((f) => URL.createObjectURL(f)));
    if (type === "text" || type === "photo" || type === "video") {
      setType(hasVideo ? "video" : "photo");
    }
    setExpanded(true);
  }

  /** Reorders attachments so the first photo is the one that leads the post. */
  function moveFile(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= files.length) return;
    const nf = [...files];
    const np = [...previews];
    [nf[i], nf[j]] = [nf[j], nf[i]];
    [np[i], np[j]] = [np[j], np[i]];
    setFiles(nf);
    setPreviews(np);
  }

  function removeFile(i: number) {
    URL.revokeObjectURL(previews[i]);
    setFiles(files.filter((_, ix) => ix !== i));
    setPreviews(previews.filter((_, ix) => ix !== i));
  }

  /** Prefills the composer with the player's current rating and recent scoring form. */
  async function prefillStats() {
    if (!profile) return;
    try {
      const { data } = await supabase
        .from("external_rounds")
        .select("round_rating, to_par")
        .eq("user_id", profile.id)
        .order("played_on", { ascending: false })
        .limit(10);
      const rows = data ?? [];
      const ratings = rows.map((r) => r.round_rating).filter((v): v is number => v !== null);
      const pars = rows.map((r) => r.to_par).filter((v): v is number => v !== null);
      const avgRating = ratings.length
        ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
        : null;
      const avgPar = pars.length
        ? Math.round((pars.reduce((a, b) => a + b, 0) / pars.length) * 10) / 10
        : null;
      const bits = [
        profile.pdga_rating ? `PDGA rating ${profile.pdga_rating}` : null,
        avgRating ? `last ${ratings.length} rounds averaging ${avgRating} rated` : null,
        avgPar !== null ? `${avgPar > 0 ? `+${avgPar}` : avgPar} to par per round` : null,
      ].filter(Boolean);
      setBody(
        bits.length
          ? `Stat check: ${bits.join(" · ")}.`
          : "Stat check: no rated rounds logged yet — first one's coming soon.",
      );
    } catch {
      setBody("Stat check: ");
    }
  }

  function reset() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    setBody("");
    setLocation("");
    setFiles([]);
    setPreviews([]);
    setType("text");
    setRound(null);
    setPlace(null);
    setEventMode("event");
    setExpanded(false);
  }

  async function submit() {
    if (!profile) return;
    if (!body.trim() && files.length === 0 && !round && !place) {
      toast.error("Say something, add a photo, or attach a round, course, or event.");
      return;
    }
    setSubmitting(true);
    try {
      const media: { url: string; path: string; type: string }[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const raw = files[i];
        setUploadStep({ index: i + 1, total: files.length });
        const file = await shrinkImage(raw);
        const path = `${profile.id}/${Date.now()}-${file.name.replace(/[^a-z0-9_.-]/gi, "_")}`;
        const { error } = await supabase.storage.from("posts").upload(path, file, {
          upsert: false,
          contentType: file.type,
        });
        if (error) throw error;
        // Store the file location only; the feed signs a fresh link at display time.
        media.push({ url: "", path, type: file.type });
      }
      setUploadStep(null);
      const text = body.trim() || null;
      const { data: created, error: insertErr } = await supabase
        .from("posts")
        .insert({
          author_id: profile.id,
          club_id: effectiveClubId,
          posted_as_club: Boolean(activeClub),
          visibility: effectiveClubId
            ? visibility
            : visibility === "club"
              ? "friends"
              : visibility,
          type,
          body: text,
          location: location.trim() || place?.location || null,
          media,
          course_name: round?.courseName ?? (place?.kind === "course" ? place.name : null),
          score_data: round
            ? {
                total: round.score,
                to_par: round.toPar,
                rating: round.rating,
                played_on: round.playedOn,
                event_name: round.eventName,
              }
            : place?.kind === "event"
              ? { event_name: place.name, event_id: place.id }
              : null,
        })

        .select("id")
        .single();
      if (insertErr) throw insertErr;
      if (created?.id) void notifyMentions(text, profile.id, created.id);
      reset();
      toast.success("Posted!");
      onCreated?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "We couldn't post that. Give it another shot.",
      );
    } finally {
      setUploadStep(null);
      setSubmitting(false);
    }
  }

  const firstName = profile?.display_name?.split(" ")[0] ?? "player";

  return (
    <div className="rounded-2xl border border-border bg-card">
      {/* Row 1 — avatar + prompt */}
      <div className="flex items-center gap-3 p-3">
        <Avatar className="h-10 w-10 shrink-0">
          {activeClub?.avatar_url ? (
            <AvatarImage src={activeClub.avatar_url} alt={`${activeClub.name} avatar`} />
          ) : !activeClub && profile?.avatar_url ? (
            <AvatarImage
              src={profile.avatar_url}
              alt={`${profile?.display_name ?? "Player"} avatar`}
            />
          ) : null}
          <AvatarFallback>{initials(activeClub?.name ?? profile?.display_name)}</AvatarFallback>
        </Avatar>
        {expanded ? (
          <Textarea
            ref={textareaRef}
            placeholder={`What's on the tee pad, ${firstName}?`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-11 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 text-[15px] leading-snug focus-visible:ring-0"
            maxLength={2000}
          />
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex h-11 flex-1 items-center rounded-full bg-muted/60 px-4 text-left text-sm text-muted-foreground transition hover:bg-muted"
          >
            What's on the tee pad, {firstName}?
          </button>
        )}
      </div>

      {/* Expanded fields */}
      {expanded ? (
        <div className="space-y-3 px-3 pb-1">
          {previews.length > 0 ? (
            <div className={"grid gap-2 " + (previews.length === 1 ? "" : "grid-cols-2")}>
              {previews.map((src, i) => (
                <div
                  key={src}
                  className="group relative overflow-hidden rounded-lg border border-border"
                >
                  {files[i] && isVideo(files[i]) ? (
                    <video
                      src={src}
                      controls
                      playsInline
                      className="h-40 w-full bg-black object-contain"
                    />
                  ) : (
                    <img src={src} alt="preview" className="h-40 w-full object-cover" />
                  )}
                  {previews.length > 1 ? (
                    <div className="absolute bottom-1 left-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => moveFile(i, -1)}
                        disabled={i === 0}
                        className="grid h-6 w-6 place-items-center rounded-full bg-background/85 text-foreground disabled:opacity-40"
                        aria-label="Move earlier"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveFile(i, 1)}
                        disabled={i === previews.length - 1}
                        className="grid h-6 w-6 place-items-center rounded-full bg-background/85 text-foreground disabled:opacity-40"
                        aria-label="Move later"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={type} onValueChange={(v) => setType(v as PostType)}>
              <SelectTrigger className="h-8 w-auto gap-1.5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => {
                  const Icon = o.icon;
                  return (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" /> {o.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {clubOptions.length > 0 ? (
              <Select
                value={postAsClubId || "self"}
                onValueChange={(v) => setPostAsClubId(v === "self" ? "" : v)}
              >
                <SelectTrigger className="h-8 w-auto min-w-40 text-xs" aria-label="Post as">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">
                    Post as {profile?.display_name ?? "yourself"}
                  </SelectItem>
                  {clubOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      Post as {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="Who can see this post">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.filter((o) => o.value !== "club" || effectiveClubId).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              placeholder="Course or location (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="h-8 flex-1 min-w-40 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              maxLength={120}
            />
          </div>
          {type === "roundcard" && profile ? (
            <RoundAttachPicker userId={profile.id} value={round} onChange={setRound} />
          ) : null}
          {type === "checkin" || type === "ace" ? (
            <PlaceAttachPicker mode="course" value={place} onChange={setPlace} />
          ) : null}
          {type === "tournament" ? (
            <PlaceAttachPicker mode={eventMode} value={place} onChange={setPlace} />
          ) : null}
        </div>
      ) : null}

      {uploadStep ? (
        <div className="px-3 pb-2">
          <div className="mb-1 text-[11px] text-muted-foreground">
            Uploading {uploadStep.index} of {uploadStep.total}…
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((uploadStep.index / uploadStep.total) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Divider + action row */}
      <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-border/60 px-2 py-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => void pickFiles(e.target.files)}
        />
        <ComposerAction
          icon={<Camera className="h-4 w-4 text-emerald-500" />}
          label="Photo/Video"
          onClick={() => inputRef.current?.click()}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground/80 transition hover:bg-muted"
            >
              <Share2 className="h-4 w-4 text-primary" />
              <span className="hidden md:inline">Share</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs">Share from your game</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setPlace(null);
                setType("roundcard");
                setExpanded(true);
              }}
            >
              <Target className="mr-2 h-4 w-4" /> Round
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setRound(null);
                setPlace(null);
                setEventMode("event");
                setType("tournament");
                setExpanded(true);
              }}
            >
              <Trophy className="mr-2 h-4 w-4" /> Tournament
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setRound(null);
                setPlace(null);
                setEventMode("league");
                setType("tournament");
                setExpanded(true);
              }}
            >
              <CalendarDays className="mr-2 h-4 w-4" /> League
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setRound(null);
                setPlace(null);
                setType("text");
                setExpanded(true);
                void prefillStats();
              }}
            >
              <BarChart3 className="mr-2 h-4 w-4" /> Stats highlight
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ComposerAction
          icon={<MapPin className="h-4 w-4 text-rose-500" />}
          label="Location"
          onClick={() => {
            setType("checkin");
            setExpanded(true);
          }}
        />
        <ComposerAction
          icon={<Trophy className="h-4 w-4 text-amber-500" />}
          label="Ace"
          onClick={() => {
            setType("ace");
            setExpanded(true);
          }}
        />

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {expanded ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              className="h-8 gap-1 text-xs text-muted-foreground"
              disabled={submitting}
            >
              <ChevronDown className="h-3.5 w-3.5" /> Collapse
            </Button>
          ) : null}
          <Button
            onClick={submit}
            disabled={submitting || !profile || (!body.trim() && files.length === 0 && !round)}
            className="h-9 min-w-[68px] bg-primary text-primary-foreground hover:bg-primary/90"
            size="sm"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ComposerAction({
  icon,
  label,
  onClick,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground/80 transition hover:bg-muted ${className}`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
