import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignPinsToLayout, getUnassignedPinCourses, type UnassignedPinCourse } from "@/lib/course-geometry/harvest.functions";

/** Courses with separate hole sets per layout: a person picks which layout's holes the map's hole numbers belong to. */
export function UnassignedPinsReview() {
  const listFn = useServerFn(getUnassignedPinCourses);
  const q = useQuery({ queryKey: ["geometry-unassigned"], queryFn: () => listFn() });
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">Pick which holes the map pins belong to</h3>
      <p className="text-sm text-muted-foreground">
        These courses have more than one set of holes, so numbered map pins weren't placed. Pick the layout they match — pins are added as extra tee and basket choices; the layout itself doesn't change.
      </p>
      {q.isLoading ? <p className="mt-1 text-sm text-muted-foreground">Looking for courses…</p>
        : !q.data?.length ? <p className="mt-1 text-sm text-muted-foreground">Nothing waiting — every numbered pin has a hole.</p>
        : <ul className="mt-1 divide-y divide-border">{q.data.map((c) => <Row key={c.courseId} c={c} />)}</ul>}
    </div>
  );
}

function Row({ c }: { c: UnassignedPinCourse }) {
  const qc = useQueryClient();
  const fn = useServerFn(assignPinsToLayout);
  const [layoutId, setLayoutId] = useState<string>("");
  const m = useMutation({
    mutationFn: () => fn({ data: { courseId: c.courseId, layoutId } }),
    onSuccess: (r) => { toast.success(r.added ? `Added ${r.added} tee and basket spots` : "Those holes already have these spots"); void qc.invalidateQueries({ queryKey: ["geometry-unassigned"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't place those pins"),
  });
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <Link to="/courses/$courseId" params={{ courseId: c.courseId }} className="min-w-0 flex-1 truncate font-medium hover:underline">
        {c.name}<span className="ml-1 font-normal text-muted-foreground">{c.state ? `${c.state} · ` : ""}{c.pins} pins</span>
      </Link>
      <Select value={layoutId} onValueChange={setLayoutId}>
        <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Choose a layout" /></SelectTrigger>
        <SelectContent>{c.layouts.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.holes} holes</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" disabled={!layoutId || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Placing…" : "Place pins"}</Button>
    </li>
  );
}
