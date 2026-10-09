import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link as LinkIcon, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertScheduledEvent, parseEventUrl } from "@/lib/scheduled-events.functions";
import type { SceneParsed } from "@/lib/scene-parser";

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "Date TBD";
  const s = new Date(start + "T12:00:00Z");
  if (!end || end === start)
    return s.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const e = new Date(end + "T12:00:00Z");
  return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function AddEventPanel({ onSaved }: { onSaved: () => void }) {
  const [tab, setTab] = useState<"url" | "manual">("url");
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Add an event</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={tab === "url" ? "default" : "outline"}
            onClick={() => setTab("url")}
          >
            <LinkIcon className="mr-1 h-3 w-3" />
            Paste PDGA / DGS URL
          </Button>
          <Button
            size="sm"
            variant={tab === "manual" ? "default" : "outline"}
            onClick={() => setTab("manual")}
          >
            <Plus className="mr-1 h-3 w-3" />
            Manual
          </Button>
        </div>
        {tab === "url" && <UrlPanel onSaved={onSaved} />}
        {tab === "manual" && <ManualPanel onSaved={onSaved} />}
      </CardContent>
    </Card>
  );
}

function UrlPanel({ onSaved }: { onSaved: () => void }) {
  const parseFn = useServerFn(parseEventUrl);
  const upsertFn = useServerFn(upsertScheduledEvent);
  const [url, setUrl] = useState("");
  const [parsed, setParsed] = useState<SceneParsed | null>(null);

  const parseMut = useMutation({
    mutationFn: async () => parseFn({ data: { url } }),
    onSuccess: (r) => setParsed(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: async (status: "interested" | "registered") => {
      if (!parsed) throw new Error("No parsed event");
      return upsertFn({
        data: {
          source: /pdga\.com/i.test(url) ? "pdga" : "disc_golf_scene",
          status,
          title: parsed.title,
          event_url: parsed.event_url,
          registration_url: parsed.registration_url,
          external_id: parsed.external_id,
          location: parsed.location,
          city: parsed.city,
          state: parsed.state,
          country: parsed.country,
          starts_on: parsed.starts_on,
          ends_on: parsed.ends_on,
          registration_deadline: parsed.registration_deadline,
          tier: parsed.tier,
          entry_fee_cents: parsed.entry_fee_cents,
          spots_total: parsed.spots_total,
          spots_taken: parsed.spots_taken,
        },
      });
    },
    onSuccess: () => {
      toast.success("Added to your calendar");
      setParsed(null);
      setUrl("");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          className="flex-1 min-w-[240px]"
          placeholder="https://www.pdga.com/tour/event/… or discgolfscene.com/tournaments/…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setParsed(null);
          }}
        />
        <Button onClick={() => parseMut.mutate()} disabled={!url || parseMut.isPending}>
          {parseMut.isPending ? "Parsing…" : "Auto-parse"}
        </Button>
      </div>
      {parsed && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">{parsed.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateRange(parsed.starts_on, parsed.ends_on)}
            {parsed.location ? ` · ${parsed.location}` : ""}
            {parsed.tier ? ` · ${parsed.tier}` : ""}
            {parsed.entry_fee_cents != null
              ? ` · $${(parsed.entry_fee_cents / 100).toFixed(2)}`
              : ""}
          </p>
          {parsed.divisions.length > 0 && (
            <p className="mt-1 text-xs">Divisions: {parsed.divisions.join(", ")}</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => saveMut.mutate("registered")}
              disabled={saveMut.isPending}
            >
              Add as Registered
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveMut.mutate("interested")}
              disabled={saveMut.isPending}
            >
              Add as Interested
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualPanel({ onSaved }: { onSaved: () => void }) {
  const upsertFn = useServerFn(upsertScheduledEvent);
  const [title, setTitle] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [location, setLocation] = useState("");
  const [tier, setTier] = useState("");
  const [division, setDivision] = useState("");
  const [status, setStatus] = useState<"interested" | "registered" | "waitlisted" | "confirmed">(
    "registered",
  );
  const [url, setUrl] = useState("");
  const [dow, setDow] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  const recurring = dow !== "none";

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await upsertFn({
        data: {
          source: "manual",
          status,
          title: title.trim(),
          event_url: url.trim() || null,
          starts_on: starts || null,
          ends_on: ends || null,
          location: location.trim() || null,
          tier: tier.trim() || null,
          division: division.trim() || null,
          recurrence_dow: recurring ? Number(dow) : null,
        },
      });
      toast.success(recurring ? "Personal recurring event added" : "Added to your calendar");
      setTitle("");
      setStarts("");
      setEnds("");
      setLocation("");
      setTier("");
      setDivision("");
      setUrl("");
      setDow("none");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Personal events are only visible to you. Use "Repeats on" to add something like a weekly
        casual league without creating it app-wide.
      </p>
      <Input
        placeholder="Event title (e.g. Friday Casual League)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {recurring ? "First date" : "Start date"}
          </label>
          <Input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {recurring ? "Repeat until" : "End date"}
          </label>
          <Input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Repeats on
          </label>
          <Select value={dow} onValueChange={setDow}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">One-time event</SelectItem>
              <SelectItem value="0">Every Sunday</SelectItem>
              <SelectItem value="1">Every Monday</SelectItem>
              <SelectItem value="2">Every Tuesday</SelectItem>
              <SelectItem value="3">Every Wednesday</SelectItem>
              <SelectItem value="4">Every Thursday</SelectItem>
              <SelectItem value="5">Every Friday</SelectItem>
              <SelectItem value="6">Every Saturday</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Status
          </label>
          <Select value={status} onValueChange={(v) => setStatus(v as never)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="interested">Interested</SelectItem>
              <SelectItem value="registered">Registered</SelectItem>
              <SelectItem value="waitlisted">Waitlisted</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Input
        placeholder="Location (City, ST)"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Tier (C-Tier, League…)"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
        />
        <Input
          placeholder="Division (MPO, MA1…)"
          value={division}
          onChange={(e) => setDivision(e.target.value)}
        />
      </div>
      <Input
        placeholder="Event URL (optional)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={!title.trim() || busy}>
          Save
        </Button>
      </div>
    </div>
  );
}
