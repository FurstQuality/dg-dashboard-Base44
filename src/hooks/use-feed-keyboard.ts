import { useEffect, type RefObject } from "react";

/** True when the event target is a field where typing should win over shortcuts. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true ||
    el.closest("[contenteditable='true']") !== null
  );
}

/**
 * J/K move focus between feed posts, R reacts to the focused post and C opens
 * its comments. Posts opt in with `data-feed-post` and `tabIndex={-1}`.
 */
export function useFeedKeyboardNav(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (!["j", "k", "r", "c"].includes(key)) return;

      const container = containerRef.current;
      if (!container) return;
      const cards = Array.from(
        container.querySelectorAll<HTMLElement>("[data-feed-post]"),
      );
      if (cards.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const currentCard = active?.closest<HTMLElement>("[data-feed-post]") ?? null;
      const currentIndex = currentCard ? cards.indexOf(currentCard) : -1;

      if (key === "j" || key === "k") {
        event.preventDefault();
        const next =
          key === "j"
            ? Math.min(currentIndex + 1, cards.length - 1)
            : Math.max(currentIndex <= 0 ? 0 : currentIndex - 1, 0);
        const target = cards[currentIndex === -1 ? 0 : next];
        target?.focus();
        target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
      }

      if (!currentCard) return;
      event.preventDefault();
      const selector = key === "r" ? "[data-feed-react]" : "[data-feed-comments]";
      currentCard.querySelector<HTMLElement>(selector)?.click();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [containerRef]);
}
