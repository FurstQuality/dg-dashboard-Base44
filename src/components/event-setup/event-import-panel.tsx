import { stripEventSourceBrands } from "@/lib/event-name";
/**
 * "Start from an existing event" — pulls details from a PDGA event page or a
 * UDisc event link into the setup wizard. It only prefills fields; nothing is
 * submitted, created, or saved by this panel.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Globe, Loader2, Search, Shield, X } from "lucide-react";
import { kbSearchEvents, type KbEvent } from "@/lib/pdga-kb-lookup.functions";
import { getPdgaEventInfo } from "@/lib/pdga-lab.functions";
import { fetchUdiscEvent } from "@/lib/udisc-event.functions";
import { fetchSceneEvent } from "@/lib/scene-event.functions";
import {
  availableGroups,
  describeDraft,
  emptyDraft,
  IMPORT_GROUP_LABELS,
  pickGroups,
  splitLocation,
  timeZoneForState,
  type ImportedEventDraft,
  type ImportGroup,
} from "@/lib/event-import";

type Mode = null | "pdga" | "udisc" | "scene";

const SOURCE_LABEL = { pdga: "PDGA", udisc: "UDisc", scene: "Disc Golf Scene" } as const;

export function EventImportPanel({
  kind,
  onApply,
}: {
  kind: "tournament" | "league";
  onApply: (draft: ImportedEventDraft) => void;
}) {
  const searchPdga = useServerFn(kbSearchEvents);
  const pdgaInfo = useServerFn(getPdgaEventInfo);
  const udiscEvent = useServerFn(fetchUdiscEvent);
  const sceneEvent = useServerFn(fetchSceneEvent);

  const [mode, setMode] = useState<Mode>(null);
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<KbEvent[] | null>(null);
  const [draft, setDraft] = useState<ImportedEventDraft | null>(null);
  const [groups, setGroups] = useState<ImportGroup[]>([]);

  function openDraft(next: ImportedEventDraft) {
    setDraft(next);
    setGroups(availableGroups(next));
    setResults(null);
  }

  function reset() {
    setMode(null);
    setDraft(null);
    setResults(null);
    setQuery("");
    setLink("");
  }

  async function runSearch() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const rows = await searchPdga({ data: { q: query.trim(), limit: 10 } });
      setResults(rows);
      if (!rows.length) toast.info("No PDGA events matched that search.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDGA search failed.");
    } finally {
      setBusy(false);
    }
  }

  function draftFromKb(row: KbEvent): ImportedEventDraft {
    const d = emptyDraft("pdga", row.pdga_url);
    d.name = row.name;
    d.start_date = row.start_date;
    d.end_date = row.end_date ?? row.start_date;
    d.city = row.city;
    d.state = row.state;
    d.location = [row.city, row.state].filter(Boolean).join(", ") || null;
    d.pdga_event_number = row.pdga_event_id ?? null;
    d.pdga_tier = row.tier;
    d.time_zone = timeZoneForState(row.state);
    d.description = row.host_club ? `Hosted by ${row.host_club}.` : null;
    return d;
  }

  async function lookupPdgaLink() {
    const raw = link.trim();
    if (!raw) return;
    setBusy(true);
    try {
      const isNumber = /^\d{1,9}$/.test(raw);
      const info = await pdgaInfo({
        data: isNumber ? { eventRef: raw } : { url: raw },
      });
      const d = emptyDraft("pdga", info.url);
      d.name = info.name ? stripEventSourceBrands(info.name) : null;
      d.start_date = info.start_date ?? null;
      d.end_date = info.end_date ?? info.start_date ?? null;
      d.location = info.location ?? null;
      const parts = splitLocation(info.location);
      d.city = parts.city;
      d.state = parts.state;
      d.time_zone = timeZoneForState(parts.state);
      d.pdga_event_number = info.event_ref ?? null;
      d.pdga_tier = info.tier ?? null;
      d.description = info.description ?? null;
      openDraft(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that PDGA event.");
    } finally {
      setBusy(false);
    }
  }

  async function lookupUdiscLink() {
    const raw = link.trim();
    if (!raw) return;
    setBusy(true);
    try {
      const info =
        mode === "scene"
          ? await sceneEvent({ data: { url: raw } })
          : await udiscEvent({ data: { url: raw } });
      const d = emptyDraft(mode === "scene" ? "scene" : "udisc", info.url);
      d.name = info.name ? stripEventSourceBrands(info.name) : null;
      d.description = info.description;
      d.cover_url = info.cover_url;
      d.start_date = info.start_date;
      d.end_date = info.end_date ?? info.start_date;
      d.location = info.location;
      d.city = info.city;
      d.state = info.state;
      d.course_name = info.course_name;
      d.time_zone = timeZoneForState(info.state);
      openDraft(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Couldn't read that ${mode === "scene" ? "Disc Golf Scene" : "UDisc"} link.`);
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!draft) return;
    onApply(pickGroups(draft, groups));
    toast.success(
      `Filled in from ${SOURCE_LABEL[draft.source]}.`,
      { description: "Review the fields, then keep going through setup." },
    );
    reset();
  }

  const available = draft ? availableGroups(draft) : [];

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Start from an existing event</span>
        <span className="text-xs text-muted-foreground">
          Pull the details in, then finish setup here. Nothing is submitted yet.
        </span>
      </div>

      {!draft && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "pdga" ? "default" : "outline"}
            onClick={() => {
              setMode(mode === "pdga" ? null : "pdga");
              setResults(null);
            }}
          >
            <Shield className="mr-1.5 h-4 w-4" />
            Import from PDGA events
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "udisc" ? "default" : "outline"}
            onClick={() => {
              setMode(mode === "udisc" ? null : "udisc");
              setResults(null);
            }}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Import from UDisc events
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "scene" ? "default" : "outline"}
            onClick={() => {
              setMode(mode === "scene" ? null : "scene");
              setResults(null);
            }}
          >
            <Globe className="mr-1.5 h-4 w-4" />
            Import from DiscGolfScene
          </Button>
        </div>
      )}

      {!draft && mode === "pdga" && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Search PDGA events by name or city</Label>
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
                placeholder="Spring Fling, Charlotte, …"
              />
              <Button type="button" size="sm" onClick={() => void runSearch()} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Or paste a PDGA event URL or event number</Label>
            <div className="flex gap-2">
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://www.pdga.com/tour/event/86677"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void lookupPdgaLink()}
                disabled={busy}
              >
                Look up
              </Button>
            </div>
          </div>
          {results && results.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
              {results.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted/60"
                    onClick={() => openDraft(draftFromKb(row))}
                  >
                    <span className="text-sm font-medium">{row.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        row.tier ? `${row.tier}-tier` : null,
                        row.start_date,
                        [row.city, row.state].filter(Boolean).join(", ") || null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!draft && (mode === "udisc" || mode === "scene") && (
        <div className="mt-3 space-y-1.5">
          <Label className="text-xs">
            Paste a {mode === "scene" ? "Disc Golf Scene" : "UDisc"} event link
          </Label>
          <div className="flex gap-2">
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={
                mode === "scene"
                  ? "https://www.discgolfscene.com/tournaments/…"
                  : "https://udisc.com/events/…"
              }
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void lookupUdiscLink()}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look up"}
            </Button>
          </div>
        </div>
      )}

      {draft && (
        <div className="mt-3 rounded-md border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                Found on {SOURCE_LABEL[draft.source]}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {describeDraft(draft).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={reset} aria-label="Cancel import">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium">Fill in these groups</p>
            {available.map((g) => (
              <label key={g} className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={groups.includes(g)}
                  onChange={(e) =>
                    setGroups((prev) =>
                      e.target.checked ? [...prev, g] : prev.filter((x) => x !== g),
                    )
                  }
                />
                <span>{IMPORT_GROUP_LABELS[g]}</span>
              </label>
            ))}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Divisions, fees, payouts, and {kind === "league" ? "weekly schedule" : "rounds"} aren't
            imported — public event pages don't publish them reliably, so those steps stay yours to
            set. Values you already typed are overwritten only for the groups you check.
          </p>

          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={apply} disabled={!groups.length}>
              Fill these fields
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
