/** Save a course to the "Courses being tracked" list used by Course Analytics. */
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPinCheck, MapPinPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listTrackedCourses, trackCourse, untrackCourse } from "@/lib/tracked-courses.functions";
import { trackedCoursesKey } from "@/components/tracker/tracking-summary";

export function TrackCourseButton({
  courseId,
  courseName,
  location,
  size = "sm",
  variant = "outline",
}: {
  courseId?: string | null;
  courseName: string;
  location?: string | null;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "ghost";
}) {
  const listFn = useServerFn(listTrackedCourses);
  const trackFn = useServerFn(trackCourse);
  const untrackFn = useServerFn(untrackCourse);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: trackedCoursesKey,
    queryFn: () => listFn(),
    staleTime: 60_000,
  });

  const normalized = courseName.trim().toLowerCase();
  const existing = (data?.courses ?? []).find((c) =>
    courseId ? c.course_id === courseId : c.course_name.trim().toLowerCase() === normalized,
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (existing) return untrackFn({ data: { id: existing.id } });
      return trackFn({
        data: {
          course_id: courseId ?? null,
          course_name: courseName,
          location: location ?? null,
        },
      });
    },
    onSuccess: () => {
      toast.success(existing ? "Course removed from your tracker" : `Tracking ${courseName}`);
      void queryClient.invalidateQueries({ queryKey: trackedCoursesKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Button
      size={size}
      variant={existing ? "secondary" : variant}
      disabled={mutation.isPending || !courseName.trim()}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : existing ? (
        <MapPinCheck className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <MapPinPlus className="mr-1.5 h-3.5 w-3.5" />
      )}
      {existing ? "Tracking course" : "Track course"}
    </Button>
  );
}
