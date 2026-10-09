import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, ShieldCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SaveStateNote, type SaveState } from "@/components/settings/save-state";
import { getMyPrefs, saveMyPrefs } from "@/lib/platform-config.functions";
import { PRIVACY_PREFS_DEFAULTS, type PrivacyPrefs } from "@/lib/platform-config";
import type { ProfileAudience, ProfileSectionKey } from "@/lib/profile-visibility";
import {
  DATA_INVENTORY,
  DATA_INVENTORY_GROUPS,
  describeItemAudience,
  type DataInventoryItem,
} from "@/lib/data-inventory";

export const Route = createFileRoute("/_authenticated/settings/data")({
  head: () => ({
    meta: [
      { title: "Your Data · DG Dashboard" },
      {
        name: "description",
        content:
          "See every piece of data DG Dashboard collects about you and choose what stays public and what stays private.",
      },
      { property: "og:title", content: "Your Data · DG Dashboard" },
      {
        property: "og:description",
        content:
          "A full list of the data DG Dashboard keeps about you, with a public or private control for each item.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: YourDataSettings,
});

const AUDIENCES: { key: ProfileAudience; label: string }[] = [
  { key: "public", label: "Everyone" },
  { key: "friends", label: "Crew" },
  { key: "private", label: "Only me" },
];

const MESSAGE_OPTIONS: { key: PrivacyPrefs["allowMessagesFrom"]; label: string }[] = [
  { key: "everyone", label: "Everyone" },
  { key: "friends", label: "Crew" },
  { key: "nobody", label: "No one" },
];

function YourDataSettings() {
  const load = useServerFn(getMyPrefs);
  const save = useServerFn(saveMyPrefs);
  const [prefs, setPrefs] = useState<PrivacyPrefs>(PRIVACY_PREFS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [query, setQuery] = useState("");
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

  useEffect(() => {
    if (savedSnapshot.current === null) return;
    const dirty = JSON.stringify(prefs) !== savedSnapshot.current;
    setSaveState((s) => (dirty ? "dirty" : s === "dirty" ? "clean" : s));
  }, [prefs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DATA_INVENTORY;
    return DATA_INVENTORY.filter((item) =>
      [item.label, item.collected, item.usedFor, item.group, item.source]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

  const counts = useMemo(() => {
    let everyone = 0;
    let crew = 0;
    let onlyMe = 0;
    for (const item of DATA_INVENTORY) {
      const state = describeItemAudience(item, prefs);
      if (state === "Everyone") everyone += 1;
      else if (state === "Crew only") crew += 1;
      else if (state === "Only me" || state === "Private") onlyMe += 1;
    }
    return { everyone, crew, onlyMe };
  }, [prefs]);

  function setSection(key: ProfileSectionKey, audience: ProfileAudience) {
    setPrefs((p) => ({ ...p, sections: { ...p.sections, [key]: audience } }));
  }

  function setAllSections(audience: ProfileAudience) {
    setPrefs((p) => {
      const sections = { ...p.sections };
      for (const item of DATA_INVENTORY) {
        if (item.control.kind === "section") sections[item.control.section] = audience;
      }
      return { ...p, sections };
    });
  }

  async function onSave() {
    setSaving(true);
    setSaveState("saving");
    try {
      await save({ data: { privacy: prefs } });
      savedSnapshot.current = JSON.stringify(prefs);
      setSaveState("saved");
      toast.success("Your data settings saved");
    } catch (err) {
      setSaveState("error");
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Everything we keep about you</div>
            <p className="text-xs text-muted-foreground">
              {DATA_INVENTORY.length} kinds of data, what each one is used for, and who can see it.
              Items marked Private are never shown to other players. Anything you set to Only me is
              removed before your profile is sent to anyone else.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border px-2.5 py-1">
            Everyone: <b className="text-foreground">{counts.everyone}</b>
          </span>
          <span className="rounded-full border border-border px-2.5 py-1">
            Crew only: <b className="text-foreground">{counts.crew}</b>
          </span>
          <span className="rounded-full border border-border px-2.5 py-1">
            Private: <b className="text-foreground">{counts.onlyMe}</b>
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAllSections("public")}>
            Share all with everyone
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAllSections("friends")}>
            Crew only
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAllSections("private")}>
            Make everything private
          </Button>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your data — rounds, photos, location…"
            className="pl-9"
          />
        </div>
      </section>

      {DATA_INVENTORY_GROUPS.map((group) => {
        const items = filtered.filter((i) => i.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </div>
            <div className="space-y-2">
              {items.map((item) => (
                <InventoryRow
                  key={item.key}
                  item={item}
                  prefs={prefs}
                  onSection={setSection}
                  onPrefs={setPrefs}
                />
              ))}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Nothing matches “{query}”. Try a shorter word like rounds, bag, or photos.
        </p>
      ) : null}

      <div className="sticky bottom-4 flex items-center justify-end gap-3">
        <SaveStateNote state={saveState} />
        <Button onClick={onSave} disabled={saving || loading}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function InventoryRow({
  item,
  prefs,
  onSection,
  onPrefs,
}: {
  item: DataInventoryItem;
  prefs: PrivacyPrefs;
  onSection: (key: ProfileSectionKey, audience: ProfileAudience) => void;
  onPrefs: React.Dispatch<React.SetStateAction<PrivacyPrefs>>;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background p-3">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium">{item.label}</div>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            From: {item.source}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{item.collected}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          <b className="text-foreground/80">Used for:</b> {item.usedFor}
        </div>
        {item.control.kind === "private" ? (
          <div className="mt-1 text-xs text-muted-foreground">{item.control.note}</div>
        ) : null}
      </div>

      <div className="shrink-0">
        {item.control.kind === "section" ? (
          <Segmented
            options={AUDIENCES}
            value={prefs.sections[item.control.section]}
            onChange={(v) =>
              onSection(
                (item.control as { kind: "section"; section: ProfileSectionKey }).section,
                v as ProfileAudience,
              )
            }
          />
        ) : item.control.kind === "choice" ? (
          <Segmented
            options={MESSAGE_OPTIONS}
            value={prefs.allowMessagesFrom}
            onChange={(v) =>
              onPrefs((p) => ({
                ...p,
                allowMessagesFrom: v as PrivacyPrefs["allowMessagesFrom"],
              }))
            }
          />
        ) : item.control.kind === "toggle" ? (
          <Switch
            checked={Boolean(prefs[item.control.pref])}
            onCheckedChange={(v) =>
              onPrefs((p) => ({
                ...p,
                [(item.control as { kind: "toggle"; pref: keyof PrivacyPrefs }).pref]: v,
              }))
            }
          />
        ) : (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Private
          </span>
        )}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-border p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={
            "rounded-md px-3 py-1 text-xs font-medium transition " +
            (value === o.key
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
