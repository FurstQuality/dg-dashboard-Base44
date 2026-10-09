import { Suspense, lazy, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandHeart, MapPin, PackageSearch, PartyPopper } from "lucide-react";
import { ContentCard, ErrorState, LoadingSkeleton, MascotEmptyState } from "@/components/shell";
const MarketplaceMap = lazy(() =>
  import("@/components/marketplace/marketplace-map").then((m) => ({ default: m.MarketplaceMap })),
);
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/current-user";
import { milesBetween } from "@/lib/marketplace";
import { UseCurrentLocationButton, type LatLng } from "@/components/use-current-location-button";
import { openDirectConversation } from "@/lib/messaging";
import {
  claimReport,
  claimsQueryOptions,
  confirmClaim,
  createReport,
  myReportsQueryOptions,
  rejectClaim,
  reportHeadline,
  reportPlace,
  reportsQueryOptions,
  setReportStatus,
  type LostFoundKind,
  type LostFoundReport,
} from "@/lib/lostfound";

export function LostFoundPanel() {
  const { user } = useSession();
  const userId = user?.id ?? null;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="nearby">
        <TabsList className="flex-wrap">
          <TabsTrigger value="nearby">Open reports</TabsTrigger>
          <TabsTrigger value="report">Post a report</TabsTrigger>
          <TabsTrigger value="mine">My reports</TabsTrigger>
        </TabsList>

        <TabsContent value="nearby" className="mt-4">
          <NearbyReports userId={userId} />
        </TabsContent>
        <TabsContent value="report" className="mt-4">
          <ReportForm userId={userId} />
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          <MyReports userId={userId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────────── Open reports ───────────────────────────── */

function NearbyReports({ userId }: { userId: string | null }) {
  const [kind, setKind] = useState<LostFoundKind | "all">("all");
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");
  const [sinceDays, setSinceDays] = useState("60");
  const [origin, setOrigin] = useState<LatLng | null>(null);

  const filters = useMemo(
    () => ({
      kind,
      state: state.trim() || null,
      search: search.trim() || undefined,
      sinceDays: sinceDays === "any" ? null : Number(sinceDays),
      pageSize: 30,
    }),
    [kind, state, search, sinceDays],
  );
  const reports = useQuery(reportsQueryOptions(filters));
  const allRows = reports.data?.rows ?? [];
  // With a location shared, reports with a pinned spot come first, closest one
  // at the top; reports without a spot keep their original order below.
  const rows = useMemo(() => {
    if (!origin) return allRows;
    const withDistance = allRows.map((row, index) => ({
      row,
      index,
      miles:
        row.latitude != null && row.longitude != null
          ? milesBetween(origin, { lat: row.latitude, lng: row.longitude })
          : null,
    }));
    withDistance.sort((a, b) => {
      if (a.miles == null && b.miles == null) return a.index - b.index;
      if (a.miles == null) return 1;
      if (b.miles == null) return -1;
      return a.miles - b.miles;
    });
    return withDistance.map((entry) => entry.row);
  }, [allRows, origin]);
  const [showMap, setShowMap] = useState(false);
  const mapPins = rows
    .filter((row) => row.latitude != null && row.longitude != null)
    .map((row) => ({
      id: row.id,
      lat: row.latitude as number,
      lng: row.longitude as number,
      title: reportHeadline(row),
      detail: reportPlace(row),
      tone: row.kind === "found" ? ("found" as const) : ("lost" as const),
    }));

  return (
    <div className="space-y-4">
      <ContentCard title="Filter reports" subtitle="Narrow by type, area, and how recent.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as LostFoundKind | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Lost and found</SelectItem>
                <SelectItem value="lost">Lost discs</SelectItem>
                <SelectItem value="found">Found discs</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-state">State</Label>
            <Input
              id="lf-state"
              value={state}
              placeholder="IN or Indiana"
              onChange={(e) => setState(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-search">Search</Label>
            <Input
              id="lf-search"
              value={search}
              placeholder="Mold, brand, or ink name"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reported within</Label>
            <Select value={sinceDays} onValueChange={setSinceDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last week</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
                <SelectItem value="any">Any time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </ContentCard>

      {reports.isLoading ? (
        <LoadingSkeleton />
      ) : reports.error ? (
        <ErrorState
          title="Couldn't load reports"
          description="The lost and found board didn't load. Try again in a moment."
        />
      ) : rows.length === 0 ? (
        <MascotEmptyState
          intent="scout"
          title="No open reports in that filter"
          description="Nothing missing nearby right now. Post a report if you lost or found a disc."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {rows.length} report{rows.length === 1 ? "" : "s"} on the board
              {origin ? " · closest to you first" : ""}
            </p>
            <UseCurrentLocationButton onLocated={setOrigin} className="ml-auto" />
            <Button variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}>
              <MapPin className="mr-1.5 h-4 w-4" />
              {showMap ? "Hide map" : "Show map"}
            </Button>
          </div>
          {showMap ? (
            mapPins.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                None of these reports have a pinned spot yet — reports with a course or map point
                appear here.
              </p>
            ) : (
              <Suspense fallback={<div className="h-[380px] rounded-2xl border bg-muted/30" />}>
                <MarketplaceMap pins={mapPins} />
              </Suspense>
            )
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((report) => (
              <ReportCard key={report.id} report={report} userId={userId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportCard({ report, userId }: { report: LostFoundReport; userId: string | null }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [claiming, setClaiming] = useState(false);
  const isMine = userId === report.user_id;

  async function submitClaim() {
    if (!userId) return;
    setClaiming(true);
    try {
      const conversationId = await openDirectConversation(userId, report.user_id);
      await claimReport(report.id, userId, message.trim() || null, conversationId);
      await queryClient.invalidateQueries({ queryKey: ["lost-found-claims", report.id] });
      setMessage("");
      toast.success("Claim sent. We messaged the reporter with your details.");
    } catch {
      toast.error("Couldn't send that claim. Try again in a moment.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <ContentCard
      plain
      title={reportHeadline(report) || "A disc"}
      subtitle={reportPlace(report) ?? "Location not shared"}
      action={
        <Badge variant={report.kind === "lost" ? "outline" : "secondary"}>
          {report.kind === "lost" ? "Lost" : "Found"}
        </Badge>
      }
    >
      {report.photo_url ? (
        <img
          src={report.photo_url}
          alt={`${reportHeadline(report)} photo`}
          className="aspect-[4/3] w-full rounded-lg object-cover"
        />
      ) : null}
      <ul className="space-y-1 text-sm text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> {new Date(report.occurred_on).toLocaleDateString()}
        </li>
        {report.ink_name ? <li>Ink name: {report.ink_name}</li> : null}
        {report.ink_pdga_number ? <li>Ink PDGA #{report.ink_pdga_number}</li> : null}
        {report.weight_grams ? <li>{report.weight_grams}g</li> : null}
        {report.reward ? <li>Reward: {report.reward}</li> : null}
        {report.handoff_notes ? <li>Hand-off: {report.handoff_notes}</li> : null}
        {report.status === "reunited" ? (
          <li className="flex items-center gap-1.5 text-emerald-500">
            <PartyPopper className="h-3.5 w-3.5" /> Reunited with its owner
          </li>
        ) : null}
      </ul>

      {!isMine && userId && report.status !== "reunited" ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={message}
            placeholder={
              report.kind === "found"
                ? "That's mine — here's what's written on it…"
                : "I think I have your disc — where can we meet?"
            }
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button size="sm" disabled={claiming} onClick={() => void submitClaim()}>
            <HandHeart className="mr-1.5 h-4 w-4" />
            {report.kind === "found" ? "This is my disc" : "I found this disc"}
          </Button>
        </div>
      ) : null}
    </ContentCard>
  );
}

/* ───────────────────────────── Report form ───────────────────────────── */

function ReportForm({ userId }: { userId: string | null }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<LostFoundKind>("lost");
  const [moldName, setMoldName] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");
  const [weight, setWeight] = useState("");
  const [inkName, setInkName] = useState("");
  const [inkPhone, setInkPhone] = useState("");
  const [inkPdga, setInkPdga] = useState("");
  const [hole, setHole] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reward, setReward] = useState("");
  const [handoff, setHandoff] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!userId || !moldName.trim()) return;
    setSaving(true);
    try {
      await createReport(userId, {
        kind,
        moldName: moldName.trim(),
        brand: brand.trim() || null,
        color: color.trim() || null,
        weightGrams: weight ? Number(weight) : null,
        inkName: inkName.trim() || null,
        inkPhone: inkPhone.trim() || null,
        inkPdgaNumber: inkPdga ? Number(inkPdga) : null,
        holeNumber: hole ? Number(hole) : null,
        city: city.trim() || null,
        state: state.trim() || null,
        occurredOn,
        reward: reward.trim() || null,
        handoffNotes: handoff.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["lost-found-reports"] });
      await queryClient.invalidateQueries({ queryKey: ["lost-found-my-reports", userId] });
      setMoldName("");
      setInkName("");
      toast.success(
        kind === "lost"
          ? "Report posted. We'll watch new listings and found discs for a match."
          : "Thanks for logging it. We'll check it against open lost reports.",
      );
    } catch {
      toast.error("Couldn't post that report. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContentCard
      title={kind === "lost" ? "Report a lost disc" : "Log a disc you found"}
      subtitle="The more identifying detail you add, the better our matching works."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={kind === "lost" ? "default" : "outline"}
          onClick={() => setKind("lost")}
        >
          I lost a disc
        </Button>
        <Button
          size="sm"
          variant={kind === "found" ? "default" : "outline"}
          onClick={() => setKind("found")}
        >
          I found a disc
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="lf-mold">Mold</Label>
          <Input id="lf-mold" value={moldName} onChange={(e) => setMoldName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-brand">Brand</Label>
          <Input id="lf-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-color">Color</Label>
          <Input id="lf-color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-weight">Weight (g)</Label>
          <Input
            id="lf-weight"
            inputMode="numeric"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-ink">Ink name</Label>
          <Input id="lf-ink" value={inkName} onChange={(e) => setInkName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-pdga">Ink PDGA number</Label>
          <Input
            id="lf-pdga"
            inputMode="numeric"
            value={inkPdga}
            onChange={(e) => setInkPdga(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-phone">Phone written on the disc</Label>
          <Input id="lf-phone" value={inkPhone} onChange={(e) => setInkPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-hole">Hole number</Label>
          <Input
            id="lf-hole"
            inputMode="numeric"
            value={hole}
            onChange={(e) => setHole(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-date">Date</Label>
          <Input
            id="lf-date"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-city">City</Label>
          <Input id="lf-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-state-in">State</Label>
          <Input
            id="lf-state-in"
            value={state}
            placeholder="IN or Indiana"
            onChange={(e) => setState(e.target.value)}
          />
        </div>
        {kind === "lost" ? (
          <div className="space-y-1.5">
            <Label htmlFor="lf-reward">Reward</Label>
            <Input
              id="lf-reward"
              value={reward}
              placeholder="A new putter, cash, gas money"
              onChange={(e) => setReward(e.target.value)}
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lf-handoff">Hand-off notes</Label>
        <Textarea
          id="lf-handoff"
          rows={3}
          value={handoff}
          placeholder="Where and when you can meet, or which pro shop is holding it."
          onChange={(e) => setHandoff(e.target.value)}
        />
      </div>

      <Button disabled={!userId || !moldName.trim() || saving} onClick={() => void submit()}>
        {saving ? "Posting…" : "Post report"}
      </Button>
    </ContentCard>
  );
}

/* ───────────────────────────── My reports ───────────────────────────── */

function MyReports({ userId }: { userId: string | null }) {
  const reports = useQuery(myReportsQueryOptions(userId));
  const rows = reports.data ?? [];

  if (reports.isLoading) return <LoadingSkeleton />;
  if (reports.error) {
    return (
      <ErrorState
        title="Couldn't load your reports"
        description="They're still saved — the list just didn't load. Try again in a moment."
      />
    );
  }
  if (!rows.length) {
    return (
      <MascotEmptyState
        intent="coach"
        title="No reports from you yet"
        description="Lost a disc or picked one up? Post it and we'll watch for a match."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((report) => (
        <MyReportRow key={report.id} report={report} />
      ))}
    </div>
  );
}

function MyReportRow({ report }: { report: LostFoundReport }) {
  const queryClient = useQueryClient();
  const claims = useQuery(claimsQueryOptions(report.id));

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["lost-found-claims", report.id] });
    await queryClient.invalidateQueries({ queryKey: ["lost-found-my-reports"] });
  }

  return (
    <ContentCard
      plain
      title={reportHeadline(report) || "A disc"}
      subtitle={`${report.kind === "lost" ? "Lost" : "Found"} · ${reportPlace(report) ?? "Location not shared"}`}
      action={<Badge variant="outline">{report.status}</Badge>}
    >
      <div className="space-y-2">
        {(claims.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No claims yet. We'll notify you the moment something matches.
          </p>
        ) : (
          (claims.data ?? []).map((claim) => (
            <div
              key={claim.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm"
            >
              <span className="font-medium">
                {claim.claimant?.display_name ?? claim.claimant?.username ?? "A player"}
              </span>
              <span className="text-muted-foreground">{claim.message ?? "No message"}</span>
              <Badge variant="outline" className="ml-auto">
                {claim.state}
              </Badge>
              {claim.state === "pending" ? (
                <>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await confirmClaim(claim.id, report.id);
                        await refresh();
                        toast.success("Reunited! That's another disc back where it belongs.");
                      } catch {
                        toast.error("Couldn't confirm that claim. Try again in a moment.");
                      }
                    }}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await rejectClaim(claim.id);
                        await refresh();
                      } catch {
                        toast.error("Couldn't update that claim. Try again in a moment.");
                      }
                    }}
                  >
                    Not mine
                  </Button>
                </>
              ) : null}
            </div>
          ))
        )}

        {report.status !== "reunited" && report.status !== "closed" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await setReportStatus(report.id, "closed");
                await refresh();
                toast.success("Report closed.");
              } catch {
                toast.error("Couldn't close that report. Try again in a moment.");
              }
            }}
          >
            Close this report
          </Button>
        ) : null}
      </div>
    </ContentCard>
  );
}
