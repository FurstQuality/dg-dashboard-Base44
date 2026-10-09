import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const CourseBuilder = lazy(() => import("@/components/pages/courses-new-page"));

export const Route = createFileRoute("/_authenticated/courses/$courseId/studio")({
  validateSearch: (search: Record<string, unknown>): {layout?: string} => ({layout: typeof search.layout === "string" ? search.layout : undefined}),
  head: () => ({
    meta: [
      { title: "Course Studio · DG Dashboard" },
      { name: "description", content: "Build and edit course maps, tees, baskets, fairways and layouts in one map editor." },
      { property: "og:title", content: "Course Studio · DG Dashboard" },
      { property: "og:description", content: "Build and edit course maps, tees, baskets, fairways and layouts in one map editor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioRoute,
});

function StudioRoute() {
  const { courseId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { layout } = Route.useSearch();
  return (
    <ClientOnly fallback={<Skeleton className="h-72 w-full rounded-2xl" />}>
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-2xl" />}>
        <CourseBuilder onLayoutChange={id => {void navigate({search: previous => ({...previous, layout: id}), replace: true});}} key={courseId} courseId={courseId} layoutIdProp={layout} />
      </Suspense>
    </ClientOnly>
  );
}
