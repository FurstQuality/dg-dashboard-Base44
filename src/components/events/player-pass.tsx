import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { playerPassPayload } from "@/lib/checkin-rules";
import { getMyPlayerPass, rotateMyQrToken, type PlayerPass } from "@/lib/checkin.functions";

export const playerPassKey = ["player-pass"] as const;

function PassQr({ token, size = 208 }: { token: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    // Loaded on demand: the pass QR is rarely the first thing on screen.
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toCanvas(canvas, playerPassPayload(token), {
          width: size,
          margin: 1,
          color: { dark: "#0b1220", light: "#ffffff" },
        }),
      )
      .catch(() => undefined);
  }, [token, size]);

  return (
    <div className="rounded-xl bg-white p-3">
      <canvas ref={canvasRef} aria-label="Your player pass QR code" />
    </div>
  );
}

function statusTone(status: string) {
  if (status === "checked_in") return "default" as const;
  if (status === "withdrawn") return "destructive" as const;
  return "secondary" as const;
}

/** Compact card players can pull up at the check-in table. */
export function PlayerPassCard({ compact = false }: { compact?: boolean }) {
  const fetchPass = useServerFn(getMyPlayerPass);
  const rotate = useServerFn(rotateMyQrToken);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<PlayerPass>({
    queryKey: playerPassKey,
    queryFn: () => fetchPass(),
    staleTime: 60_000,
  });

  const rotateMutation = useMutation({
    mutationFn: () => rotate(),
    onSuccess: () => {
      toast.success("New code ready — your old QR no longer works.");
      queryClient.invalidateQueries({ queryKey: playerPassKey });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't refresh your code."),
  });

  if (isLoading) return <Skeleton className="h-56 w-full rounded-xl" />;
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Your player pass didn't load. Refresh the page to try again.
      </div>
    );
  }

  const upcoming = data.events.slice(0, compact ? 2 : 5);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <QrCode className="h-5 w-5 text-primary" /> Your player pass
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Show this at the check-in table and you're on the roster in seconds.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => rotateMutation.mutate()}
          disabled={rotateMutation.isPending}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" /> New code
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <PassQr token={data.qrToken} size={compact ? 160 : 208} />
        <div className="min-w-[180px] space-y-1">
          <div className="text-base font-semibold">{data.displayName}</div>
          <div className="text-sm text-muted-foreground">@{data.username}</div>
          {data.pdgaNumber ? (
            <div className="text-sm text-muted-foreground">PDGA #{data.pdgaNumber}</div>
          ) : null}
          <div className="pt-2 text-xs uppercase tracking-wide text-muted-foreground">
            Player code
          </div>
          <div className="font-mono text-xl font-semibold tracking-widest">{data.playerCode}</div>
          <p className="text-xs text-muted-foreground">
            No scanner? Read this code to the director instead.
          </p>
        </div>
      </div>

      {upcoming.length ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarCheck className="h-4 w-4 text-primary" /> Your next events
          </div>
          {upcoming.map((e) => (
            <div
              key={`${e.kind}-${e.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{e.name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(e.date).toLocaleDateString()}
                  {e.divisionName ? ` · ${e.divisionName}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {e.paymentStatus === "unpaid" ? <Badge variant="outline">Unpaid</Badge> : null}
                <Badge variant={statusTone(e.status)}>{e.status.replace(/_/g, " ")}</Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Once you register for a tournament or league, it shows up right here.
        </p>
      )}
    </section>
  );
}

/** Button + dialog wrapper for event pages. */
export function PlayerPassButton({ label = "My player pass" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <QrCode className="mr-1.5 h-4 w-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Your player pass</DialogTitle>
          </DialogHeader>
          <PlayerPassCard compact />
        </DialogContent>
      </Dialog>
    </>
  );
}
