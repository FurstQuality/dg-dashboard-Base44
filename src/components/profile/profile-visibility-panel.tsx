import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SaveStateNote, type SaveState } from "@/components/settings/save-state";
import { getMyPrefs, saveMyPrefs } from "@/lib/platform-config.functions";
import { PRIVACY_PREFS_DEFAULTS, type PrivacyPrefs } from "@/lib/platform-config";
import {
  PROFILE_SECTIONS,
  type ProfileAudience,
  type ProfileSectionKey,
} from "@/lib/profile-visibility";

/**
 * Who sees what on a player's profile. Used both by Settings › Privacy and by
 * the Edit profile tab on the profile page, so the two never drift apart.
 */

const AUDIENCES: { key: ProfileAudience; label: string }[] = [
  { key: "public", label: "Everyone" },
  { key: "friends", label: "Crew" },
  { key: "private", label: "Only me" },
];

const SECTION_GROUPS = ["Identity", "Performance", "Activity", "Social"] as const;

const VISIBILITY: { key: PrivacyPrefs["profileVisibility"]; label: string; hint: string }[] = [
  { key: "public", label: "Public", hint: "Anyone can see your profile and shared rounds." },
  {
    key: "friends",
    label: "Crew only",
    hint: "Only Crew members you've accepted see the details.",
  },
  {
    key: "private",
    label: "Private",
    hint: "Only you. Your name still appears in tournaments you register for.",
  },
];

const MESSAGES: { key: PrivacyPrefs["allowMessagesFrom"]; label: string }[] = [
  { key: "everyone", label: "Everyone" },
  { key: "friends", label: "Crew only" },
  { key: "nobody", label: "No one" },
];

const TOGGLES: { key: keyof PrivacyPrefs; label: string; hint: string }[] = [
  {
    key: "showInSearch",
    label: "Show me in search",
    hint: "Players can find you by name or PDGA #.",
  },
  {
    key: "allowFriendRequests",
    label: "Accept new Crew requests",
    hint: "Turn off to pause new invites.",
  },
];

export function ProfileVisibilityPanel({ showDataLink = true }: { showDataLink?: boolean }) {
  const load = useServerFn(getMyPrefs);
  const save = useServerFn(saveMyPrefs);
  const [prefs, setPrefs] = useState<PrivacyPrefs>(PRIVACY_PREFS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const savedSnapshot = useRef<string | null>(null);

  useEffect(() => {
    load()
      .then((r) => {
        setPrefs(r.privacy);
        savedSnapshot.current = JSON.stringify(r.privacy);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load]);

  function setSection(key: ProfileSectionKey, audience: ProfileAudience) {
    setPrefs((p) => ({ ...p, sections: { ...p.sections, [key]: audience } }));
  }

  // Flags unsaved edits so the panel never looks stored when it is not.
  useEffect(() => {
    if (savedSnapshot.current === null) return;
    const dirty = JSON.stringify(prefs) !== savedSnapshot.current;
    setSaveState((s) => (dirty ? "dirty" : s === "dirty" ? "clean" : s));
  }, [prefs]);

  async function onSave() {
    setSaving(true);
    setSaveState("saving");
    try {
      // Re-read first so settings this panel does not edit — such as the stat
      // highlights picked elsewhere on the profile — are never overwritten.
      const fresh = await load()
        .then((r) => r.privacy)
        .catch(() => prefs);
      const next: PrivacyPrefs = {
        ...fresh,
        profileVisibility: prefs.profileVisibility,
        showInSearch: prefs.showInSearch,
        allowFriendRequests: prefs.allowFriendRequests,
        allowMessagesFrom: prefs.allowMessagesFrom,
        sections: prefs.sections,
      };
      await save({ data: { privacy: next } });
      setPrefs(next);
      savedSnapshot.current = JSON.stringify(next);
      setSaveState("saved");
      toast.success("Privacy settings saved");
    } catch (err) {
      setSaveState("error");
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {showDataLink && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Want the full list of everything DG Dashboard keeps about you, with a control on each
              item?
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings/data">See your data</Link>
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <SectionHeader
          title="Profile visibility"
          hint="Controls what other players see on your profile page."
        />
        <div className="grid gap-2 sm:grid-cols-3">
          {VISIBILITY.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, profileVisibility: v.key }))}
              className={
                "rounded-lg border-2 p-3 text-left transition " +
                (prefs.profileVisibility === v.key
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/60")
              }
            >
              <div className="text-sm font-semibold">{v.label}</div>
              <div className="text-[11px] text-muted-foreground">{v.hint}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <SectionHeader title="What's visible" hint="Fine-tune what other players can see." />
        <div className="grid gap-2 sm:grid-cols-2">
          {TOGGLES.map((t) => (
            <label
              key={t.key}
              className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-background p-3 hover:border-primary/50"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-[11px] text-muted-foreground">{t.hint}</div>
              </div>
              <Switch
                checked={Boolean(prefs[t.key])}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, [t.key]: v }))}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <SectionHeader
          title="Profile sections"
          hint="Choose the audience for each part of your profile. Account visibility above can only tighten these, never loosen them."
        />
        <div className="space-y-4">
          {SECTION_GROUPS.map((group) => (
            <div key={group}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </div>
              <div className="space-y-2">
                {PROFILE_SECTIONS.filter((s) => s.group === group).map((s) => (
                  <div
                    key={s.key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground">{s.hint}</div>
                    </div>
                    <div className="flex gap-1 rounded-lg border border-border p-1">
                      {AUDIENCES.map((a) => (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => setSection(s.key, a.key)}
                          className={
                            "rounded-md px-3 py-1 text-xs font-medium transition " +
                            (prefs.sections[s.key] === a.key
                              ? "bg-primary/15 text-primary"
                              : "text-muted-foreground hover:text-foreground")
                          }
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <SectionHeader title="Direct messages" hint="Who can start a new conversation with you." />
        <div className="flex flex-wrap gap-2">
          {MESSAGES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, allowMessagesFrom: m.key }))}
              className={
                "rounded-full border-2 px-4 py-1.5 text-sm font-medium transition " +
                (prefs.allowMessagesFrom === m.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/60")
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        <Label className="mt-3 block text-[11px] text-muted-foreground">
          Tournament directors can always reach you about events you're registered for.
        </Label>
      </section>

      <div className="flex items-center justify-end gap-3">
        <SaveStateNote state={saveState} />
        <Button onClick={onSave} disabled={saving || loading}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Lock className="h-4 w-4 text-primary" />
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}
