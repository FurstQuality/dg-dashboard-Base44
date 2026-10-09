import { MyReportActions } from "@/components/courses/my-report-actions";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Ban,
  Construction,
  Droplets,
  Flag,
  MapPin,
  Megaphone,
  ThumbsDown,
  ThumbsUp,
  TreePine,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  createCourseReport,
  listCourseReports,
  voteCourseReport,
  type CourseReportRow,
} from "@/lib/course-reports.functions";
import { REPORT_KINDS, REPORT_KIND_LABEL, type CourseReportKind } from "@/lib/rewards";
import { isOfflineError, readOutbox, removeDraft, saveDraft } from "@/lib/course-conditions-live";

const KIND_ICON: Partial<Record<string, typeof AlertTriangle>> = {
  fallen_tree: TreePine,
  flooding: Droplets,
  construction: Construction,
  closed: Ban,
  basket_missing: Flag,
  basket_moved: MapPin,
};

function ago(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

interface Props {
  courseId: string;
  holeNumber: number | null;
}

/**
 * Waze-style course issue alerts during a round: open reports pop up as the
 * player reaches that hole and ask "Still there?" with thumbs up / down.
 */
export function CourseIssueRadar({ courseId, holeNumber }: Props) {
  const qc = useQueryClient();
  const list = useServerFn(listCourseReports);
  const vote = useServerFn(voteCourseReport);
  const create = useServerFn(createCourseReport);
  const key = ["course-reports", courseId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => list({ data: { course_id: courseId } }),
    refetchInterval: 120_000,
  });
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [reportOpen, setReportOpen] = useState(false);
  const [kind, setKind] = useState<CourseReportKind | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Next alert: unanswered report on this hole first, then course-wide ones.
  const current = useMemo<CourseReportRow | null>(() => {
    const open = (data?.reports ?? []).filter((r) => !r.is_mine && !r.my_vote && !handled.has(r.id));
    return (
      open.find((r) => holeNumber != null && r.hole_number === holeNumber) ??
      open.find((r) => r.hole_number == null) ??
      null
    );
  }, [data, handled, holeNumber]);

  // Auto-dismiss after a while, like a passing map alert.
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => dismiss(current.id), 20_000);
    return () => clearTimeout(t);
  }, [current?.id]);

  function dismiss(id: string) {
    setHandled((s) => new Set(s).add(id));
  }

  async function answer(r: CourseReportRow, v: "confirm" | "not_found") {
    dismiss(r.id);
    try {
      await vote({ data: { report_id: r.id, vote: v } });
      if (navigator.vibrate) navigator.vibrate(30);
      toast.success(v === "confirm" ? "Thanks — still there." : "Thanks — marked as gone.");
      void qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "We couldn't save that.");
    }
  }

  // Send reports saved without signal once the phone reconnects.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const load = () => setPending(readOutbox().filter((d) => d.course_id === courseId).length);
    const flush = async () => {
      for (const d of readOutbox().filter((x) => x.course_id === courseId)) {
        try {
          await create({ data: {
            course_id: d.course_id, kind: d.kind, severity: d.severity,
            hole_number: d.hole_number, description: d.description, lat: d.lat ?? null, lng: d.lng ?? null,
          } });
          removeDraft(d.localId);
          toast.success("Your saved report was sent.");
        } catch (e) {
          if (isOfflineError(e)) break;
          removeDraft(d.localId);
        }
      }
      load();
      void qc.invalidateQueries({ queryKey: key });
    };
    load();
    if (navigator.onLine && readOutbox().some((x) => x.course_id === courseId)) void flush();
    window.addEventListener("online", flush);
    window.addEventListener("dgd:outbox", load);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("dgd:outbox", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function submitReport() {
    if (!kind) return;
    setBusy(true);
    const payload = { course_id: courseId, kind, hole_number: holeNumber, description: note || null };
    const reset = () => {
      setReportOpen(false);
      setKind(null);
      setNote("");
    };
    try {
      await create({ data: payload });
      toast.success("Reported. Players behind you will see it.");
      reset();
      void qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      if (isOfflineError(e)) {
        saveDraft({ ...payload, severity: "moderate" });
        toast.success("No signal — report saved on this phone. It sends when you're back online.");
        reset();
      } else {
        toast.error(e instanceof Error ? e.message : "We couldn't send that report.");
      }
    } finally {
      setBusy(false);
    }
  }

  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("round-header-report-slot"));
  }, []);

  const Icon = current ? (KIND_ICON[current.kind] ?? AlertTriangle) : AlertTriangle;
  const confirms = current ? current.confirm_count : 0;

  return (
    <>
      {/* Report button — lives in the round header beside the menu */}
      {slot
        ? createPortal(
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              aria-label="Report a course issue"
              title="Report a course issue"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-warning hover:bg-muted"
            >
              <Megaphone className="h-5 w-5" />
            </button>,
            slot,
          )
        : null}

      {/* Pop-up alert */}
      {current && !reportOpen ? (
        <div
          role="alertdialog"
          aria-label="Course issue ahead"
          className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md animate-in slide-in-from-bottom-8 fade-in duration-300 motion-reduce:animate-none md:bottom-6"
        >
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            <div className="flex items-start gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {REPORT_KIND_LABEL[current.kind] ?? "Course issue"}
                  {current.hole_number ? ` · Hole ${current.hole_number}` : " · Whole course"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Reported {ago(current.created_at)}
                  {confirms > 0 ? ` · ${confirms} confirmed` : ""}
                </p>
                {current.description ? (
                  <p className="mt-1 line-clamp-2 text-sm">{current.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(current.id)}
                aria-label="Not now"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-t border-border px-4 pb-4 pt-3">
              <p className="mb-2 text-sm font-medium">Is it still there?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="lg"
                  className="h-12 bg-success text-success-foreground hover:bg-success/90"
                  onClick={() => answer(current, "confirm")}
                >
                  <ThumbsUp className="mr-2 h-5 w-5" /> Still there
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12"
                  onClick={() => answer(current, "not_found")}
                >
                  <ThumbsDown className="mr-2 h-5 w-5" /> It's gone
                </Button>
              </div>
            </div>
            <div className="h-1 origin-left animate-[shrink_20s_linear_forwards] bg-warning motion-reduce:hidden" />
          </div>
        </div>
      ) : null}

      {/* Quick report sheet */}
      {reportOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60 backdrop-blur-sm md:items-center">
          <div className="w-full max-w-md animate-in slide-in-from-bottom-8 rounded-t-2xl border border-border bg-card p-4 shadow-xl motion-reduce:animate-none md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-lg">
                Report an issue{holeNumber ? ` on hole ${holeNumber}` : ""}
              </p>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {REPORT_KINDS.map((k) => {
                const KIcon = KIND_ICON[k.kind] ?? AlertTriangle;
                return (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => setKind(k.kind)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-sm transition-colors ${
                      kind === k.kind ? "border-warning bg-warning/10" : "border-border hover:bg-muted"
                    }`}
                  >
                    <KIcon className="h-6 w-6 text-warning" />
                    {k.label}
                  </button>
                );
              })}
            </div>
            {kind ? (
              <Textarea
                className="mt-3"
                placeholder="Anything players should know? (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
            ) : null}
            <Button className="mt-3 h-12 w-full" disabled={!kind || busy} onClick={submitReport}>
              Send report
            </Button>
            {(data?.reports ?? []).some((r) => r.is_mine) ? (
              <div className="mt-4 max-h-[40dvh] space-y-2 overflow-y-auto border-t border-border pt-3">
                <p className="text-sm font-medium">Your reports on this course</p>
                {(data?.reports ?? []).filter((r) => r.is_mine).map((r) => (
                  <div key={r.id} className="rounded-lg border border-border p-2.5">
                    <p className="text-sm font-semibold">
                      {REPORT_KIND_LABEL[r.kind] ?? "Course issue"}
                      {r.hole_number ? ` · Hole ${r.hole_number}` : " · Whole course"}
                    </p>
                    {r.description ? <p className="text-sm text-muted-foreground">{r.description}</p> : null}
                    <MyReportActions key={`${r.id}:${r.kind}:${r.hole_number}:${r.description}`} report={r}
                      onChanged={() => void qc.invalidateQueries({ queryKey: key })} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
