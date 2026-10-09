import { formatToPar } from "@/lib/score-display";
import { useServerFn } from "@tanstack/react-start";
import { individualNames, parseUdiscScorecards, summarizeScorecards } from "@/lib/udisc-scorecards";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { matchesOmnisearch } from "@/lib/omnisearch";

const ROWS_PER_PAGE = 50;

import { normalizeAlias, parseAliases } from "@/lib/player-aliases";
import { readTextFile } from "@/lib/read-text-file";

import { toast } from "sonner";
import { Upload, Trophy, Pencil, Trash2, ExternalLink, History, Globe } from "lucide-react";

import { DataHubPage } from "@/components/imports/data-hub-panel";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

import {
  importUDiscCsv,
  importPdgaRounds,
  addManualRound,
  listMyImports,
  deleteImportedRound,
} from "@/lib/import-rounds.functions";
import { importSceneProfile } from "@/lib/scene-import.functions";
import {
  SCENE_PROFILE_TABS,
  SCENE_TAB_LABELS,
  sceneProfileTabUrls,
  type SceneProfileTab,
} from "@/lib/scene-profile-urls";
import { supabase } from "@/integrations/supabase/client";
import { invalidatePlayerDataQueries } from "@/lib/pdga-sync";

export function ImportPage() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        UDisc and PDGA don't offer public APIs, so imports read what those services already publish:
        your UDisc CSV export and your public PDGA rated-rounds page.
      </p>

      <Tabs defaultValue="udisc" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 md:grid md:grid-cols-5">
          <TabsTrigger value="udisc" className="shrink-0 whitespace-nowrap">
            <Upload className="mr-2 h-4 w-4" /> UDisc CSV
          </TabsTrigger>
          <TabsTrigger value="pdga" className="shrink-0 whitespace-nowrap">
            <Trophy className="mr-2 h-4 w-4" /> PDGA Lookup
          </TabsTrigger>
          <TabsTrigger value="dgs" className="shrink-0 whitespace-nowrap">
            <Globe className="mr-2 h-4 w-4" /> Disc Golf Scene
          </TabsTrigger>
          <TabsTrigger value="manual" className="shrink-0 whitespace-nowrap">
            <Pencil className="mr-2 h-4 w-4" /> Manual Entry
          </TabsTrigger>
          <TabsTrigger value="url" className="shrink-0 whitespace-nowrap">
            <History className="mr-2 h-4 w-4" /> History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="udisc">
          <UDiscImportForm />
        </TabsContent>
        <TabsContent value="pdga">
          <PdgaLookupForm />
        </TabsContent>
        <TabsContent value="dgs">
          <SceneImportForm />
        </TabsContent>
        <TabsContent value="manual">
          <ManualEntryForm />
        </TabsContent>
        <TabsContent value="url" className="space-y-4">
          <DataHubPage />
          {/* Raw imported rows, moved here from the Statboard so players see each round once there. */}
          <ImportsList />
        </TabsContent>
      </Tabs>

      {/* Round & rating analytics live on StatLink (/stats) — this page is for importing only. */}
    </div>
  );
}

