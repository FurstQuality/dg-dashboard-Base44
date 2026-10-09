import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DIRECTOR_POLL, directorKeys } from "@/lib/director-queries";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  DollarSign,
  MonitorSmartphone,
  QrCode,
  Search,
  Undo2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingSkeleton, MascotEmptyState } from "@/components/shell";
import { DirectorErrorState } from "@/components/director/director-error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  checkInPlayer,
  getCheckInBoard,
  getCheckInStations,
  markCheckInPaid,
  scanCheckIn,
  undoCheckIn,
  type CheckInBoard,
  type CheckInStation,
  type ScanResult,
} from "@/lib/checkin.functions";
import { getKioskGuests, type KioskGuestRow } from "@/lib/kiosk.functions";
import { useQrScanner } from "@/hooks/use-qr-scanner";
import { RapidScan } from "@/components/director/rapid-scan";


type Search = { kind?: "tournament" | "league_event"; id?: string; scan?: boolean };

export const Route = createFileRoute("/_authenticated/director/check-in")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    kind: s.kind === "league_event" ? "league_event" : s.kind === "tournament" ? "tournament" : undefined,
    id: typeof s.id === "string" ? s.id : undefined,
    scan: s.scan === true || s.scan === "1" || s.scan === 1 ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Event check-in — DG Dashboard" },
      {
        name: "description",
        content:
          "Scan player passes or search the roster to check players into your tournament or league night.",
      },
      { property: "og:title", content: "Event check-in — DG Dashboard" },
      {
        property: "og:description",
        content: "Run the check-in table with QR scanning, payment tracking, and instant undo.",
      },
    ],
  }),
  component: CheckInDesk,
});

function stationKey(station: { kind: string; id: string }) {
  return `${station.kind}:${station.id}`;
}

/** Camera scanner using the platform barcode detector, with graceful fallback. */


