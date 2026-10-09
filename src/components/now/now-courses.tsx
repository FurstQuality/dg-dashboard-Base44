import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Star } from "lucide-react";
import { useSession } from "@/lib/current-user";
import { listTrackedCourses } from "@/lib/tracked-courses.functions";
import { scheduleQueryOptions } from "@/lib/entities";
import { NowStrip, NowTile, nowTileLinkClass } from "@/components/now/now-strip";
import { whenLabel } from "@/components/now/now-data";

/**
 * Courses, right now: the course you're playing next and the one you study
 * most, both opening straight into Course Analytics.
 */
export function NowCourses() {
  const { user } = useSession();
  const listCourses = useServerFn(listTrackedCourses);
  const { data: tracked } = useQuery({
    queryKey: ["tracked-courses", "now-strip"],
    queryFn: () => listCourses(),
    enabled: !!user,
    staleTime: 300_000,
  });
  const { data: schedule } = useQuery(scheduleQueryOptions(user?.id, { limit: 1 }));

  const saved = tracked?.courses?.[0] ?? null;
  const next = schedule?.[0] ?? null;

  return (
    <NowStrip
      items={[
        next ? (
          <Link key="next" to="/game-plan" className={nowTileLinkClass}>
            <NowTile
              icon={MapPin}
              eyebrow={`Playing ${whenLabel(next.starts_on).toLowerCase()}`}
              title={next.title}
              detail={
                [next.city, next.state].filter(Boolean).join(", ") ||
                next.location ||
                "Study this course"
              }
            />
          </Link>
        ) : null,
        saved ? (
          <Link key="saved" to="/game-plan" className={nowTileLinkClass}>
            <NowTile
              icon={Star}
              eyebrow="Saved course"
              title={saved.course_name}
              detail={saved.location ?? "Open its analytics"}
            />
          </Link>
        ) : null,
      ]}
    />
  );
}