/* ---------------- UDisc CSV ---------------- */
function UDiscImportForm() {
  const qc = useQueryClient();
  const importFn = useServerFn(importUDiscCsv);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState<{ inserted: number; note: string | null } | null>(null);

  const names = useMemo(() => (csvText ? individualNames(csvText) : []), [csvText]);
  const cards = useMemo(
    () => (csvText ? parseUdiscScorecards(csvText, picked) : []),
    [csvText, picked],
  );
  const sum = useMemo(() => summarizeScorecards(cards), [cards]);

  const [progress, setProgress] = useState<{ saved: number; total: number } | null>(null);
  const { mutate, isPending } = useMutation({
    mutationFn: async (v: { csvText: string; confirmedPlayerNames: string[]; total: number }) => {
      // Save 5 rounds per call so the button can show live progress.
      let saved = 0;
      let total = v.total;
      setProgress({ saved, total });
      for (let guard = 0; guard < 400; guard++) {
        const res = await importFn({
          data: { csvText: v.csvText, confirmedPlayerNames: v.confirmedPlayerNames, maxInsert: 5 },
        });
        saved += res.inserted;
        const remaining = (res as { remaining?: number }).remaining ?? 0;
        total = Math.max(saved + remaining, saved);
        setProgress({ saved, total });
        if (remaining === 0 || res.inserted === 0) return { ...res, inserted: saved };
      }
      throw new Error(`Saved ${saved} rounds, then stopped. Upload the file again to add the rest.`);
    },
    onSettled: () => setProgress(null),
    onSuccess: (res) => {
      const dup = (res.skips as Record<string, number> | undefined)?.duplicate ?? 0;
      const note =
        res.inserted > 0
          ? null
          : (res.message ?? "Nothing new to add — these rounds are already in your history.");
      void dup;
      setDone({ inserted: res.inserted, note });
      if (res.inserted > 0)
        toast.success(`Added ${res.inserted} round${res.inserted === 1 ? "" : "s"} to your history.`);
      else toast.message(note ?? "Nothing new to add.");
      qc.invalidateQueries({ queryKey: ["imports"] });
      invalidatePlayerDataQueries(qc);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function onFile(f: File) {
    const read = await readTextFile(f);
    if (!read.ok) {
      toast.error(read.error, read.hint ? { description: read.hint } : undefined);
      return;
    }
    const top = individualNames(read.text)[0];
    setCsvText(read.text);
    setFileName(read.name);
    setPicked(top ? [top.name] : []);
    setDone(null);
  }

  function reset() {
    setCsvText("");
    setFileName(null);
    setPicked([]);
    setDone(null);
  }

  const qualifying = cards.filter((c) => c.classification === "SINGLES_MULTI_PLAYER");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload your UDisc scorecards</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!csvText && (
          <>
            <label
              htmlFor="udisc-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center hover:bg-muted/40"
            >
              <Upload className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Choose your UDisc CSV file</span>
              <span className="text-sm text-muted-foreground">
                You'll see what we found before anything is saved.
              </span>
              <input
                id="udisc-file"
                type="file"
                className="sr-only"
                accept=".csv,.txt,text/csv,text/plain,text/comma-separated-values,application/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onFile(f);
                }}
              />
            </label>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer">Where do I get this file?</summary>
              <p className="mt-2">
                In the UDisc app: profile photo → Rounds → ⋯ menu → Export CSV. Save or email it to
                yourself, then choose it here.{" "}
                <a
                  className="inline-flex items-center gap-1 text-primary underline"
                  href="https://udisc.com/blog/post/how-to-export-your-udisc-scorecards"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  UDisc guide <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </details>
          </>
        )}

        {csvText && !done && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm text-muted-foreground">{fileName}</p>
              <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
                Choose a different file
              </Button>
            </div>

            <div>
              <p className="font-medium">Which names are you?</p>
              <p className="text-sm text-muted-foreground">
                Exact matches only — pick every name you've used in UDisc.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {names.slice(0, 12).map((n) => {
                  const on = picked.includes(n.name);
                  return (
                    <button
                      key={n.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((cur) => (on ? cur.filter((x) => x !== n.name) : [...cur, n.name]))
                      }
                      className={
                        "rounded-full border px-3 py-1 text-sm transition-colors " +
                        (on ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/40")
                      }
                    >
                      {n.name} <span className="text-muted-foreground">({n.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {[
                    ["Scorecards found", sum.total],
                    ["Singles with cardmates — will count", sum.multi],
                    ["  with a UDisc round rating", sum.rated],
                    ["  without a UDisc round rating", sum.unrated],
                    ["Singles played alone — left out", sum.solo],
                    ["Doubles or team cards — left out", sum.team],
                    ["Needs review (your name not found or unclear teams)", sum.unknown],
                  ].map(([label, value]) => (
                    <tr key={label as string}>
                      <td className="whitespace-pre px-3 py-2">{label}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {qualifying.length > 0 && (
              <div className="max-h-96 space-y-2 overflow-y-auto rounded-md border p-2">
                {qualifying.slice(0, 50).map((c) => (
                  <details key={c.index} className="rounded-md border bg-muted/20 px-3 py-2">
                    <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{c.course}</span>
                      <span className="text-muted-foreground">{c.layout}</span>
                      <span className="ml-auto tabular-nums text-muted-foreground">
                        {c.date} · Par {c.par ?? "—"} · {c.participants.length} players
                      </span>
                    </summary>
                    <table className="mt-2 w-full text-sm">
                      <tbody>
                        {c.participants.map((p) => (
                          <tr key={p.name} className={p.isMe ? "font-medium text-primary" : ""}>
                            <td className="py-1">{p.name}</td>
                            <td className="py-1 text-right tabular-nums">{p.total ?? "—"}</td>
                            <td className="py-1 text-right tabular-nums">{p.plusMinus || "—"}</td>
                            <td className="py-1 text-right tabular-nums">
                              {p.rating != null ? `UDisc ${p.rating}` : "No rating"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ))}
                {qualifying.length > 50 && (
                  <p className="px-1 text-sm text-muted-foreground">
                    Showing the 50 most recent of {qualifying.length} qualifying scorecards.
                  </p>
                )}
              </div>
            )}

            <Button
              className="w-full"
              disabled={picked.length === 0 || sum.multi === 0 || isPending}
              onClick={() =>
                mutate({ csvText, confirmedPlayerNames: picked, total: sum.multi - sum.unfinished })
              }
            >
              {isPending
                ? progress
                  ? `Adding rounds… ${progress.saved}/${progress.total}`
                  : "Adding your rounds…"
                : `Add ${sum.multi - sum.unfinished} round${sum.multi - sum.unfinished === 1 ? "" : "s"}`}
            </Button>
          </div>
        )}

        {done && (
          <div className="space-y-3 text-center">
            <p className="font-medium">
              {done.inserted > 0
                ? `Added ${done.inserted} round${done.inserted === 1 ? "" : "s"} to your history.`
                : "No rounds were added."}
            </p>
            {done.note && <p className="text-sm text-muted-foreground">{done.note}</p>}
            <Button variant="outline" onClick={reset}>
              Upload another file
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


/* ---------------- PDGA lookup ---------------- */
function PdgaLookupForm() {
  const qc = useQueryClient();
  const importFn = useServerFn(importPdgaRounds);
  const [num, setNum] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: (v: { pdgaNumber: number }) => importFn({ data: v }),
    onSuccess: (res) => {
      toast.success(`Imported ${res.inserted} PDGA rated round${res.inserted === 1 ? "" : "s"}.`);
      if (res.message) toast.message(res.message);
      qc.invalidateQueries({ queryKey: ["imports"] });
      invalidatePlayerDataQueries(qc);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const parsed = /^\d+$/.test(num.trim()) ? Number(num.trim()) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Look up your PDGA rated rounds</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter your PDGA number — we'll pull your public rated-round history from{" "}
          <a
            className="text-primary underline inline-flex items-center gap-1"
            href="https://www.pdga.com/players"
            target="_blank"
            rel="noopener noreferrer"
          >
            pdga.com <ExternalLink className="h-3 w-3" />
          </a>{" "}
          and merge only rounds you haven't already imported.
        </p>

        <div className="grid gap-2">
          <Label htmlFor="pdga-num">PDGA number</Label>
          <Input
            id="pdga-num"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 12345"
            value={num}
            onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 9))}
          />
        </div>

        <Button
          onClick={() => parsed && mutate({ pdgaNumber: parsed })}
          disabled={!parsed || isPending}
          className="w-full"
        >
          {isPending ? "Fetching from PDGA…" : "Import my PDGA rated rounds"}
        </Button>

        <p className="text-xs text-muted-foreground">
          We save your PDGA number to your profile so you can re-run this later to pick up new
          events.
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------------- Disc Golf Scene ---------------- */
function SceneImportForm() {
  const qc = useQueryClient();
  const importFn = useServerFn(importSceneProfile);
  const [profileUrl, setProfileUrl] = useState("");
  const [applyToMe, setApplyToMe] = useState(true);

  const derived = sceneProfileTabUrls(profileUrl);
  const touched = profileUrl.trim().length > 0;

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      if (!derived) throw new Error("Paste your Disc Golf Scene profile address first.");
      return importFn({ data: { urls: derived, applyToMe } });
    },
    onSuccess: (res) => {
      const bits: string[] = [];
      const scores = res.perTab.scores?.stored ?? 0;
      if (scores) bits.push(`${scores} round${scores === 1 ? "" : "s"}`);
      for (const tab of ["aces", "achievements", "series", "friends"] as const) {
        const stored = res.perTab[tab]?.stored ?? 0;
        if (stored) bits.push(`${stored} ${SCENE_TAB_LABELS[tab].toLowerCase()}`);
      }
      if (res.applied) bits.push("profile updated");
      toast.success(
        bits.length ? `Pulled in ${bits.join(" · ")}.` : "Disc Golf Scene sync complete.",
      );
      const failed = (Object.entries(res.perTab) as [SceneProfileTab, { error?: string }][]).filter(
        ([, v]) => v.error,
      );
      if (failed.length) {
        toast.message(
          `Couldn't read: ${failed.map(([tab]) => SCENE_TAB_LABELS[tab].toLowerCase()).join(", ")}`,
          { description: "Those pages may be private or empty on Disc Golf Scene." },
        );
      }
      qc.invalidateQueries({ queryKey: ["imports"] });
      invalidatePlayerDataQueries(qc);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync from your Disc Golf Scene profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">One address covers everything</p>
          <p className="mt-1 text-muted-foreground">
            Open your profile on{" "}
            <a
              className="text-primary underline inline-flex items-center gap-1"
              href="https://www.discgolfscene.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              discgolfscene.com <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and paste the address from your browser bar. We read every tab on it — details, rounds,
            aces, achievements, series, and friends — so you don't have to copy each one.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Disc Golf Scene has no public feed for this, so we read the same pages you'd read in a
            browser. Nothing is ever written to Disc Golf Scene on your behalf.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="scene-profile">Your Disc Golf Scene profile address</Label>
          <Input
            id="scene-profile"
            placeholder="https://www.discgolfscene.com/profile/235173"
            value={profileUrl}
            onChange={(e) => setProfileUrl(e.target.value)}
            maxLength={500}
          />
          {touched && !derived ? (
            <p className="text-xs text-destructive">
              That doesn't look like a Disc Golf Scene profile. It should look like
              discgolfscene.com/profile/235173 — your profile number or handle also works.
            </p>
          ) : null}
        </div>

        {derived ? (
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium">Pages we'll pull</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {SCENE_PROFILE_TABS.map((tab) => (
                <li key={tab} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">{SCENE_TAB_LABELS[tab]}</span>
                  <span className="break-all">{derived[tab]}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={applyToMe}
            onChange={(e) => setApplyToMe(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Fill in my profile fields (name, city, PDGA #) from Disc Golf Scene if blank
        </label>

        <Button onClick={() => mutate()} disabled={!derived || isPending} className="w-full">
          {isPending ? "Syncing every page…" : "Sync my Disc Golf Scene profile"}
        </Button>

        <p className="text-xs text-muted-foreground">
          Need a specific club, tournament, or event page instead? Use the <b>History</b> tab's URL
          scraper — it accepts any Disc Golf Scene address.
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------------- Manual entry ---------------- */
function ManualEntryForm() {
  const qc = useQueryClient();
  const addFn = useServerFn(addManualRound);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    courseName: "",
    layoutName: "",
    eventName: "",
    playedOn: today,
    score: "",
    toPar: "",
    roundRating: "",
    ssa: "",
    notes: "",
  });

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          courseName: form.courseName.trim(),
          layoutName: form.layoutName.trim() || null,
          eventName: form.eventName.trim() || null,
          playedOn: form.playedOn,
          score: form.score ? Number(form.score) : null,
          toPar: form.toPar ? Number(form.toPar) : null,
          roundRating: form.roundRating ? Number(form.roundRating) : null,
          ssa: form.ssa ? Number(form.ssa) : null,
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Round added.");
      setForm({
        ...form,
        courseName: "",
        eventName: "",
        score: "",
        toPar: "",
        roundRating: "",
        ssa: "",
        notes: "",
      });
      qc.invalidateQueries({ queryKey: ["imports"] });
      invalidatePlayerDataQueries(qc);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log a single round</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Course *</Label>
            <Input value={form.courseName} onChange={set("courseName")} maxLength={200} />
          </div>
          <div className="grid gap-1.5">
            <Label>Layout</Label>
            <Input value={form.layoutName} onChange={set("layoutName")} maxLength={200} />
          </div>
          <div className="grid gap-1.5">
            <Label>Event</Label>
            <Input value={form.eventName} onChange={set("eventName")} maxLength={200} />
          </div>
          <div className="grid gap-1.5">
            <Label>Date *</Label>
            <Input type="date" value={form.playedOn} onChange={set("playedOn")} />
          </div>
          <div className="grid gap-1.5">
            <Label>Total score</Label>
            <Input type="number" inputMode="numeric" value={form.score} onChange={set("score")} />
          </div>
          <div className="grid gap-1.5">
            <Label>+/- (to par)</Label>
            <Input type="number" inputMode="numeric" value={form.toPar} onChange={set("toPar")} />
          </div>
          <div className="grid gap-1.5">
            <Label>Round rating</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.roundRating}
              onChange={set("roundRating")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>SSA (course scratch)</Label>
            <Input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={form.ssa}
              onChange={set("ssa")}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={set("notes")} maxLength={500} />
        </div>
        <Button
          onClick={() => mutate()}
          disabled={!form.courseName || !form.playedOn || isPending}
          className="w-full"
        >
          {isPending ? "Saving…" : "Save round"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------------- Recent imports + analytics ---------------- */
type ImportedRound = {
  id: string;
  source: string;
  course_name: string;
  layout_name: string | null;
  event_name: string | null;
  played_on: string;
  score: number | null;
  to_par: number | null;
  round_rating: number | null;
  ssa: number | null;
  notes: string | null;
  format?: string | null;
  included?: boolean | null;
};

export function ImportsAnalytics() {
  const listFn = useServerFn(listMyImports);
  const { data } = useQuery({ queryKey: ["imports"], queryFn: () => listFn() });
  const { data: profile } = useQuery({
    queryKey: ["me-profile-pdga"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data: p } = await supabase
        .from("profiles")
        .select("pdga_rating")
        .eq("id", auth.user.id)
        .maybeSingle();
      return p as { pdga_rating: number | null } | null;
    },
  });
  const rounds = (data ?? []) as ImportedRound[];
  if (!rounds.length) return null;
  const analytics = computeAnalytics(rounds, profile?.pdga_rating ?? null);
  return <AnalyticsPanel a={analytics} />;
}

export function ImportsList() {
  const listFn = useServerFn(listMyImports);
  const delFn = useServerFn(deleteImportedRound);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["imports"], queryFn: () => listFn() });

  const [q, setQ] = useState("");
  const [source, setSource] = useState<"all" | "pdga" | "udisc" | "manual">("all");
  // Rows reveal in batches so the table flows with the page instead of
  // scrolling inside its own box.
  const [visible, setVisible] = useState(ROWS_PER_PAGE);
  useEffect(() => {
    setVisible(ROWS_PER_PAGE);
  }, [source, q]);

  const { mutate: del } = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed.");
      qc.invalidateQueries({ queryKey: ["imports"] });
      invalidatePlayerDataQueries(qc);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rounds = (data ?? []) as ImportedRound[];
  if (!rounds.length) return null;

  const analytics = computeAnalytics(rounds);

  const filtered = rounds.filter((r) => {
    if (source !== "all" && r.source !== source) return false;
    return matchesOmnisearch(r, q);
  });

  void analytics;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>All imported rounds ({rounds.length.toLocaleString()})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search course, event, date…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-56"
            />
            <div className="inline-flex rounded-md border p-0.5 text-xs">
              {(["all", "pdga", "udisc", "manual"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`rounded px-2 py-1 uppercase ${source === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/80 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Course</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">+/-</th>
                  <th className="px-3 py-2 text-right">Rating</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, visible).map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className="uppercase">
                        {r.source}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.played_on}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.course_name}</div>
                      {r.layout_name || r.event_name ? (
                        <div className="text-xs text-muted-foreground">
                          {[r.event_name, r.layout_name].filter(Boolean).join(" • ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">{r.score ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{formatToPar(r.to_par)}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.round_rating ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={() => del(r.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No rounds match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              Showing {Math.min(visible, filtered.length)} of {filtered.length} rounds
            </span>
            {visible < filtered.length && (
              <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + ROWS_PER_PAGE)}>
                Show more rounds
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


type Analytics = ReturnType<typeof computeAnalytics>;

function computeAnalytics(rounds: ImportedRound[], officialPdga: number | null = null) {
  const today = new Date();
  const cutoff12mo = new Date(today);
  cutoff12mo.setMonth(cutoff12mo.getMonth() - 12);
  const cutoff24mo = new Date(today);
  cutoff24mo.setMonth(cutoff24mo.getMonth() - 24);
  const cutoff90 = new Date(today);
  cutoff90.setDate(cutoff90.getDate() - 90);

  const rated = rounds.filter((r) => typeof r.round_rating === "number");

  // PDGA-eligible: singles, still counted by PDGA (included !== false), rated.
  const pdgaEligible = rated.filter(
    (r) =>
      r.source === "pdga" &&
      (r.format ?? "singles").toLowerCase() === "singles" &&
      r.included !== false,
  );
  const pdga12 = pdgaEligible.filter((r) => new Date(r.played_on) >= cutoff12mo);
  const pdga24 = pdgaEligible.filter((r) => new Date(r.played_on) >= cutoff24mo);

  // Current rating: prefer official PDGA rating from the player's profile.
  // Otherwise mirror the PDGA algorithm (12mo → 24mo fallback, drop rounds
  // >100 pts AND >2.5σ below mean, 2× weight on the most recent 25% by date).
  let currentRating = 0;
  let ratingSource: "pdga_official" | "pdga" | "blended" | "none" = "none";
  let ratingSample = 0;

  if (typeof officialPdga === "number" && officialPdga > 0) {
    currentRating = officialPdga;
    ratingSource = "pdga_official";
    ratingSample = pdga12.length || pdga24.length;
  } else if (pdga24.length) {
    const window = pdga12.length >= 8 ? pdga12 : pdga24;
    const sorted = [...window]
      .sort((a, b) => (a.played_on < b.played_on ? 1 : -1))
      .map((r) => ({ r: r.round_rating as number, d: r.played_on }));
    const rs = sorted.map((x) => x.r);
    const mean = avg(rs);
    const sd = stddev(rs, mean);
    const keep =
      sorted.length < 7 ? sorted : sorted.filter((x) => x.r >= mean - Math.max(100, 2.5 * sd));
    const n = keep.length;
    const boostCount = n >= 9 ? Math.max(1, Math.ceil(n / 4)) : 0;
    let wsum = 0;
    let wtot = 0;
    keep.forEach((x, i) => {
      const w = i < boostCount ? 2 : 1;
      wsum += x.r * w;
      wtot += w;
    });
    currentRating = wtot ? Math.round(wsum / wtot) : 0;
    ratingSource = "pdga";
    ratingSample = n;
  } else if (rated.length) {
    const last8 = [...rated]
      .sort((a, b) => (a.played_on < b.played_on ? 1 : -1))
      .slice(0, 8)
      .map((r) => r.round_rating!) as number[];
    currentRating = Math.round(avg(last8));
    ratingSource = "blended";
    ratingSample = last8.length;
  }

  // Projection: trend of last 10 rated rounds → extrapolate 30 days out.
  const recent = [...rated]
    .sort((a, b) => (a.played_on < b.played_on ? 1 : -1))
    .slice(0, 10)
    .reverse();
  let projected30 = currentRating;
  let trendPerRound = 0;
  if (recent.length >= 3) {
    const xs = recent.map((_, i) => i);
    const ys = recent.map((r) => r.round_rating!);
    trendPerRound = linRegSlope(xs, ys);
    // Assume ~1 rated round/week going forward; project 4 rounds ahead.
    projected30 = Math.round(currentRating + trendPerRound * 4);
  }

  const best = rated.reduce<ImportedRound | null>(
    (a, r) => (!a || (r.round_rating ?? 0) > (a.round_rating ?? 0) ? r : a),
    null,
  );
  const worst = rated.reduce<ImportedRound | null>(
    (a, r) => (!a || (r.round_rating ?? 1500) < (a.round_rating ?? 1500) ? r : a),
    null,
  );

  const roundsLast90 = rounds.filter((r) => new Date(r.played_on) >= cutoff90).length;

  // Per-course averages (min 2 rounds)
  const byCourse = new Map<
    string,
    { name: string; rounds: number; avgRating: number | null; avgToPar: number | null }
  >();
  for (const r of rounds) {
    const key = r.course_name;
    if (!byCourse.has(key))
      byCourse.set(key, { name: key, rounds: 0, avgRating: null, avgToPar: null });
    const c = byCourse.get(key)!;
    c.rounds++;
  }
  for (const c of byCourse.values()) {
    const list = rounds.filter((r) => r.course_name === c.name);
    const ratings = list.map((r) => r.round_rating).filter((v): v is number => v !== null);
    const tps = list.map((r) => r.to_par).filter((v): v is number => v !== null);
    c.avgRating = ratings.length ? Math.round(avg(ratings)) : null;
    c.avgToPar = tps.length ? Number(avg(tps).toFixed(1)) : null;
  }
  const topCourses = [...byCourse.values()]
    .filter((c) => c.rounds >= 2)
    .sort((a, b) => b.rounds - a.rounds)
    .slice(0, 6);

  // Monthly rating trend — build a continuous 12-month series so months with
  // no rated rounds render as a gap rather than getting silently dropped.
  const monthMap = new Map<string, number[]>();
  for (const r of rated) {
    const d = new Date(r.played_on);
    if (d < cutoff12mo) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(r.round_rating!);
  }
  const monthly: { month: string; label: string; avg: number | null; count: number }[] = [];
  const cursor = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  for (let i = 0; i < 12; i++) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const arr = monthMap.get(key) ?? [];
    monthly.push({
      month: key,
      label: cursor.toLocaleString(undefined, { month: "short" }),
      avg: arr.length ? Math.round(avg(arr)) : null,
      count: arr.length,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return {
    total: rounds.length,
    ratedCount: rated.length,
    pdgaCount: rated.filter((r) => r.source === "pdga").length,
    pdga12mo: pdga12.length,
    roundsLast90,
    currentRating,
    ratingSource,
    ratingSample,
    projected30,
    trendPerRound,
    best,
    worst,
    topCourses,
    monthly,
  };
}

function avg(a: number[]) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}
function stddev(a: number[], mean: number) {
  if (a.length < 2) return 0;
  return Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length);
}
function linRegSlope(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = avg(xs);
  const my = avg(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function AnalyticsPanel({ a }: { a: Analytics }) {
  const projDelta = a.projected30 - a.currentRating;
  const monthlyValues = a.monthly.map((m) => m.avg).filter((v): v is number => v !== null);
  const monthsWithData = monthlyValues.length;
  const monthlyMean = monthsWithData
    ? Math.round(monthlyValues.reduce((s, v) => s + v, 0) / monthsWithData)
    : 0;
  const yMin = monthsWithData ? Math.min(...monthlyValues) - 20 : 800;
  const yMax = monthsWithData ? Math.max(...monthlyValues) + 20 : 1050;

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="font-graphic text-2xl">Rating & Round Analytics</CardTitle>
        <p className="text-xs text-muted-foreground">
          Based on every imported round. PDGA-rated rounds in the last 12 months are the source of
          truth when available.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Current Rating"
            value={a.currentRating || "—"}
            hint={
              a.ratingSource === "pdga_official"
                ? `Official PDGA rating${a.ratingSample ? ` • ${a.ratingSample} counted rounds` : ""}`
                : a.ratingSource === "pdga"
                  ? `PDGA algorithm • ${a.ratingSample} rounds`
                  : a.ratingSource === "blended"
                    ? `Blended • ${a.ratingSample} rounds`
                    : "Import rated rounds to compute"
            }
          />
          <Stat
            label="Projected (30 days)"
            value={a.projected30 || "—"}
            hint={
              a.trendPerRound
                ? `${projDelta >= 0 ? "▲" : "▼"} ${Math.abs(projDelta)} pts • trend ${a.trendPerRound.toFixed(1)}/round`
                : "Need more rated rounds"
            }
            tone={projDelta > 0 ? "up" : projDelta < 0 ? "down" : "flat"}
          />
          <Stat
            label="Total Rounds"
            value={a.total.toLocaleString()}
            hint={`${a.roundsLast90} in the last 90 days`}
          />
          <Stat
            label="Rated Rounds"
            value={a.ratedCount.toLocaleString()}
            hint={`${a.pdgaCount} PDGA • ${a.pdga12mo} in last 12 mo`}
          />
        </div>

        {(a.best || a.worst) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {a.best && (
              <div className="rounded-lg border bg-emerald-500/5 p-3">
                <div className="text-xs uppercase text-muted-foreground">Best Rated Round</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold text-emerald-600">
                    {a.best.round_rating}
                  </span>
                  <span className="text-sm text-muted-foreground">{a.best.played_on}</span>
                </div>
                <div className="text-sm">{a.best.course_name}</div>
              </div>
            )}
            {a.worst && (
              <div className="rounded-lg border bg-rose-500/5 p-3">
                <div className="text-xs uppercase text-muted-foreground">Lowest Rated Round</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold text-rose-600">
                    {a.worst.round_rating}
                  </span>
                  <span className="text-sm text-muted-foreground">{a.worst.played_on}</span>
                </div>
                <div className="text-sm">{a.worst.course_name}</div>
              </div>
            )}
          </div>
        )}

        {monthsWithData >= 1 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase text-muted-foreground">
                Monthly average rating (last 12 mo)
              </div>
              <div className="text-xs text-muted-foreground">
                12-mo avg <span className="font-mono text-foreground">{monthlyMean}</span> •{" "}
                {monthsWithData} of 12 months
              </div>
            </div>
            <div className="h-48 rounded-md border bg-muted/30 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={a.monthly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="monthlyRatingFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    domain={[yMin, yMax]}
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      fontSize: 12,
                    }}
                    formatter={(value, _n, ctx) => {
                      const count = (ctx?.payload as { count?: number } | undefined)?.count ?? 0;
                      return value == null || value === ""
                        ? ["No rated rounds", "Avg rating"]
                        : [`${value} (${count} rounds)`, "Avg rating"];
                    }}
                    labelFormatter={(_l, payload) =>
                      (payload?.[0]?.payload as { month?: string } | undefined)?.month ?? ""
                    }
                  />
                  <ReferenceLine
                    y={monthlyMean}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                  />
                  <Area
                    type="monotone"
                    dataKey="avg"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#monthlyRatingFill)"
                    connectNulls
                    dot={{ r: 3, fill: "hsl(var(--primary))" }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {a.topCourses.length > 0 && (
          <div>
            <div className="mb-2 text-xs uppercase text-muted-foreground">Most-played courses</div>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Course</th>
                    <th className="px-3 py-2 text-right">Rounds</th>
                    <th className="px-3 py-2 text-right">Avg +/-</th>
                    <th className="px-3 py-2 text-right">Avg Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {a.topCourses.map((c) => (
                    <tr key={c.name} className="border-t">
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2 text-right">{c.rounds}</td>
                      <td className="px-3 py-2 text-right">
                        {formatToPar(c.avgToPar as number | null)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{c.avgRating ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "up" | "down" | "flat";
}) {
  const toneClass =
    tone === "up" ? "text-emerald-600" : tone === "down" ? "text-rose-600" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-bold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
