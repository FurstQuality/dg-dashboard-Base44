import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  resolveDirectorTask,
  type DirectorTaskContext,
} from "@/lib/director-task-links";

const cls =
  "inline-flex shrink-0 items-center gap-1 rounded-control border border-border px-2 py-0.5 text-[12px] font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary/5";

/**
 * The "go do it" link on a director task. Renders nothing when a task has no
 * obvious destination, so the list never shows a dead control.
 */
export function DirectorTaskLink({
  text,
  detail,
  context,
}: {
  text: string;
  detail?: string;
  context?: DirectorTaskContext;
}) {
  if (!context) return null;
  const target = resolveDirectorTask([text, detail ?? ""].join(" "), context);
  if (!target) return null;

  const inner = (
    <>
      {target.label}
      <ArrowRight className="h-3 w-3" />
    </>
  );

  if (target.kind === "hash")
    return (
      <a href={`#${target.hash}`} className={cls}>
        {inner}
      </a>
    );

  if (target.kind === "course")
    return (
      <Link to="/courses/$courseId" params={{ courseId: target.courseId }} className={cls}>
        {inner}
      </Link>
    );

  if (target.kind === "courses")
    return (
      <Link to="/courses" className={cls}>
        {inner}
      </Link>
    );

  return context.kind === "league" ? (
    <Link to="/leagues/$slug" params={{ slug: context.slug }} className={cls}>
      {inner}
    </Link>
  ) : (
    <Link to="/tournaments/$slug" params={{ slug: context.slug }} className={cls}>
      {inner}
    </Link>
  );
}
