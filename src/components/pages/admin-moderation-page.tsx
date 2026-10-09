import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { matchesOmnisearch } from "@/lib/omnisearch";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  MapPin,
  ShieldAlert,
  ExternalLink,
  RotateCcw,
  Search,
  Undo2,
  AlertTriangle,
  User as UserIcon,
} from "lucide-react";

type ModStatus = "pending" | "approved" | "rejected";

type CourseRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  difficulty: string | null;
  hole_count: number;
  latitude: number | null;
  longitude: number | null;
  overview_snapshot_path: string | null;
  cover_url: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_by: string;
  moderation_status: ModStatus;
};

type Submitter = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type EditRequest = {
  id: string;
  course_id: string;
  requested_by: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  courses?: { name: string } | null;
};

type Tab = "pending" | "edits" | "approved" | "rejected";

type DupMatch = { id: string; name: string; location: string };


export default function AdminModerationPage() {
  const { user, loading: sessionLoading } = useSession();
  const { isAdmin } = useAdminAccess();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [approved, setApproved] = useState<CourseRow[]>([]);
  const [edits, setEdits] = useState<EditRequest[]>([]);
  const [submitters, setSubmitters] = useState<Record<string, Submitter>>({});
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("pending");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState<
    | { kind: "reject_course"; course: CourseRow }
    | { kind: "reject_edit"; edit: EditRequest }
    | { kind: "revoke"; course: CourseRow }
    | null
  >(null);
  const [reason, setReason] = useState("");
  const [merge, setMerge] = useState<{
    course: CourseRow;
    matches: DupMatch[];
    keepId: string;
  } | null>(null);
  const [merging, setMerging] = useState(false);

  async function confirmMerge() {
    if (!merge) return;
    setMerging(true);
    const { error } = await supabase.rpc("merge_duplicate_courses", {
      _keep_id: merge.keepId,
      _duplicate_id: merge.course.id,
    });
    setMerging(false);
    if (error) {
      toast.error(error.message || "Could not merge these courses.");
      return;
    }
    toast.success("Courses merged — the duplicate is now closed out.");
    setMerge(null);
    await refresh();
  }


  async function refresh() {
    setLoading(true);
    const [pendingRes, approvedRes, editsRes] = await Promise.all([
      supabase
        .from("courses")
        .select(
          "id,name,slug,city,state,country,description,difficulty,hole_count,latitude,longitude,overview_snapshot_path,cover_url,submitted_at,reviewed_at,rejection_reason,created_by,moderation_status",
        )
        .in("moderation_status", ["pending", "rejected"])
        .order("submitted_at", { ascending: false }),
      supabase
        .from("courses")
        .select(
          "id,name,slug,city,state,country,description,difficulty,hole_count,latitude,longitude,overview_snapshot_path,cover_url,submitted_at,reviewed_at,rejection_reason,created_by,moderation_status",
        )
        .eq("moderation_status", "approved")
        .order("reviewed_at", { ascending: false })
        .limit(200),
      supabase
        .from("course_edit_requests")
        .select("id,course_id,requested_by,payload,status,created_at,courses(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    const pendingRows = (pendingRes.data as CourseRow[]) ?? [];
    const approvedRows = (approvedRes.data as CourseRow[]) ?? [];
    const editRows = (editsRes.data as unknown as EditRequest[]) ?? [];
    setCourses(pendingRows);
    setApproved(approvedRows);
    setEdits(editRows);

    const userIds = Array.from(
      new Set([
        ...pendingRows.map((c) => c.created_by),
        ...approvedRows.map((c) => c.created_by),
        ...editRows.map((e) => e.requested_by),
      ]),
    ).filter(Boolean);
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", userIds);
      const map: Record<string, Submitter> = {};
      for (const p of (profs ?? []) as Submitter[]) map[p.id] = p;
      setSubmitters(map);
    }

    const snapPaths = pendingRows
      .concat(approvedRows)
      .map((c) => c.overview_snapshot_path)
      .filter((p): p is string => !!p);
    if (snapPaths.length) {
      const { data: signed } = await supabase.storage
        .from("courses")
        .createSignedUrls(snapPaths, 3600);
      const smap: Record<string, string> = {};
      for (const s of signed ?? []) if (s.path && s.signedUrl) smap[s.path] = s.signedUrl;
      setSnapshots(smap);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin]);

  // NOTE: admin/session gating happens after all hooks below (see just before `return`).

  async function approveCourse(id: string) {
    const { error } = await supabase
      .from("courses")
      .update({
        moderation_status: "approved",
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Course approved");
    refresh();
  }

  async function submitReject() {
    if (!decision) return;
    const trimmed = reason.trim() || null;
    if (decision.kind === "reject_course") {
      const { error } = await supabase
        .from("courses")
        .update({
          moderation_status: "rejected",
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: trimmed,
        })
        .eq("id", decision.course.id);
      if (error) return toast.error(error.message);
      toast.success("Course rejected");
    } else if (decision.kind === "reject_edit") {
      const { error } = await supabase
        .from("course_edit_requests")
        .update({
          status: "rejected",
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: trimmed,
        })
        .eq("id", decision.edit.id);
      if (error) return toast.error(error.message);
      toast.success("Edit rejected");
    } else if (decision.kind === "revoke") {
      const { error } = await supabase
        .from("courses")
        .update({
          moderation_status: "pending",
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: trimmed,
        })
        .eq("id", decision.course.id);
      if (error) return toast.error(error.message);
      toast.success("Course returned to pending");
    }
    setDecision(null);
    setReason("");
    refresh();
  }

  async function approveEdit(req: EditRequest) {
    const payload = req.payload as Record<string, unknown>;
    const allowed = ["name", "description", "city", "state", "difficulty"] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in payload) patch[k] = payload[k];
    const { error: uErr } = await supabase
      .from("courses")
      .update(patch as never)
      .eq("id", req.course_id);
    if (uErr) return toast.error(uErr.message);
    const { error } = await supabase
      .from("course_edit_requests")
      .update({ status: "approved", reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", req.id);
    if (error) return toast.error(error.message);
    toast.success("Edit applied");
    refresh();
  }

  const pending = useMemo(
    () =>
      filter(
        courses.filter((c) => c.moderation_status === "pending"),
        query,
      ),
    [courses, query],
  );
  const rejected = useMemo(
    () =>
      filter(
        courses.filter((c) => c.moderation_status === "rejected"),
        query,
      ),
    [courses, query],
  );
  const approvedFiltered = useMemo(() => filter(approved, query), [approved, query]);
  const editsFiltered = useMemo(
    () => edits.filter((e) => matchesOmnisearch(e, query)),
    [edits, query],
  );

  // Duplicate detection: any pending course whose name matches an existing approved course
  // in the same city/state or within ~2km if coordinates exist.
  const dupWarnings = useMemo(() => {
    const map = new Map<string, DupMatch[]>();
    for (const p of pending) {
      const near = approved.filter((a) => isLikelyDuplicate(p, a));
      if (near.length)
        map.set(
          p.id,
          near.map((a) => ({
            id: a.id,
            name: a.name,
            location: [a.city, a.state].filter(Boolean).join(", "),
          })),
        );
    }
    return map;
  }, [pending, approved]);


  if (sessionLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!isAdmin) {
    return (
      <PageShell>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h2 className="font-display text-xl font-semibold">Admins only</h2>
          <p className="text-sm text-muted-foreground">You do not have access to this page.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin"
        title="Course moderation"
        description="Review submissions, edit requests, and manage the approved course library."
        primaryAction={
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, city, submitter…"
              className="pl-8"
            />
          </div>
        }
      />
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <TabBtn active={tab === "pending"} onClick={() => setTab("pending")}>
            Pending ({pending.length})
          </TabBtn>
          <TabBtn active={tab === "edits"} onClick={() => setTab("edits")}>
            Edit requests ({editsFiltered.length})
          </TabBtn>
          <TabBtn active={tab === "approved"} onClick={() => setTab("approved")}>
            Approved ({approvedFiltered.length})
          </TabBtn>
          <TabBtn active={tab === "rejected"} onClick={() => setTab("rejected")}>
            Rejected ({rejected.length})
          </TabBtn>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={refresh}>
            <RotateCcw className="mr-1 h-4 w-4" /> Refresh
          </Button>
        </div>

        {loading ? <Skeleton className="h-40 w-full rounded-xl" /> : null}

        {tab === "pending" && !loading ? (
          <div className="space-y-3">
            {pending.length === 0 ? (
              <Empty label="No pending courses." />
            ) : (
              pending.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  submitter={submitters[c.created_by]}
                  snapshotUrl={
                    c.overview_snapshot_path ? snapshots[c.overview_snapshot_path] : undefined
                  }
                  duplicates={dupWarnings.get(c.id)}
                  actions={
                    <>
                      <Button size="sm" onClick={() => approveCourse(c.id)}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDecision({ kind: "reject_course", course: c });
                          setReason("");
                        }}
                      >
                        <XCircle className="mr-1 h-4 w-4" /> Reject
                      </Button>
                      {(dupWarnings.get(c.id)?.length ?? 0) > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const matches = dupWarnings.get(c.id) ?? [];
                            setMerge({ course: c, matches, keepId: matches[0]!.id });
                          }}
                        >
                          <AlertTriangle className="mr-1 h-4 w-4" /> Confirm duplicate & merge
                        </Button>
                      ) : null}
                    </>

                  }
                />
              ))
            )}
          </div>
        ) : null}

        {tab === "edits" && !loading ? (
          <div className="space-y-3">
            {editsFiltered.length === 0 ? (
              <Empty label="No pending edit requests." />
            ) : (
              editsFiltered.map((e) => (
                <div key={e.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display text-lg font-semibold">
                        Edit: {e.courses?.name ?? e.course_id}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Submitted by{" "}
                        {submitters[e.requested_by]?.display_name ??
                          submitters[e.requested_by]?.username ??
                          e.requested_by.slice(0, 8)}{" "}
                        · {new Date(e.created_at).toLocaleString()}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {Object.entries(e.payload).map(([k, v]) => (
                          <div
                            key={k}
                            className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs"
                          >
                            <div className="font-medium text-muted-foreground">{k}</div>
                            <div className="mt-0.5 break-words">{String(v ?? "")}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button size="sm" onClick={() => approveEdit(e)}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDecision({ kind: "reject_edit", edit: e });
                          setReason("");
                        }}
                      >
                        <XCircle className="mr-1 h-4 w-4" /> Reject
                      </Button>
                      <Link
                        to="/courses/$courseId"
                        params={{ courseId: e.course_id }}
                        className="text-center text-xs text-primary underline"
                      >
                        View course
                      </Link>
                      <Link
                        to="/edit"
                        search={{ type: "course", id: e.course_id }}
                        className="text-center text-xs text-primary underline"
                      >
                        Edit tracked fields
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "approved" && !loading ? (
          <div className="space-y-3">
            {approvedFiltered.length === 0 ? (
              <Empty label="No approved courses match." />
            ) : (
              approvedFiltered.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  submitter={submitters[c.created_by]}
                  snapshotUrl={
                    c.overview_snapshot_path ? snapshots[c.overview_snapshot_path] : undefined
                  }
                  actions={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDecision({ kind: "revoke", course: c });
                        setReason("");
                      }}
                    >
                      <Undo2 className="mr-1 h-4 w-4" /> Return to pending
                    </Button>
                  }
                />
              ))
            )}
          </div>
        ) : null}

        {tab === "rejected" && !loading ? (
          <div className="space-y-3">
            {rejected.length === 0 ? (
              <Empty label="No rejected courses." />
            ) : (
              rejected.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  submitter={submitters[c.created_by]}
                  snapshotUrl={
                    c.overview_snapshot_path ? snapshots[c.overview_snapshot_path] : undefined
                  }
                  actions={
                    <Button size="sm" onClick={() => approveCourse(c.id)}>
                      <CheckCircle2 className="mr-1 h-4 w-4" /> Approve now
                    </Button>
                  }
                />
              ))
            )}
          </div>
        ) : null}

        <Dialog
          open={!!decision}
          onOpenChange={(o) => {
            if (!o) {
              setDecision(null);
              setReason("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {decision?.kind === "revoke"
                  ? "Return course to pending"
                  : decision?.kind === "reject_edit"
                    ? "Reject edit request"
                    : "Reject course"}
              </DialogTitle>
              <DialogDescription>
                This note is saved with the moderation record and shown to the submitter.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional but recommended)…"
              rows={4}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDecision(null)}>
                Cancel
              </Button>
              <Button onClick={submitReject}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!merge} onOpenChange={(o) => (!o ? setMerge(null) : null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm duplicate & merge</DialogTitle>
              <DialogDescription>
                Keep one course and fold this submission into it. Rounds, ratings, events, reviews,
                layouts, and listings move to the course you keep. The duplicate is closed out with a
                note instead of being deleted.
              </DialogDescription>
            </DialogHeader>
            {merge ? (
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Submission to merge away
                  </div>
                  <div className="font-medium">{merge.course.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[merge.course.city, merge.course.state].filter(Boolean).join(", ") ||
                      "Unknown location"}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Course to keep
                  </div>
                  {merge.matches.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 hover:bg-muted/50"
                    >
                      <input
                        type="radio"
                        name="merge-keep"
                        className="mt-1"
                        checked={merge.keepId === m.id}
                        onChange={() => setMerge({ ...merge, keepId: m.id })}
                      />
                      <span>
                        <span className="font-medium">{m.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {m.location || "Unknown location"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMerge(null)} disabled={merging}>
                Cancel
              </Button>
              <Button onClick={confirmMerge} disabled={merging}>
                {merging ? "Merging…" : "Merge courses"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </PageShell>
  );
}

function filter(rows: CourseRow[], q: string) {
  return rows.filter((c) => matchesOmnisearch(c, q));
}

function isLikelyDuplicate(a: CourseRow, b: CourseRow) {
  if (a.id === b.id) return false;
  const na = norm(a.name);
  const nb = norm(b.name);
  const sameName =
    na === nb || (na.length > 4 && nb.includes(na)) || (nb.length > 4 && na.includes(nb));
  if (!sameName) return false;
  if (a.latitude && a.longitude && b.latitude && b.longitude) {
    return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) < 5;
  }
  return (a.city ?? "").toLowerCase() === (b.city ?? "").toLowerCase();
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function CourseCard({
  course,
  submitter,
  snapshotUrl,
  duplicates,
  actions,
}: {
  course: CourseRow;
  submitter?: Submitter;
  snapshotUrl?: string;
  duplicates?: DupMatch[];
  actions: React.ReactNode;
}) {

  const cover = snapshotUrl ?? course.cover_url ?? null;
  const locBits = [course.city, course.state, course.country].filter(Boolean).join(", ");
  const mapUrl =
    course.latitude != null && course.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${course.latitude},${course.longitude}`
      : null;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-4 p-4 md:flex-row">
        <div className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted md:h-40 md:w-56">
          {cover ? (
            <img
              src={cover}
              alt={`${course.name} overview`}
              className="h-full w-full object-cover"
            />
          ) : (
            <MapPin className="h-8 w-8 text-muted-foreground/60" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to="/courses/$courseId"
                params={{ courseId: course.id }}
                className="font-display text-lg font-semibold hover:underline"
              >
                {course.name}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {locBits || "Unknown location"}
                </span>
                <span>{course.hole_count} holes</span>
                {course.difficulty ? <span>Difficulty: {course.difficulty}</span> : null}
                <span>Submitted {new Date(course.submitted_at).toLocaleDateString()}</span>
                {mapUrl ? (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Map <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
              {submitter ? (
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-2 py-1 text-xs">
                  {submitter.avatar_url ? (
                    <img
                      src={submitter.avatar_url}
                      alt=""
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  ) : (
                    <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{submitter.display_name ?? submitter.username ?? "Unknown"}</span>
                </div>
              ) : null}
              {course.description ? (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{course.description}</p>
              ) : null}
              {course.rejection_reason ? (
                <p className="mt-2 max-w-2xl rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  Previous note: {course.rejection_reason}
                </p>
              ) : null}
              {duplicates && duplicates.length ? (
                <div className="mt-2 inline-flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Possible duplicate of already-approved course{duplicates.length > 1 ? "s" : ""}:{" "}
                    <strong>{duplicates.map((d) => d.name).join(", ")}</strong>

                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2">{actions}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
