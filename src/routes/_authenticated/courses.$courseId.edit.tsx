import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";

const CourseBuilder = lazy(() => import("@/components/pages/courses-new-page"));

const searchSchema = z.object({
  layout: z.string().optional(),
  overlay: z.string().optional(),
  hole: z.coerce.number().int().min(1).max(200).optional(),
});

export const Route = createFileRoute("/_authenticated/courses/$courseId/edit")({
  validateSearch: (search) => searchSchema.parse(search),
  component: CourseEdit,
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This course" />,
  head: () => ({
    meta: [
      { title: "Edit course · DG Dashboard" },
      { name: "description", content: "Edit an existing disc golf course." },
      { property: "og:title", content: "Edit course · DG Dashboard" },
      { property: "og:description", content: "Course builder." },
    ],
  }),
});

function CourseEdit() {
  const { courseId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { layout, overlay, hole } = Route.useSearch();
  return (
    <ClientOnly fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <CourseBuilder onLayoutChange={id => {void navigate({search: previous => ({...previous, layout: id}), replace: true});}} courseId={courseId} layoutIdProp={layout} overlayId={overlay} initialHole={hole} key={`${courseId}-${overlay ?? ""}`} />
      </Suspense>
    </ClientOnly>
  );
}
