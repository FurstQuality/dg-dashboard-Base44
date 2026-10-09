import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const CourseBuilder = lazy(() => import("@/components/pages/courses-new-page"));

export const Route = createFileRoute("/_authenticated/courses/$courseId/layouts")({
  validateSearch: (search: Record<string, unknown>): {layout?: string} => ({layout: typeof search.layout === "string" ? search.layout : undefined}),
  head: () => ({
    meta: [
      { title: "Layouts · DG Dashboard" },
      { name: "description", content: "Build, copy and compare course layouts that share the same tees and baskets." },
      { property: "og:title", content: "Layouts · DG Dashboard" },
      { property: "og:description", content: "Build, copy and compare course layouts that share the same tees and baskets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LayoutsRoute,
});

function LayoutsRoute() {
  const { courseId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { layout } = Route.useSearch();
  return (
    <ClientOnly fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <CourseBuilder onLayoutChange={id => {void navigate({search: previous => ({...previous, layout: id}), replace: true});}} key={courseId} courseId={courseId} layoutIdProp={layout} initialLayoutsOpen={!layout} />
      </Suspense>
    </ClientOnly>
  );
}
