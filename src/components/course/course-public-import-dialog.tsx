import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Globe, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { lookupPublicCourseData } from "@/lib/course-public-lookup.functions";
import type { PublicCourseCandidate } from "@/lib/course-public-lookup.functions";

type Props = {
  name: string;
  city: string;
  state: string;
  onApply: (candidate: PublicCourseCandidate) => void;
};

/**
 * Searches public disc golf course records (PDGA, UDisc, Disc Golf Course
 * Review) and hands the chosen record back so the builder can prefill the
 * course basics. All provider calls happen server-side.
 */
export function CoursePublicImportDialog({ name, city, state, onApply }: Props) {
  const runLookup = useServerFn(lookupPublicCourseData);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(name);
  const [qCity, setQCity] = useState(city);
  const [qState, setQState] = useState(state);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<PublicCourseCandidate[]>([]);
  const [notes, setNotes] = useState<{ source: string; message: string }[]>([]);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (q.trim().length < 2) {
      toast.error("Enter at least two characters of the course name");
      return;
    }
    setLoading(true);
    try {
      const result = await runLookup({
        data: { name: q.trim(), city: qCity.trim(), state: qState.trim() },
      });
      setCandidates(result.candidates);
      setNotes(result.notes);
      setSearched(true);
      if (!result.candidates.length) toast.info("No public records matched that course yet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Course lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function apply(candidate: PublicCourseCandidate) {
    onApply(candidate);
    setOpen(false);
    toast.success(`Prefilled from ${candidate.source_label}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQ(name);
          setQCity(city);
          setQState(state);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Globe className="mr-1.5 h-3.5 w-3.5" />
          Pull public course data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pull public course data</DialogTitle>
          <DialogDescription>
            Search PDGA, UDisc, and Disc Golf Course Review records, then prefill the basics. You
            can edit everything before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Course name</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Maple Hill" />
          </div>
          <div>
            <Label>City</Label>
            <Input value={qCity} onChange={(e) => setQCity(e.target.value)} placeholder="Leicester" />
          </div>
          <div>
            <Label>State</Label>
            <Input value={qState} onChange={(e) => setQState(e.target.value)} placeholder="MA" />
          </div>
        </div>

        <Button type="button" onClick={search} disabled={loading} className="w-full sm:w-auto">
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-3.5 w-3.5" />
          )}
          {loading ? "Searching public records…" : "Search public records"}
        </Button>

        <div className="max-h-[45vh] space-y-2 overflow-y-auto">
          {candidates.map((c, i) => (
            <div
              key={`${c.source}-${c.url ?? i}`}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{c.source_label}</Badge>
                    <span className="truncate text-sm font-semibold">{c.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[c.city, c.state].filter(Boolean).join(", ") || "Location not listed"}
                    {c.holes ? ` · ${c.holes} holes` : ""}
                    {c.par ? ` · par ${c.par}` : ""}
                    {c.distance_ft ? ` · ${c.distance_ft.toLocaleString()} ft` : ""}
                    {c.designer ? ` · designed by ${c.designer}` : ""}
                  </p>
                </div>
                <Button type="button" size="sm" onClick={() => apply(c)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Use this data
                </Button>
              </div>
              {c.url ? (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-block text-xs text-primary underline"
                >
                  View source record
                </a>
              ) : null}
            </div>
          ))}

          {searched && notes.length ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {notes.map((n, i) => (
                <li key={`${n.source}-${i}`}>
                  {n.source.toUpperCase()}: {n.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
