import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Messaging is consolidated into DGIM (Disc Golf Instant Messenger).
 * This legacy path stays as a permanent redirect so old links, bookmarks,
 * and notification deep links keep working, including the conversation param.
 */
export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: (s: Record<string, unknown>): { conv?: string } => ({
    conv: typeof s.conv === "string" ? s.conv : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/dgim", search: { conv: search.conv } });
  },
});
