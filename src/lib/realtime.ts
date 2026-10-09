/**
 * Realtime channel helpers.
 *
 * Supabase returns the *existing* channel when you reuse a channel name, and
 * attaching listeners to an already-subscribed channel throws. React mounts
 * effects twice in development, so every subscription needs a unique name.
 */
export function channelNonce(): string {
  return Math.random().toString(36).slice(2, 10);
}
