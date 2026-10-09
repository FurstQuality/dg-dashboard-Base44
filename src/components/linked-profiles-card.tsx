import { useEffect, useMemo, useState } from "react";
import { Link2, ExternalLink, RefreshCw, Save, CheckCircle2, AlertCircle } from "lucide-react";

import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PDGA_SERVER_FUNCTIONS, syncAllPdgaData } from "@/lib/pdga-sync";
import { importSceneProfile, SCENE_TABS, type SceneTab } from "@/lib/scene-import.functions";
import { importUdiscProfile } from "@/lib/profile-photo.functions";

type Provider = "pdga" | "udisc";

type Props = {
  userId: string;
  pdgaNumber: string | null;
  sceneUrl: string | null;
  sceneUrls?: Partial<Record<SceneTab, string>> | null;
  udiscUrl: string | null;
  onChanged?: () => Promise<void> | void;
};

const UDISC_URL_RX =
  /^https?:\/\/(www\.|app\.)?udisc\.com\/(applink\/community\/profile\?profileId=[^&#]+|(users|profile|profiles|u)\/[^/?#]+)/i;

function isSceneUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?discgolfscene\.com\/(?:players|player|profile)\/[^/?#]+/i.test(url);
}

function derivePdgaUrl(num: string | null): string | null {
  if (!num) return null;
  const n = num.trim().match(/\d{3,7}/)?.[0];
  return n ? `https://www.pdga.com/player/${n}` : null;
}

/* ------------------------------------------------------------------ */
/*                       Disc Golf Scene section                       */
/* ------------------------------------------------------------------ */

const SCENE_TAB_ORDER: SceneTab[] = [
  "about",
  "scores",
  "aces",
  "achievements",
  "series",
  "friends",
  "comments",
];
const SCENE_TAB_LABEL: Record<SceneTab, string> = {
  about: "About",
  scores: "Scores",
  aces: "Aces",
  achievements: "Achievements",
  series: "Series",
  friends: "Friends",
  comments: "Comments",
};

const DGS_PROFILE_RX = /^https?:\/\/(www\.)?discgolfscene\.com\/profile\/([^/?#]+)/i;

function deriveSceneUrls(baseUrl: string): Partial<Record<SceneTab, string>> | null {
  const m = baseUrl.trim().match(DGS_PROFILE_RX);
  if (!m) return null;
  const id = m[2];
  const root = `https://www.discgolfscene.com/profile/${id}`;
  return {
    about: root,
    scores: `${root}/scores`,
    aces: `${root}/aces`,
    achievements: `${root}/achievements`,
    series: `${root}/series`,
    friends: `${root}/friends`,
    comments: `${root}/comments`,
  };
}

function SceneMultiTabSection({
  userId,
  initialUrls,
  onChanged,
}: {
  userId: string;
  initialUrls: Partial<Record<SceneTab, string>>;
  onChanged?: () => Promise<void> | void;
}) {
  const importScene = useServerFn(importSceneProfile);
  const initialBase = initialUrls.about ?? Object.values(initialUrls).find(Boolean) ?? "";
  const [profileUrl, setProfileUrl] = useState<string>(initialBase);
  const [busy, setBusy] = useState<"save" | "sync" | null>(null);
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof importScene>> | null>(
    null,
  );

  useEffect(() => {
    setProfileUrl(initialUrls.about ?? Object.values(initialUrls).find(Boolean) ?? "");
  }, [JSON.stringify(initialUrls)]);

  const derived = useMemo(
    () => (profileUrl.trim() ? deriveSceneUrls(profileUrl) : null),
    [profileUrl],
  );
  const linked = !!initialUrls.about;

  async function saveUrl() {
    const clean = profileUrl.trim();
    if (clean && !DGS_PROFILE_RX.test(clean)) {
      toast.error(
        "Paste your Disc Golf Scene profile URL (e.g. https://www.discgolfscene.com/profile/235173)",
      );
      return;
    }
    setBusy("save");
    try {
      const map = clean ? (deriveSceneUrls(clean) ?? {}) : {};
      const { error } = await supabase
        .from("profiles")
        .update({
          scene_profile_urls: map,
          scene_profile_url: clean || null,
        } as never)
        .eq("id", userId);
      if (error) throw error;
      toast.success(clean ? "Disc Golf Scene linked" : "Disc Golf Scene cleared");
      await onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  }

  async function syncAll() {
    const clean = profileUrl.trim();
    if (!clean || !DGS_PROFILE_RX.test(clean)) {
      toast.error("Paste your Disc Golf Scene profile URL first");
      return;
    }
    const urls = deriveSceneUrls(clean);
    if (!urls) return;
    setBusy("sync");
    try {
      toast.loading("Reading your Disc Golf Scene profile…", { id: "scene-sync" });
      const res = await importScene({ data: { urls, applyToMe: true } });
      setLastResult(res);
      const name = res.profile?.display_name ?? "your profile";
      const storedRounds = res.perTab.scores?.stored ?? 0;
      const bits: string[] = [];
      if (res.applied) bits.push("profile updated");
      if (storedRounds > 0) bits.push(`${storedRounds} new round${storedRounds === 1 ? "" : "s"}`);
      const others = (["aces", "achievements", "series", "friends", "comments"] as SceneTab[])
        .map((t) =>
          res.perTab[t]?.parsed
            ? `${res.perTab[t]!.parsed} ${SCENE_TAB_LABEL[t].toLowerCase()}`
            : null,
        )
        .filter(Boolean);
      if (others.length) bits.push(others.join(", "));
      toast.success(
        bits.length
          ? `Pulled ${name} — ${bits.join(" · ")}`
          : `Read ${name}. Nothing new to fill in.`,
        { id: "scene-sync" },
      );
      await onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scene sync failed", { id: "scene-sync" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30">
          Disc Golf Scene
        </span>
        <Badge variant={linked ? "default" : "secondary"} className="text-[10px]">
          {linked ? "Linked" : "Not linked"}
        </Badge>
        {linked && initialUrls.about ? (
          <a
            href={initialUrls.about}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
          placeholder="https://www.discgolfscene.com/profile/235173"
          className="bg-background/70"
          disabled={busy !== null}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={saveUrl}
            disabled={busy !== null}
            className="gap-1.5 sm:min-w-[92px]"
          >
            <Save className="h-3.5 w-3.5" />
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            onClick={syncAll}
            disabled={busy !== null || !profileUrl.trim()}
            className="gap-1.5 sm:min-w-[110px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy === "sync" ? "animate-spin" : ""}`} />
            {busy === "sync" ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Paste your Disc Golf Scene profile URL and DGD will automatically pull About, Scores, Aces,
        Achievements, Series, Friends, and Comments in one sync. Find it by logging in at{" "}
        <a
          href="https://www.discgolfscene.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          discgolfscene.com
        </a>{" "}
        and clicking your profile — copy the URL from the address bar.
      </p>

      {derived ? (
        <div className="grid gap-1 text-[11px] text-muted-foreground">
          {SCENE_TAB_ORDER.map((t) => {
            const res = lastResult?.perTab?.[t];
            const done = res && !res.error && (res.parsed > 0 || t === "about");
            const err = res?.error;
            return (
              <div key={t} className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground/80 w-24">{SCENE_TAB_LABEL[t]}</span>
                <span className="truncate flex-1">{derived[t]}</span>
                {done ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {res.stored ? `${res.stored} saved` : "read"}
                  </span>
                ) : err ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3 w-3" /> {err}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                        PDGA + UDisc rows                            */
/* ------------------------------------------------------------------ */

export function LinkedProfilesCard({
  userId,
  pdgaNumber,
  sceneUrl,
  sceneUrls,
  udiscUrl,
  onChanged,
}: Props) {
  const [pdga, setPdga] = useState(pdgaNumber ?? "");
  const [udisc, setUdisc] = useState(udiscUrl ?? "");
  const [busy, setBusy] = useState<`${Provider}:${"save" | "sync"}` | null>(null);

  useEffect(() => {
    setPdga(pdgaNumber ?? "");
  }, [pdgaNumber]);
  useEffect(() => {
    setUdisc(udiscUrl ?? "");
  }, [udiscUrl]);

  const queryClient = useQueryClient();
  const syncProfileFn = useServerFn(PDGA_SERVER_FUNCTIONS.syncMyPdgaFromProfile);
  const syncEventsFn = useServerFn(PDGA_SERVER_FUNCTIONS.syncMyPdgaEvents);
  const importUdisc = useServerFn(importUdiscProfile);

  // Merge legacy sceneUrl (single About URL) with the new map.
  const seededSceneUrls: Partial<Record<SceneTab, string>> = useMemo(() => {
    const base: Partial<Record<SceneTab, string>> = sceneUrls ?? {};
    if (!base.about && sceneUrl) return { ...base, about: sceneUrl };
    return base;
  }, [sceneUrls, sceneUrl]);

  async function savePdga() {
    const clean = pdga.trim();
    if (clean && !/^\d{3,7}$/.test(clean)) {
      toast.error("Enter a valid PDGA number (3–7 digits)");
      return;
    }
    setBusy("pdga:save");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          pdga_number: clean || null,
          pdga_profile_url: derivePdgaUrl(clean || null),
        })
        .eq("id", userId);
      if (error) throw error;
      toast.success(clean ? "PDGA linked" : "PDGA cleared");
      await onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  }

  async function saveUdisc() {
    const clean = udisc.trim();
    if (clean && !UDISC_URL_RX.test(clean)) {
      toast.error(
        "Paste your UDisc share link — open the UDisc app → your profile → Share profile",
      );
      return;
    }
    setBusy("udisc:save");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ udisc_profile_url: clean || null })
        .eq("id", userId);
      if (error) throw error;
      toast.success(clean ? "UDisc linked" : "UDisc cleared");
      await onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  }

  async function syncPdgaNow() {
    const num = pdga.trim() || pdgaNumber?.trim() || "";
    if (!num) {
      toast.error("Save your PDGA number first");
      return;
    }
    setBusy("pdga:sync");
    try {
      toast.loading("Syncing PDGA rating, rounds, and events…", { id: "pdga-sync" });
      const res = await syncAllPdgaData(
        { syncProfile: syncProfileFn, syncEvents: syncEventsFn },
        { force: true, silent: true, queryClient },
      );
      if (res.ok) {
        toast.success(
          res.cached
            ? "PDGA already up to date"
            : `PDGA synced — ${res.roundsSynced} rounds · ${res.eventsAdded} events added`,
          { id: "pdga-sync" },
        );
        await onChanged?.();
      } else {
        toast.error(res.errors[0] ?? "PDGA sync failed", { id: "pdga-sync" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDGA sync failed", { id: "pdga-sync" });
    } finally {
      setBusy(null);
    }
  }

  async function syncUdiscNow() {
    const url = udisc.trim() || udiscUrl?.trim() || "";
    if (!url) {
      toast.error("Save your UDisc URL first");
      return;
    }
    setBusy("udisc:sync");
    try {
      toast.loading("Reading your UDisc profile…", { id: "udisc-sync" });
      const res = await importUdisc({ data: { url } });
      const bits: string[] = [];
      if (res.displayName) bits.push(res.displayName);
      if (res.username) bits.push(`@${res.username}`);
      toast.success(
        res.avatarUrl
          ? `UDisc linked — photo imported${bits.length ? ` for ${bits.join(" ")}` : ""}`
          : `UDisc linked${bits.length ? ` — ${bits.join(" ")}` : ""}. No photo on that profile yet.`,
        { id: "udisc-sync" },
      );
      await onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "UDisc sync failed", { id: "udisc-sync" });
    } finally {
      setBusy(null);
    }
  }

  const rows: Array<{
    provider: Provider;
    title: string;
    accent: string;
    linked: boolean;
    inputValue: string;
    inputSetter: (v: string) => void;
    placeholder: string;
    help: string;
    hint?: React.ReactNode;
    onSave: () => Promise<void>;
    onSync: () => Promise<void>;
    syncLabel: string;
    href: string | null;
  }> = [
    {
      provider: "pdga",
      title: "PDGA",
      accent: "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/30",
      linked: !!pdgaNumber,
      inputValue: pdga,
      inputSetter: setPdga,
      placeholder: "PDGA number (e.g. 236190)",
      help: "Sync pulls your rating, sanctioned rounds, and upcoming PDGA events.",
      onSave: savePdga,
      onSync: syncPdgaNow,
      syncLabel: "Sync PDGA",
      href: derivePdgaUrl(pdgaNumber),
    },
    {
      provider: "udisc",
      title: "UDisc",
      accent: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30",
      linked: !!udiscUrl,
      inputValue: udisc,
      inputSetter: setUdisc,
      placeholder: "https://app.udisc.com/applink/community/profile?profileId=…",
      help: "This only pulls your UDisc name, @username, and photo — UDisc keeps scorecards private. Your rounds, scores, and stats come in through your UDisc CSV export.",
      hint: (
        <>
          <strong>Mobile only:</strong> open the UDisc app → tap your profile →{" "}
          <em>Share profile</em> → copy link, then paste here. The desktop site does not expose this
          URL.
          <br />
          For UDisc round history, use{" "}
          <Link to="/settings/imports" className="text-primary underline underline-offset-2">
            Settings → Imports
          </Link>{" "}
          to upload your UDisc CSV.
        </>
      ),
      onSave: saveUdisc,
      onSync: syncUdiscNow,
      syncLabel: "Sync UDisc profile",
      href: udiscUrl,
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Linked profiles
        </div>
        <div className="text-xs text-muted-foreground">
          Seed your account from PDGA, Disc Golf Scene, and UDisc.
        </div>
      </div>

      <div className="divide-y divide-border">
        {rows.map((r) => {
          const saveKey = `${r.provider}:save` as const;
          const syncKey = `${r.provider}:sync` as const;
          const saving = busy === saveKey;
          const syncing = busy === syncKey;
          return (
            <div key={r.provider} className="py-3 first:pt-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${r.accent}`}
                  >
                    {r.title}
                  </span>
                  <Badge variant={r.linked ? "default" : "secondary"} className="text-[10px]">
                    {r.linked ? "Linked" : "Not linked"}
                  </Badge>
                  {r.linked && r.href ? (
                    <a
                      href={r.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={r.inputValue}
                  onChange={(e) => r.inputSetter(e.target.value)}
                  placeholder={r.placeholder}
                  className="bg-background/70"
                  disabled={saving || syncing}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={r.onSave}
                    disabled={saving || syncing}
                    className="gap-1.5 sm:min-w-[92px]"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    type="button"
                    onClick={r.onSync}
                    disabled={saving || syncing || !r.inputValue.trim()}
                    className="gap-1.5 sm:min-w-[110px]"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? "Syncing…" : r.syncLabel}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.help}
                {r.hint ? <> {r.hint}</> : null}
              </p>
            </div>
          );
        })}

        {/* Disc Golf Scene — full multi-tab ingestion */}
        <div className="py-3">
          <SceneMultiTabSection
            userId={userId}
            initialUrls={seededSceneUrls}
            onChanged={onChanged}
          />
        </div>
      </div>
    </div>
  );
}
