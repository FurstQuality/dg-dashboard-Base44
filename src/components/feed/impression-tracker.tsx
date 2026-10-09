import { useEffect, useRef } from "react";
import { recordImpressions } from "@/lib/feed";

/**
 * Counts a post as viewed once it has been at least half visible for a moment.
 * Views are batched so a fast scroll makes one request, not twenty.
 */
export function ImpressionTracker({
  postId,
  children,
}: {
  postId: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const counted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || counted.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          if (timer) return;
          timer = setTimeout(() => {
            if (counted.current) return;
            counted.current = true;
            queueImpression(postId);
            io.disconnect();
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      io.disconnect();
    };
  }, [postId]);

  return <div ref={ref}>{children}</div>;
}

let pending: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function queueImpression(postId: string) {
  pending.push(postId);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    const batch = pending;
    pending = [];
    flushTimer = null;
    void recordImpressions(batch);
  }, 1500);
}
