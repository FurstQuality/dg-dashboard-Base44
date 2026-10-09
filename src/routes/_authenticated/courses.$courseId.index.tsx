import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";

const Page = lazy(() => import("@/components/pages/course-detail-page"));

export const Route = createFileRoute("/_authenticated/courses/$courseId/")({
  head: () => ({
    meta: [
      { title: "Course · DG Dashboard" },
      {
        name: "description",
        content: "Course details, layouts, ratings, tee signs, and caddy guide.",
      },
      { property: "og:title", content: "Course on DG Dashboard" },
      { property: "og:description", content: "Layouts, tee signs, and caddy guide." },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This course" />,
  validateSearch: (s: Record<string, unknown>): { tab?: string; layout?: string } => ({
    tab: typeof s["tab"] === "string" ? s["tab"] : undefined,
    layout: typeof s["layout"] === "string" ? s["layout"] : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { courseId } = Route.useParams();
  const { tab, layout } = Route.useSearch();
  const navigate = useNavigate();
  // A course joined into another one opens the course it was joined into.
  useEffect(() => {
    let live = true;
    supabase
      .from("courses")
      .select("merged_into_course_id")
      .eq("id", courseId)
      .maybeSingle()
      .then(({ data }) => {
        const to = data?.merged_into_course_id;
        if (live && to && to !== courseId) {
          navigate({ to: "/courses/$courseId", params: { courseId: to }, replace: true });
        }
      });
    return () => {
      live = false;
    };
  }, [courseId, navigate]);
  return (
    <ClientOnly fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Page courseId={courseId} initialTab={tab} initialLayoutId={layout} />
      </Suspense>
    </ClientOnly>
  );
}
