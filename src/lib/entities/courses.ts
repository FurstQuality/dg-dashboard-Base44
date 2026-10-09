import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CourseRecord = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  hole_count: number | null;
  is_ghost: boolean | null;
};

/** Canonical read for a course record. */
export function courseQueryOptions(id: string | null | undefined) {
  return queryOptions({
    queryKey: ["course", id],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CourseRecord | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, city, state, latitude, longitude, hole_count, is_ghost")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as CourseRecord | null) ?? null;
    },
  });
}
