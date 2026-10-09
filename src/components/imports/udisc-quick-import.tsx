import { useCallback, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, RefreshCw, ExternalLink, CheckCircle2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useMyProfile } from "@/lib/current-user";
import { importUDiscCsv } from "@/lib/import-rounds.functions";
import { makeAliasMatcher } from "@/lib/player-aliases";
import { readTextFile } from "@/lib/read-text-file";

import {
  PDGA_SERVER_FUNCTIONS,
  syncAllPdgaData,
  invalidatePlayerDataQueries,
} from "@/lib/pdga-sync";

/** Days after which we nudge the player for a fresh UDisc export. */
export const UDISC_STALE_DAYS = 14;

type ImportResult = {
  inserted: number;
  skipped: number;
  message?: string | null;
  playersFound?: { name: string; count: number }[];
};

/** Names in the CSV's player column, busiest first, with "Par" rows dropped. */
function playerNamesFromCsv(csvText: string): string[] {
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: true,
    preview: 400,
  });
  const key = (parsed.meta.fields ?? []).find((f) =>
    ["playername", "player", "name"].includes((f ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")),
  );
  if (!key) return [];
  const counts = new Map<string, number>();
  for (const row of parsed.data) {
    const value = (row[key] ?? "").trim();
    if (!value || value.toLowerCase() === "par") continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/** When did we last pull UDisc rounds in? */
export function useLastUdiscImport() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ["udisc-last-import", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("external_rounds")
        .select("created_at, played_on")
        .eq("user_id", userId!)
        .eq("source", "udisc")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data?.created_at) return { lastImportAt: null as string | null, daysAgo: null };
      const days = Math.floor(
        (Date.now() - new Date(data.created_at).getTime()) / (24 * 60 * 60 * 1000),
      );
      return { lastImportAt: data.created_at as string, daysAgo: days };
    },
  });
}

/**
 * One card that covers the whole UDisc path: drop the export file in, we work
 * out which rows are yours, and PDGA refreshes in the same tap.
 */
export function UdiscQuickImport() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { profile } = useMyProfile(user);
  const importFn = useServerFn(importUDiscCsv);
  const syncProfileFn = useServerFn(PDGA_SERVER_FUNCTIONS.syncMyPdgaFromProfile);
  const syncEventsFn = useServerFn(PDGA_SERVER_FUNCTIONS.syncMyPdgaEvents);
  const lastImportQ = useLastUdiscImport();

  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  const myNames = useMemo(
    () =>
      [profile?.display_name, profile?.username, profile?.pdga_number]
        .map((v) => (v == null ? "" : String(v).trim()))
        .filter((v) => v.length > 0),
    [profile?.display_name, profile?.username, profile?.pdga_number],
  );

  const runImport = useMutation({
    mutationFn: (vars: { csvText: string; playerName?: string; confirmedPlayerNames?: string[] }) =>
      importFn({ data: vars }),
    onSuccess: (res: ImportResult) => {
      setResult(res);
      if (res.inserted > 0) {
        toast.success(`Added ${res.inserted} round${res.inserted === 1 ? "" : "s"} from UDisc`, {
          description: "Your ratings and stats are updating now.",
        });
        setCsvText("");
        setNames([]);
      } else {
        toast.message("Nothing new to add", {
          description: res.message ?? "These rounds were already in your history.",
        });
      }
      invalidatePlayerDataQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["udisc-last-import"] });
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      void lastImportQ.refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleText = useCallback(
    (text: string, name: string) => {
      setResult(null);
      setCsvText(text);
      setFileName(name);
      const found = playerNamesFromCsv(text);
      setNames(found);
      // One player on the card, or a name that matches how you're known
      // ("Furst", "furst93", your PDGA number) — go straight in.
      const isMe = makeAliasMatcher(myNames);
      const auto = found.length === 1 ? found[0] : found.find((n) => isMe(n));
      if (auto) runImport.mutate({ csvText: text, playerName: auto, confirmedPlayerNames: [auto] });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myNames],
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    const read = await readTextFile(file);
    if (!read.ok) {
      toast.error(read.error, read.hint ? { description: read.hint } : undefined);
      return;
    }
    handleText(read.text, read.name);
  }

  async function syncPdgaNow() {
    setSyncing(true);
    try {
      const res = await syncAllPdgaData(
        { syncProfile: syncProfileFn, syncEvents: syncEventsFn },
        { force: true, queryClient },
      );
      if (res.ok) {
        toast.success("PDGA rounds and schedule are up to date");
      } else if (res.errors.length) {
        toast.error(res.errors[0]);
      }
    } finally {
      setSyncing(false);
    }
  }

  const daysAgo = lastImportQ.data?.daysAgo ?? null;
  const stale = daysAgo == null || daysAgo >= UDISC_STALE_DAYS;
  const pickNeeded = !!csvText && names.length > 1 && !runImport.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" /> Bring in your UDisc rounds
            </CardTitle>
            <CardDescription>
              Drop your UDisc export here once and we'll sort out which rounds are yours.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={syncing} onClick={() => void syncPdgaNow()}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync PDGA now"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose or drop your UDisc export file"
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void onFile(e.dataTransfer.files?.[0]);
          }}
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors " +
            (dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")
          }
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            {runImport.isPending
              ? "Reading your scorecards…"
              : fileName || "Drop your UDisc file here"}
          </p>
          <p className="text-xs text-muted-foreground">
            or tap to pick it from your phone or computer
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,text/csv,text/plain,text/comma-separated-values,application/csv,*/*"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? undefined)}
          />
        </div>

        {pickNeeded ? (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" /> Which name is you?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This card was played with other people, so pick your name and we'll only count your
              scores.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {names.slice(0, 12).map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    runImport.mutate({ csvText, playerName: n, confirmedPlayerNames: [n] })
                  }
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {result && result.inserted > 0 ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Added {result.inserted} round
            {result.inserted === 1 ? "" : "s"}
            {result.skipped ? ` · skipped ${result.skipped} already on file` : ""}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>
            {daysAgo == null
              ? "No UDisc rounds brought in yet."
              : daysAgo === 0
                ? "Last UDisc import: today."
                : `Last UDisc import: ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago.`}
            {stale ? " A fresh export keeps your stats honest." : ""}
          </span>
          <a
            className="inline-flex items-center gap-1 text-primary hover:underline"
            href="https://udisc.com/blog/post/how-to-export-your-udisc-scorecards"
            target="_blank"
            rel="noopener noreferrer"
          >
            How to export from UDisc <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <p className="text-xs text-muted-foreground">
          UDisc has no public sign-in for other apps, so their export file is the only way to move
          those scorecards over.{" "}
          <Badge variant="outline" className="ml-1 align-middle">
            UDisc app → Profile → Scorecards → ⋯ → Export
          </Badge>
        </p>
      </CardContent>
    </Card>
  );
}
