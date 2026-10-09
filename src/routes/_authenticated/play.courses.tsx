import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old Play tab. Carries any search term straight into the course directory. */
export const Route = createFileRoute("/_authenticated/play/courses")({
  beforeLoad: ({ search }) => {
    const q = typeof (search as { q?: unknown })?.q === "string" ? (search as { q: string }).q : "";
    throw redirect({ to: "/courses", search: q ? { q } : {} });
  },
});
