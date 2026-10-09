import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = { course_id: string; expected_holes: number | null; mapped_holes: number; map_state: string };

const LABEL: Record<string, string> = {
  verified: "Verified map",
  starter: "Community map · needs verification",
  partial: "Partly mapped",
  unmapped: "Not mapped yet",
};

/** How much of a course's tee pads and baskets are on the map. Counts only real coordinates — nothing estimated. */
export function CourseMapCoverageBadge({ courseId }: { courseId: string }) {
  const q = useQuery({
    queryKey: ["course-map-coverage", courseId],
    queryFn: async () => {
      const { data } = await supabase.rpc("course_map_coverage_rows", { _course_ids: [courseId] });
      return ((data ?? []) as Row[])[0] ?? null;
    },
    staleTime: 5 * 60_000,
  });
  const r = q.data;
  if (!r) return null;
  const count = r.mapped_holes > 0 ? (r.expected_holes ? `${Math.min(r.mapped_holes, r.expected_holes)}/${r.expected_holes} holes mapped` : `${r.mapped_holes} holes mapped`) : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <MapIcon className="h-4 w-4 text-primary" aria-hidden />
      <span className="font-medium">{LABEL[r.map_state] ?? "Map"}</span>
      {count ? <span className="text-muted-foreground">{count}</span> : <span className="text-muted-foreground">Walk it with Course Studio to add tee pads and baskets.</span>}
    </div>
  );
}
