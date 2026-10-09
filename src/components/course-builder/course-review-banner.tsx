import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Tells the course creator their new course is a draft until it's approved. */
export function CourseReviewBanner({ courseId }: { courseId?: string | null }) {
  const { data } = useQuery({
    queryKey: ["course-review-status", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("moderation_status, rejection_reason")
        .eq("id", courseId as string)
        .maybeSingle();
      return data;
    },
  });
  if (!data || data.moderation_status === "approved") return null;
  const rejected = data.moderation_status === "rejected";
  return (
    <div
      role="status"
      className={`border-b px-3 py-1.5 text-sm ${rejected ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted text-foreground"}`}
    >
      {rejected
        ? `This course wasn't approved${data.rejection_reason ? `: ${data.rejection_reason}` : "."}`
        : "Draft — only you and reviewers can see this course. It goes live in the directory once it's approved."}
    </div>
  );
}
