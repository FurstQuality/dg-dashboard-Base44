import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Plus, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCourseReport,
  listCourseReports,
  voteCourseReport,
} from "@/lib/course-reports.functions";
import { isOfflineError, readOutbox, removeDraft, saveDraft, type ReportDraft } from "@/lib/course-conditions-live";
import { MyReportActions } from "@/components/courses/my-report-actions";
import { REPORT_KINDS, REPORT_KIND_LABEL, SEVERITY_LABEL } from "@/lib/rewards";

/**
 * Live, player-reported course conditions — fallen trees, flooded fairways,
 * missing baskets. Two confirmations promote a report and credit the reporter
 * with contributor points.
 */
export function CourseConditionReports({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const fetchReports = useServerFn(listCourseReports);
  const submitReport = useServerFn(createCourseReport);
  const castVote = useServerFn(voteCourseReport);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("fallen_tree");
  const [severity, setSeverity] = useState<"minor" | "moderate" | "blocking">("moderate");
  const [holeNumber, setHoleNumber] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["course-reports", courseId],
    queryFn: () => fetchReports({ data: { course_id: courseId } }),
    staleTime: 60_000,
  });

  const [drafts, setDrafts] = useState<ReportDraft[]>([]);
  useEffect(() => {
    const load = () => setDrafts(readOutbox().filter((d) => d.course_id === courseId));
    load();
    // Send anything saved without signal as soon as the phone reconnects.
    const flush = async () => {
      for (const d of readOutbox().filter((x) => x.course_id === courseId)) {
        try {
          await submitReport({ data: {
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
      void queryClient.invalidateQueries({ queryKey: ["course-reports", courseId] });
    };
    if (navigator.onLine && readOutbox().some((x) => x.course_id === courseId)) void flush();
    window.addEventListener("online", flush);
    window.addEventListener("dgd:outbox", load);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("dgd:outbox", load);
    };
  }, [courseId, submitReport, queryClient]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["course-reports", courseId] });

  const create = useMutation({
    mutationFn: () =>
      submitReport({
        data: {
          course_id: courseId,
          kind,
          severity,
          hole_number: holeNumber ? Number(holeNumber) : null,
          description: description || null,
        },
      }),
    onSuccess: () => {
      toast.success("Thanks — the next card will see it. Two confirmations earns you points.");
      setOpen(false);
      setDescription("");
      setHoleNumber("");
      void invalidate();
    },
    onError: (error: Error) => {
      if (isOfflineError(error)) {
        saveDraft({
          course_id: courseId, kind, severity,
          hole_number: holeNumber ? Number(holeNumber) : null,
          description: description || null,
        });
        toast.success("No signal — report saved on this phone. It sends when you're back online.");
        setOpen(false);
        setDescription("");
        setHoleNumber("");
        return;
      }
      toast.error(error.message);
    },
  });

  const vote = useMutation({
    mutationFn: (input: { report_id: string; vote: "confirm" | "resolved" | "not_found" }) =>
      castVote({ data: input }),
    onSuccess: () => {
      toast.success("Logged. Thanks for keeping the map honest.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reports = data?.reports ?? [];
  const holeNum = holeNumber ? Number(holeNumber) : null;
  const duplicate = open
    ? reports.find((r) => r.kind === kind && (holeNum == null || r.hole_number == null || r.hole_number === holeNum))
    : undefined;
  const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Course conditions right now</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Anything players should know before they tee off. Confirm what you see out there.
          </p>
        </div>
        <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen(!open)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {open ? "Cancel" : "Report something"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {open ? (
          <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>What's going on?</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_KINDS.map((r) => (
                    <SelectItem key={r.kind} value={r.kind}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>How much does it affect play?</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as typeof severity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="moderate">Worth knowing</SelectItem>
                  <SelectItem value="blocking">Blocks play</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-hole">Hole number (optional)</Label>
              <Input
                id="report-hole"
                inputMode="numeric"
                placeholder="e.g. 7"
                value={holeNumber}
                onChange={(e) => setHoleNumber(e.target.value.replace(/\D/g, "").slice(0, 2))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="report-notes">Details</Label>
              <Textarea
                id="report-notes"
                rows={3}
                placeholder="Big oak down across the fairway about 200 feet out, left side."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {duplicate ? (
              <div role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm sm:col-span-2">
                <p className="font-medium">
                  Someone already reported this{duplicate.hole_number ? ` on hole ${duplicate.hole_number}` : ""}.
                </p>
                <p className="mt-0.5 text-muted-foreground">Confirming it helps more than a second report.</p>
                {!duplicate.is_mine && !duplicate.my_vote ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={vote.isPending}
                    onClick={() => { vote.mutate({ report_id: duplicate.id, vote: "confirm" }); setOpen(false); }}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Confirm it instead
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Button
                size="sm"
                variant={duplicate ? "outline" : "default"}
                onClick={() => create.mutate()}
                disabled={create.isPending}
              >
                {create.isPending ? "Sending…" : "Post report"}
              </Button>
            </div>
          </div>
        ) : null}

        {drafts.length > 0 ? (
          <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {drafts.length} {drafts.length === 1 ? "report is" : "reports are"} saved on this phone and will send when you're back online.
          </p>
        ) : null}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : reports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            The course is clear as far as anyone has told us. If you find a tree down or a missing
            basket, post it here and you'll earn contributor points once two players confirm it.
          </p>
        ) : (
          <ul className="space-y-2">
            {reports.map((report) => (
              <li key={report.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle
                    className={
                      report.severity === "blocking"
                        ? "h-4 w-4 text-destructive"
                        : "h-4 w-4 text-muted-foreground"
                    }
                  />
                  <span className="font-semibold">
                    {REPORT_KIND_LABEL[report.kind] ?? "Course note"}
                  </span>
                  {report.hole_number ? (
                    <Badge variant="outline">Hole {report.hole_number}</Badge>
                  ) : null}
                  <Badge variant="secondary">{SEVERITY_LABEL[report.severity]}</Badge>
                  {report.status === "confirmed" ? (
                    <Badge className="gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Confirmed
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      {report.confirm_count} of 2 confirmations
                    </Badge>
                  )}
                </div>
                {report.description ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">{report.description}</p>
                ) : null}
                {!report.is_mine && !report.my_vote && daysSince(report.created_at) >= 3 ? (
                  <p className="mt-1.5 text-sm font-medium text-warning">
                    Reported {daysSince(report.created_at)} days ago — is it still there?
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Reported by {report.reporter_name ?? "a player"} on{" "}
                  {new Date(report.created_at).toLocaleDateString()}
                </p>
                {report.is_mine ? (
                  <MyReportActions report={report} onChanged={() => void invalidate()} />
                ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {report.my_vote ? (
                    <span className="text-xs text-muted-foreground">
                      You said:{" "}
                      {report.my_vote === "confirm"
                        ? "still there"
                        : report.my_vote === "resolved"
                          ? "cleared up"
                          : "couldn't find it"}
                    </span>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={vote.isPending}
                        onClick={() => vote.mutate({ report_id: report.id, vote: "confirm" })}
                      >
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        Still there
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={vote.isPending}
                        onClick={() => vote.mutate({ report_id: report.id, vote: "resolved" })}
                      >
                        Cleared up
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={vote.isPending}
                        onClick={() => vote.mutate({ report_id: report.id, vote: "not_found" })}
                      >
                        <XCircle className="mr-1.5 h-4 w-4" />
                        Couldn't find it
                      </Button>
                    </>
                  )}
                </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
