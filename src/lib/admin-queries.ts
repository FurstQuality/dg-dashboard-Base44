/**
 * Shared row bounds for admin queues and registries.
 *
 * Admin surfaces render moderation/review queues that grow over time. Every
 * admin list read must be bounded so a large backlog cannot pull an unbounded
 * result set into the browser. Queues that can exceed these bounds are worked
 * oldest-first, so the visible page is always the actionable one.
 */
export const ADMIN_LIMITS = {
  /** Pending course rating profiles awaiting review (oldest first). */
  courseRatingQueue: 200,
  /** Creator Studio applications, newest first. */
  creatorApplications: 200,
  /** Field registry entries for a single entity type. */
  fieldRegistry: 500,
} as const;
