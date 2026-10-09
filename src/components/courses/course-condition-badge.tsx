import { TriangleAlert, CircleX } from "lucide-react";
import { useCourseStatuses, useLiveConditions, type CourseStatusRow, type LiveCondition } from "@/lib/course-conditions-live";

const LABEL: Record<string, string> = {
  OPEN_WITH_CONDITIONS: "Open with conditions",
  PARTIALLY_CLOSED: "Some holes closed",
  CLOSED: "Closed",
};

/** Small directory/event marker: closed or limited status, else live issue count. Renders nothing when clear. */
export function CourseConditionBadge({
  status,
  issues,
}: {
  status?: CourseStatusRow;
  issues: LiveCondition[];
}) {
  const s = status?.status;
  if (s === "CLOSED")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
        <CircleX className="h-3.5 w-3.5" aria-hidden /> Closed
      </span>
    );
  if (s && LABEL[s])
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> {LABEL[s]}
      </span>
    );
  if (!issues.length) return null;
  const blocking = issues.some((i) => i.severity === "blocking");
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium " +
        (blocking ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning")
      }
    >
      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
      {issues.length} live {issues.length === 1 ? "issue" : "issues"}
    </span>
  );
}

/** Self-loading marker for one course (event rounds, league nights, trackers). */
export function CourseConditionInline({ courseId }: { courseId: string }) {
  const { data: statuses } = useCourseStatuses([courseId]);
  const { data: issues = [] } = useLiveConditions([courseId]);
  return <CourseConditionBadge status={statuses?.get(courseId)} issues={issues} />;
}
