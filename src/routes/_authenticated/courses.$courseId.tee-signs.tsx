import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const TeeSignsPage = lazy(() => import("@/components/pages/tee-signs-page"));

export const Route = createFileRoute("/_authenticated/courses/$courseId/tee-signs")({
  head: () => ({
    meta: [
      { title: "Tee signs · DG Dashboard" },
      {
        name: "description",
        content:
          "Printable per-hole tee signs and caddy guide with satellite maps and OB markings.",
      },
      { property: "og:title", content: "Tee signs · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Printable per-hole tee signs and caddy guide with satellite maps and OB markings.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { layout?: string; event?: string } => ({
    layout: typeof s["layout"] === "string" ? s["layout"] : undefined,
    event: typeof s["event"] === "string" ? s["event"] : undefined,
  }),
  component: TeeSignsRoute,
});

function TeeSignsRoute() {
  const { courseId } = Route.useParams();
  const { layout, event } = Route.useSearch();
  return (
    <ClientOnly fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <TeeSignsPage courseId={courseId} initialLayoutId={layout} overlayId={event} />
      </Suspense>
    </ClientOnly>
  );
}
