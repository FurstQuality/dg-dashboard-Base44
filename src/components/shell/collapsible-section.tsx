import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Section heading — plain text, shown on the toggle row. */
  title: string;
  /** One-line explanation shown under the title. */
  description?: ReactNode;
  /** Compact count or status shown to the right of the title. */
  badge?: ReactNode;
  /** Anchor id so hash links can still target the section. */
  id?: string;
  /** Stable key used to remember open/closed state across visits. */
  storageKey?: string;
  /** Open on first visit (before any saved preference). */
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
};

const PREFIX = "dgd.section.";

function readStored(key: string | undefined, fallback: boolean): boolean {
  if (!key || typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(PREFIX + key);
  if (raw === "open") return true;
  if (raw === "closed") return false;
  return fallback;
}

/**
 * Canonical collapsible page section for director and event pages.
 *
 * Renders a header row that toggles its body, remembers the last state per
 * `storageKey`, and keeps the `id` anchor on the wrapper so existing hash
 * links (#schedule, #settings, …) still scroll to it.
 */
export function CollapsibleSection({
  title,
  description,
  badge,
  id,
  storageKey,
  defaultOpen = true,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(readStored(storageKey, defaultOpen));
  }, [storageKey, defaultOpen]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(PREFIX + storageKey, next ? "open" : "closed");
    }
  }

  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card/60",
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-semibold">{title}</span>
            {badge ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </span>
          {description ? (
            <span className="mt-1 block text-[13px] text-muted-foreground">{description}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : "",
          )}
        />
      </button>
      {open ? <div className="space-y-4 border-t border-border px-4 py-4">{children}</div> : null}
    </section>
  );
}
