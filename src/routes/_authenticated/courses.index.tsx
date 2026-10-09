import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { z } from "zod";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";

const Page = lazy(() => import("@/components/pages/courses-index-page"));

/** Directory filters live in the URL so views are shareable and the course
 *  explorer can hand its filters back and forth with the directory. */
const directorySearchSchema = z.object({
  q: z.coerce.string().catch("").default(""),
  state: z.coerce.string().catch("all").default("all"),
  holes: z.coerce.string().catch("any").default("any"),
  scoring: z.coerce.string().catch("any").default("any"),
  minRating: z.coerce.string().catch("any").default("any"),
  difficulty: z.coerce.string().catch("any").default("any"),
  // Distance filter in miles, or "any" for no distance limit.
  radius: z.coerce.string().catch("").default(""),

  sort: z.coerce.string().catch("name").default("name"),
  view: z.coerce.string().catch("grid").default("grid"),
  // "1" asks the directory to open zoomed to the player's own area — used by
  // the Start a round flow, which begins at course selection.
  // "1" opens the directory map straight into Add course mode.
  add: z.coerce.string().catch("").default(""),
  locate: z.coerce.string().catch("").default(""),
  // Course id to open in Course Studio on top of the directory map.
  studio: z.coerce.string().catch("").default(""),
});

export const Route = createFileRoute("/_authenticated/courses/")({
  validateSearch: directorySearchSchema,
  head: () => ({
    meta: [
      { title: "Courses · DG Dashboard" },
      {
        name: "description",
        content: "Find, review, and build disc golf courses on DG Dashboard.",
      },
      { property: "og:title", content: "Courses · DG Dashboard" },
      { property: "og:description", content: "Find and build disc golf courses." },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="Course directory" />,
  component: () => (
    // The directory itself needs the browser (map, saved filters, location), so
    // the server renders a real titled shell instead of a blank skeleton.
    <ClientOnly fallback={<CoursesShell />}>
      <Suspense fallback={<CoursesShell />}>
        <Page />
      </Suspense>
    </ClientOnly>
  ),
});

function CoursesShell() {
  return (
    <PageShell>
      <PageHeader
        title="Courses"
        description="Find, review, and build disc golf courses near you."
      />
      <Skeleton className="h-96 w-full rounded-xl" />
    </PageShell>
  );
}