function CheckInDesk() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchStations = useServerFn(getCheckInStations);
  const fetchBoard = useServerFn(getCheckInBoard);
  const scan = useServerFn(scanCheckIn);
  const check = useServerFn(checkInPlayer);
  const undo = useServerFn(undoCheckIn);
  const setPaid = useServerFn(markCheckInPaid);
  const fetchGuests = useServerFn(getKioskGuests);

  const [code, setCode] = useState("");
  const [filter, setFilter] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [override, setOverride] = useState(false);
  const [rapid, setRapid] = useState(!!search.scan);

  const stationsQuery = useQuery<CheckInStation[]>({
    queryKey: directorKeys.checkinStations(),
    queryFn: () => fetchStations(),
    staleTime: DIRECTOR_POLL.stations,
  });

  const stations = stationsQuery.data ?? [];
  const selected = useMemo(() => {
    if (search.kind && search.id) {
      return stations.find((s) => s.kind === search.kind && s.id === search.id) ?? null;
    }
    return stations[0] ?? null;
  }, [search.kind, search.id, stations]);

  const target = selected ? { kind: selected.kind, id: selected.id } : null;

  const boardQuery = useQuery<CheckInBoard>({
    queryKey: directorKeys.checkinBoard(target?.kind, target?.id),
    queryFn: () => fetchBoard({ data: target! }),
    enabled: !!target,
    staleTime: DIRECTOR_POLL.live,
    refetchInterval: DIRECTOR_POLL.live,
    // A hidden tab stops asking; returning to it refetches immediately.
    refetchIntervalInBackground: false,
  });

  function refreshBoard() {
    queryClient.invalidateQueries({ queryKey: ["checkin", "board"] });
    queryClient.invalidateQueries({ queryKey: ["kiosk", "guests"] });
  }

  function report(result: ScanResult) {
    setLastResult(result);
    const name = result.player?.displayName ?? "That code";
    if (result.outcome === "checked_in") toast.success(`${name} is checked in.`);
    else if (result.outcome === "already") toast.info(`${name}: ${result.message}`);
    else toast.error(`${name}: ${result.message}`);
    refreshBoard();
  }

  const scanMutation = useMutation({
    mutationFn: (payload: { identifier: string; method: "scan" | "manual" }) =>
      scan({
        data: {
          target: target!,
          identifier: payload.identifier,
          method: payload.method,
          override,
        },
      }),
    onSuccess: report,
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "That check-in didn't go through."),
  });

  const scanner = useQrScanner((value) => {
    if (!target || scanMutation.isPending) return;
    scanMutation.mutate({ identifier: value, method: "scan" });
  });

  const checkMutation = useMutation({
    mutationFn: (playerId: string) => check({ data: { target: target!, playerId, override } }),
    onSuccess: report,
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "That check-in didn't go through."),
  });

  const undoMutation = useMutation({
    mutationFn: (playerId: string) => undo({ data: { target: target!, playerId } }),
    onSuccess: () => {
      toast.success("Check-in reversed.");
      refreshBoard();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't undo that check-in."),
  });

  const paidMutation = useMutation({
    mutationFn: (v: { playerId: string; paid: boolean }) =>
      setPaid({ data: { target: target!, playerId: v.playerId, paid: v.paid } }),
    onSuccess: () => {
      toast.success("Payment updated.");
      refreshBoard();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't update that payment."),
  });

  const rows = useMemo(() => {
    const all = boardQuery.data?.rows ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        (r.pdgaNumber ?? "").includes(q),
    );
  }, [boardQuery.data, filter]);

  const totals = boardQuery.data?.totals;

  const guestsQuery = useQuery<KioskGuestRow[]>({
    queryKey: directorKeys.kioskGuests(target?.kind, target?.id),
    queryFn: () => fetchGuests({ data: target! }),
    enabled: !!target,
    staleTime: DIRECTOR_POLL.live,
    refetchInterval: DIRECTOR_POLL.live,
    refetchIntervalInBackground: false,
  });
  const guests = guestsQuery.data ?? [];

  return (
    <div className="space-y-5">
      {rapid && target && selected ? (
        <RapidScan
          target={target}
          eventName={selected.name}
          override={override}
          onClose={() => setRapid(false)}
          onChange={refreshBoard}
        />
      ) : null}
      <PageHeader
        title="Check-in desk"
        description="Scan a player pass or search your roster — every check-in is logged and reversible."
        primaryAction={
          <Button onClick={() => setRapid(true)} disabled={!target}>
            <QrCode className="mr-1.5 h-4 w-4" /> Scan players
          </Button>
        }
        secondaryAction={
          <Button asChild variant="outline">
            <Link to="/director/kiosk">
              <MonitorSmartphone className="mr-1.5 h-4 w-4" /> Launch kiosk mode
            </Link>
          </Button>
        }
      />


      {stationsQuery.isLoading ? (
        <LoadingSkeleton variant="card" count={1} />
      ) : stationsQuery.isError ? (
        <DirectorErrorState
          title="Your check-in desks didn't load"
          onRetry={() => void stationsQuery.refetch()}
        />
      ) : stations.length === 0 ? (
        <MascotEmptyState
          intent="official"
          title="No check-in desk open yet"
          description="Once a tournament or league night is on the calendar, its check-in desk shows up here."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-[260px]">
              <label className="mb-1 block text-sm font-medium">Event</label>
              <Select
                value={selected ? stationKey(selected) : undefined}
                onValueChange={(value) => {
                  const [kind, id] = value.split(":");
                  navigate({
                    to: "/director/check-in",
                    search: { kind: kind as Search["kind"], id },
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick an event" />
                </SelectTrigger>
                <SelectContent>
                  {stations.map((s) => (
                    <SelectItem key={stationKey(s)} value={stationKey(s)}>
                      {s.name} · {new Date(s.date).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selected ? (
              <div className="text-sm text-muted-foreground">
                <div>{selected.subtitle}</div>
                <div>
                  {selected.checkInOpen ? (
                    <span className="text-primary">Check-in is open</span>
                  ) : (
                    (selected.checkInNote ?? "Check-in is closed")
                  )}
                </div>
              </div>
            ) : null}
            {totals ? (
              <div className="ml-auto flex flex-wrap gap-4 text-sm">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Checked in</div>
                  <div className="text-xl font-semibold">
                    {totals.checkedIn}/{totals.expected}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Remaining</div>
                  <div className="text-xl font-semibold">{totals.remaining}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Unpaid</div>
                  <div className="text-xl font-semibold">{totals.unpaid}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <QrCode className="h-5 w-5 text-primary" /> Scan a pass
              </h2>
              {scanner.supported ? (
                <>
                  <div className="overflow-hidden rounded-lg bg-black/80">
                    <video
                      ref={scanner.videoRef}
                      className={scanner.active ? "h-48 w-full object-cover" : "hidden"}
                      muted
                      playsInline
                    />
                    {!scanner.active ? (
                      <div className="grid h-48 place-items-center text-xs text-white/70">
                        Camera is off
                      </div>
                    ) : null}
                  </div>
                  <Button
                    variant={scanner.active ? "outline" : "default"}
                    className="w-full"
                    onClick={() => scanner.setActive(!scanner.active)}
                  >
                    {scanner.active ? (
                      <>
                        <CameraOff className="mr-1.5 h-4 w-4" /> Stop camera
                      </>
                    ) : (
                      <>
                        <Camera className="mr-1.5 h-4 w-4" /> Start camera
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This browser can't scan QR codes. Type the player code below — it works just as
                  fast.
                </p>
              )}

              {selected && !selected.checkInOpen ? (
                <label className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    Check-in isn&apos;t open for this event yet. Tick this to check players in anyway
                    as the director — it&apos;s recorded in the event log.
                  </span>
                </label>
              ) : null}

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!code.trim() || !target) return;
                  scanMutation.mutate({ identifier: code.trim(), method: "manual" });
                  setCode("");
                }}
              >
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Player code"
                  aria-label="Player code"
                  className="font-mono uppercase"
                />
                <Button type="submit" disabled={!code.trim() || scanMutation.isPending}>
                  Check in
                </Button>
              </form>

              {lastResult ? (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    lastResult.outcome === "checked_in"
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-background/60"
                  }`}
                >
                  <div className="font-medium">{lastResult.player?.displayName ?? "Unknown code"}</div>
                  <div className="text-muted-foreground">{lastResult.message}</div>
                  {lastResult.outcome === "checked_in" && lastResult.player ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 px-0"
                      onClick={() => undoMutation.mutate(lastResult.player!.userId)}
                    >
                      <Undo2 className="mr-1.5 h-4 w-4" /> Undo
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                  <UserCheck className="h-5 w-5 text-primary" /> Roster
                </h2>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search players"
                    aria-label="Search players"
                    className="w-56 pl-8"
                  />
                </div>
              </div>

              {boardQuery.isLoading ? (
                <LoadingSkeleton variant="table" count={8} className="mt-3" />
              ) : boardQuery.isError ? (
                <DirectorErrorState
                  title="This roster didn't load"
                  onRetry={() => void boardQuery.refetch()}
                  className="mt-3"
                />
              ) : rows.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nobody on this roster yet. As players register, they'll appear here ready to check
                  in.
                </p>
              ) : (
                <div className="mt-3 max-h-[28rem] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead>Division</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.userId}>
                          <TableCell>
                            <div className="font-medium">{r.displayName}</div>
                            <div className="text-xs text-muted-foreground">
                              @{r.username}
                              {r.pdgaNumber ? ` · #${r.pdgaNumber}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{r.divisionName ?? "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                r.status === "checked_in"
                                  ? "default"
                                  : r.status === "withdrawn"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {r.status.replace(/_/g, " ")}
                            </Badge>
                            {r.checkedInAt ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {new Date(r.checkedInAt).toLocaleTimeString()}
                                {r.checkInMethod ? ` · ${r.checkInMethod}` : ""}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.paymentStatus ? r.paymentStatus : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {r.paymentStatus === "unpaid" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    paidMutation.mutate({ playerId: r.userId, paid: true })
                                  }
                                >
                                  <DollarSign className="h-4 w-4" />
                                  <span className="sr-only">Mark paid</span>
                                </Button>
                              ) : null}
                              {r.checkedInAt ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => undoMutation.mutate(r.userId)}
                                >
                                  <Undo2 className="mr-1 h-4 w-4" /> Undo
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  disabled={r.status === "withdrawn" || checkMutation.isPending}
                                  onClick={() => checkMutation.mutate(r.userId)}
                                >
                                  <CheckCircle2 className="mr-1 h-4 w-4" /> Check in
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </div>

          {guests.length > 0 ? (
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div>
                <h2 className="font-display text-lg font-semibold">Kiosk walk-ups without accounts</h2>
                <p className="text-sm text-muted-foreground">
                  Players who checked in at the kiosk form. Add them to the roster or collect payment
                  as needed.
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Division</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Checked in</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guests.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">
                          {g.fullName}
                          {g.pdgaNumber ? (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              #{g.pdgaNumber}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>{g.divisionName ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {g.email ?? g.phone ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={g.paymentStatus === "paid" ? "default" : "outline"}>
                            {g.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(g.createdAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
