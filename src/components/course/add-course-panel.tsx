import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { normalizeStateCode } from "@/lib/us-states";
import type { DirectoryCourse } from "@/lib/course-directory.functions";

type Point = { lat: number; lng: number };

function miles(a: Point, b: Point) {
  const r = (v: number) => (v * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Add a course from the directory map: pick a spot, see nearby known courses
 * (duplicate check), enter just the identity, and create the real course
 * record straight away — the same record is then opened in Course Studio.
 */
export function AddCoursePanel({
  picked,
  onUseCenter,
  onCancel,
}: {
  picked: Point | null;
  onUseCenter: () => void;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [holes, setHoles] = useState("");
  const [saving, setSaving] = useState(false);

  // Duplicate check reads the whole library around the spot, not just the
  // courses the directory filters happen to show.
  const [nearby, setNearby] = useState<{ c: Pick<DirectoryCourse, "id" | "name">; d: number }[]>([]);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!picked) return setNearby([]);
    let live = true;
    setChecking(true);
    const dLat = 2 / 69;
    const dLng = 2 / (69 * Math.cos((picked.lat * Math.PI) / 180));
    supabase
      .from("courses")
      .select("id, name, latitude, longitude")
      .gte("latitude", picked.lat - dLat)
      .lte("latitude", picked.lat + dLat)
      .gte("longitude", picked.lng - dLng)
      .lte("longitude", picked.lng + dLng)
      .limit(50)
      .then(({ data }) => {
        if (!live) return;
        setChecking(false);
        setNearby(
          (data ?? [])
            .map((c) => ({ c, d: miles(picked, { lat: c.latitude as number, lng: c.longitude as number }) }))
            .filter((x) => x.d <= 2)
            .sort((a, b) => a.d - b.d)
            .slice(0, 5),
        );
      });
    return () => {
      live = false;
    };
  }, [picked]);

  async function create() {
    if (!picked || !name.trim()) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in to add a course");
      const holeCount = Math.min(Math.max(parseInt(holes, 10) || 18, 1), 54);
      const slug =
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
        "-" +
        Math.random().toString(36).slice(2, 6);
      const { data: course, error } = await supabase
        .from("courses")
        .insert({
          name: name.trim(),
          slug,
          city: city.trim() || null,
          state: normalizeStateCode(state) ?? (state.trim() || null),
          latitude: picked.lat,
          longitude: picked.lng,
          hole_count: holeCount,
          created_by: auth.user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: lErr } = await supabase.from("course_layouts").insert({
        course_id: course.id,
        name: "Main",
        hole_count: holeCount,
        is_default: true,
      });
      if (lErr) throw lErr;
      toast.success("Course created — now map the holes");
      navigate({ to: "/courses", search: (prev) => ({ ...prev, add: "", studio: course.id }) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the course. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Add a course</h2>
          <p className="text-sm text-muted-foreground">
            {picked
              ? "Check nearby courses first, then name the new one."
              : "Click the map to zoom in, then click the exact spot where the course is."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onUseCenter}>
            <MapPin className="mr-1 h-4 w-4" /> Use map center
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="mr-1 h-4 w-4" /> Cancel
          </Button>
        </div>
      </div>

      {picked ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium">Known courses within 2 miles</h3>
            {checking ? (
              <p className="mt-1 text-sm text-muted-foreground">Checking the library…</p>
            ) : nearby.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                None found nearby — looks like a new course.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {nearby.map(({ c, d }) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2">
                    <span className="text-sm">
                      {c.name} · {d.toFixed(1)} mi
                    </span>
                    <span className="flex gap-1">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/courses/$courseId" params={{ courseId: c.id }}>Open</Link>
                      </Button>
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/courses/$courseId/edit" params={{ courseId: c.id }}>Help map</Link>
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ac-name">Course name</Label>
            <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 grid gap-1">
                <Label htmlFor="ac-city">City</Label>
                <Input id="ac-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="ac-state">State</Label>
                <Input id="ac-state" value={state} onChange={(e) => setState(e.target.value)} />
              </div>
            </div>
            <Label htmlFor="ac-holes">Holes (optional)</Label>
            <Input id="ac-holes" inputMode="numeric" placeholder="18" value={holes} onChange={(e) => setHoles(e.target.value)} />
            <Button className="mt-2" disabled={!name.trim() || saving} onClick={create}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Create course and start mapping
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
