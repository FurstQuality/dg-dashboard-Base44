import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPinOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listUnlocatedCourses, setCourseLocation, type UnlocatedCourse } from "@/lib/course-locations.functions";

const QUALITY = [
  { v: "verified_gps", l: "On-site GPS" },
  { v: "source_coordinate", l: "From a listing" },
  { v: "address_geocoded", l: "From the address" },
  { v: "park_geocoded", l: "Park location" },
] as const;

function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

function Row({ c, onSaved }: { c: UnlocatedCourse; onSaved: () => void }) {
  const save = useServerFn(setCourseLocation);
  const [text, setText] = useState("");
  const [quality, setQuality] = useState<(typeof QUALITY)[number]["v"]>("source_coordinate");
  const [busy, setBusy] = useState(false);
  const coords = parseCoords(text);
  const search = encodeURIComponent(`${c.name} disc golf ${c.city ?? ""} ${c.state ?? ""}`);
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-border py-2">
      <div className="min-w-48 flex-1">
        <div className="font-medium text-foreground">{c.name}</div>
        <div className="text-sm text-muted-foreground">
          {[c.city, c.state].filter(Boolean).join(", ") || "Town not listed"}
          {c.hole_count ? ` · ${c.hole_count} holes` : ""}
        </div>
      </div>
      <a className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline" href={`https://www.google.com/maps/search/${search}`} target="_blank" rel="noreferrer">
        Search map <ExternalLink className="h-3.5 w-3.5" />
      </a>
      {c.source_url ? (
        <a className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline" href={c.source_url} target="_blank" rel="noreferrer">
          Listing <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
      <Input className="h-9 w-52" placeholder="Latitude, longitude" value={text} onChange={(e) => setText(e.target.value)} aria-label={`Coordinates for ${c.name}`} />
      <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)} aria-label="Where the location came from">
        {QUALITY.map((q) => <option key={q.v} value={q.v}>{q.l}</option>)}
      </select>
      <Button
        size="sm"
        disabled={!coords || busy}
        onClick={async () => {
          if (!coords) return;
          setBusy(true);
          try {
            await save({ data: { courseId: c.id, ...coords, quality } });
            toast.success(`${c.name} is on the map`);
            onSaved();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't save that location.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Place course
      </Button>
    </li>
  );
}

/** Courses no source could place. Each one is placed by hand with real coordinates. */
export function UnlocatedCoursesQueue() {
  const list = useServerFn(listUnlocatedCourses);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["unlocated-courses", search, offset],
    queryFn: () => list({ data: { search, offset } }),
  });
  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <MapPinOff className="h-5 w-5 text-primary" aria-hidden />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">Courses with no location{data ? ` (${data.total})` : ""}</h2>
          <p className="text-sm text-muted-foreground">No listing or address could place these. Find each one and paste its coordinates.</p>
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer font-medium">How to find a spot, in order</summary>
            <ol className="ml-5 mt-1 list-decimal space-y-0.5 text-muted-foreground">
              <li>Try Repair course data in the map coverage panel — it re-reads the course's listings.</li>
              <li>Open its UDisc, PDGA or Disc Golf Scene page and copy the map spot it shows.</li>
              <li>Search the street address, then the park name, and use the course's first tee or parking lot.</li>
              <li>Check the spot sits in the listed town and state before saving.</li>
              <li>Pick how the spot was found. If nothing places it, leave it here — never use a town centre.</li>
            </ol>
          </details>
        </div>
        <Input className="h-9 w-56" placeholder="Search by course name" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
      </div>
      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading courses…</p>
      ) : data && data.rows.length ? (
        <ul className="mt-3">
          {data.rows.map((c) => (
            <Row key={c.id} c={c} onSaved={() => qc.invalidateQueries({ queryKey: ["unlocated-courses"] })} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Every course has a spot on the map. Nice work.</p>
      )}
      {data && data.total > 50 ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 50))}>Previous</Button>
          <span className="text-muted-foreground">{offset + 1}–{Math.min(offset + 50, data.total)} of {data.total}</span>
          <Button size="sm" variant="secondary" disabled={offset + 50 >= data.total} onClick={() => setOffset((o) => o + 50)}>Next</Button>
        </div>
      ) : null}
    </section>
  );
}
