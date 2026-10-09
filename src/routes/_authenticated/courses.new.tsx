/** Courses are added from the directory map now; this keeps old links working. */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/courses/new")({
  beforeLoad: () => {
    throw redirect({ to: "/courses", search: { add: "1" } as never });
  },
});
