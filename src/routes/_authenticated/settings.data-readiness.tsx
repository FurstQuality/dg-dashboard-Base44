import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  event: z.string().optional(),
});

// Canonical surface: Data & Sync hub overview.
export const Route = createFileRoute("/_authenticated/settings/data-readiness")({
  validateSearch: (raw) => searchSchema.parse(raw),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/settings/imports",
      search: { tab: "overview" as const, event: search.event },
    });
  },
});
