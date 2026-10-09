/**
 * The course explorer now lives inside Analysis & prep — players explore
 * courses in order to analyse them and prepare to play them, so both live on
 * one page. This route keeps old links and bookmarks working.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const explorerSearchSchema = z.object({
  q: z.coerce.string().catch("").default(""),
  state: z.coerce.string().catch("all").default("all"),
  holes: z.coerce.string().catch("any").default("any"),
  minRating: z.coerce.string().catch("any").default("any"),
  water: z.coerce.string().catch("any").default("any"),
  foliage: z.coerce.string().catch("any").default("any"),
  terrain: z.coerce.string().catch("any").default("any"),
  sort: z.coerce.string().catch("rating").default("rating"),
});

export const Route = createFileRoute("/_authenticated/courses/explorer")({
  validateSearch: explorerSearchSchema,
  beforeLoad: () => {
    throw redirect({ to: "/courses" });
  },
});
