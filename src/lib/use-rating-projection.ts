import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRatingProjection } from "./rating-projection.functions";

/**
 * Hook: fetches the full window-simulation PDGA rating projection.
 * Safe to call from any authenticated component; cached for 5 minutes.
 */
export function useRatingProjection() {
  const fn = useServerFn(getRatingProjection);
  return useQuery({
    queryKey: ["rating-projection", "me"],
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });
}
