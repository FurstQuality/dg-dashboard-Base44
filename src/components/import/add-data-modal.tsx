// Universal Add Data modal.
// Single input auto-detects PDGA #, PDGA URL, UDisc/DGS/Facebook/generic URL,
// or a UDisc CSV file, then routes to the correct server fn with a preview step.

import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Sparkles, Upload, Link2, IdCard, FileText, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import { detectInput, detectFile, type DetectResult } from "@/lib/import-detect";
import { PDGA_SERVER_FUNCTIONS, syncAllPdgaData } from "@/lib/pdga-sync";
import { addPdgaFriend } from "@/lib/pdga-friends.functions";
import { scrapeClubUrl } from "@/lib/data-connectors.functions";

type Ctx = "generic" | "friends" | "schedule" | "clubs" | "rounds";

export function AddDataDialog({
  trigger,
  context = "generic",
  onDone,
}: {
  trigger?: React.ReactNode;
  context?: Ctx;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const syncProfileFn = useServerFn(PDGA_SERVER_FUNCTIONS.syncMyPdgaFromProfile);
  const syncEventsFn = useServerFn(PDGA_SERVER_FUNCTIONS.syncMyPdgaEvents);
  const addFriend = useServerFn(addPdgaFriend);
  const scrape = useServerFn(scrapeClubUrl);

  async function runFullPdgaSync() {
    return syncAllPdgaData(
      { syncProfile: syncProfileFn, syncEvents: syncEventsFn },
      { force: true, silent: true, queryClient },
    );
  }

  const detected: DetectResult = useMemo(
    () => (file ? detectFile(file) : detectInput(raw)),
    [raw, file],
  );

  const canSubmit = !busy && detected.route.type !== "none";

  function reset() {
    setRaw("");
    setFile(null);
    setResult(null);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const r = detected.route;
      if (r.type === "pdga-friend") {
        // In friends/tracker context: add them as a friend. Elsewhere,
        // if the number equals the signed-in user's PDGA #, they can hit
        // "Sync my profile" instead — still routed through the same input.
        if (context === "friends") {
          await addFriend({ data: { pdgaNumber: r.number } });
          toast.success(`Invited PDGA #${r.number}`);
        } else {
          // Ambiguous: show both actions in preview
          setResult({ kind: "pdga-ambiguous", number: r.number });
          setBusy(false);
          return;
        }
      } else if (r.type === "pdga-sync") {
        const res = await runFullPdgaSync();
        toast.success("PDGA data synced", {
          description: res.cached
            ? "Already up to date."
            : `${res.roundsSynced} rounds · ${res.eventsAdded} events added.`,
        });
      } else if (r.type === "drop-link") {
        const scraped = await scrape({ data: { url: r.url } });
        setResult({ kind: "scraped", data: scraped });
        setBusy(false);
        return;
      } else if (r.type === "udisc-csv") {
        // Hand off to the dedicated importer — file uploads are best handled there.
        setOpen(false);
        navigate({ to: "/settings/imports", search: { tab: "rounds" } });
        toast.info("Drop your UDisc CSV in the Import Rounds tab.");
      }
      onDone?.();
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitPdgaSync() {
    setBusy(true);
    try {
      const res = await runFullPdgaSync();
      toast.success("PDGA data synced", {
        description: res.cached
          ? "Already up to date."
          : `${res.roundsSynced} rounds · ${res.eventsAdded} events added.`,
      });
      onDone?.();
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitPdgaFriend(number: string) {
    setBusy(true);
    try {
      await addFriend({ data: { pdgaNumber: number } });
      toast.success(`Invited PDGA #${number}`);
      onDone?.();
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Sparkles className="mr-1.5 h-4 w-4" /> Add Data
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add data to DG Dashboard</DialogTitle>
          <DialogDescription>
            Paste a PDGA number, drop a link from any disc golf site, or upload a UDisc scorecard.
            We'll figure out what to do with it.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="e.g. 236190, pdga.com/player/236190, or a UDisc / DGS / Facebook link"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setFile(null);
              }}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>or</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f) setRaw("");
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                type="button"
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Choose UDisc CSV
              </Button>
              {file && <span className="truncate">{file.name}</span>}
            </div>

            <DetectPreview detected={detected} context={context} />
          </div>
        )}

        {typeof result === "object" &&
          result &&
          (result as { kind: string }).kind === "pdga-ambiguous" && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm">
                PDGA #{(result as { number: string }).number} — what should we do?
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => submitPdgaSync()} disabled={busy}>
                  <IdCard className="mr-1.5 h-4 w-4" /> That's me — sync my profile
                </Button>
                <Button
                  onClick={() => submitPdgaFriend((result as { number: string }).number)}
                  disabled={busy}
                >
                  Add as friend <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

        {typeof result === "object" &&
          result &&
          (result as { kind: string }).kind === "scraped" && (
            <ScrapedPreview
              data={(result as { data: Record<string, unknown> }).data}
              onDone={() => {
                onDone?.();
                setOpen(false);
                reset();
              }}
            />
          )}

        {!result && (
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              Continue
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetectPreview({ detected, context }: { detected: DetectResult; context: Ctx }) {
  if (!detected.normalized && !detected.label) return null;
  const Icon =
    detected.kind === "pdga_number" || detected.kind === "pdga_player_url"
      ? IdCard
      : detected.kind === "pdga_event_url" || detected.kind === "dgscene_url"
        ? Link2
        : detected.kind === "udisc_url"
          ? Upload
          : detected.kind === "unknown" && detected.route.type === "udisc-csv"
            ? FileText
            : Link2;

  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="font-medium">{detected.label || "Ready"}</span>
        <Badge variant="outline" className="text-[10px] uppercase">
          {detected.kind.replace(/_/g, " ")}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{detected.summary}</p>
      {context !== "generic" && detected.route.type === "none" && (
        <p className="mt-1 text-xs text-amber-600">
          This doesn't match anything DG Dashboard knows how to import yet.
        </p>
      )}
    </div>
  );
}

function ScrapedPreview({ data, onDone }: { data: Record<string, unknown>; onDone: () => void }) {
  const name = String(data?.name ?? "");
  const desc = String(data?.description ?? "");
  const img = typeof data?.cover_image_url === "string" ? (data.cover_image_url as string) : null;
  const src = String(data?.source ?? "web");
  return (
    <div className="space-y-3">
      <div className="rounded-md border p-3">
        <div className="flex items-start gap-3">
          {img ? <img src={img} alt="" className="h-16 w-16 rounded object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] uppercase">
                {src}
              </Badge>
              <span className="truncate font-medium">{name || "Untitled"}</span>
            </div>
            {desc ? (
              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{desc}</p>
            ) : null}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        The page was read successfully. Finalize the import in Drop-a-Link where you can pick a
        category and add missing details.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}
