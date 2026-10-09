import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Round Companion scoring shell.
 *
 * Three zones:
 *   - <header>  RoundHeader (compact, sticky, safe-area)
 *   - <main>    Center stage (hole visual + score dial + player strip + hole nav)
 *   - <aside>   Context panel (desktop sidebar / mobile bottom sheet)
 *
 * Layout responsibilities live here; the parent route owns state and writes.
 */

export function ScoringShell({
  header,
  main,
  aside,
  footer,
  outdoor,
}: {
  header: React.ReactNode;
  main: React.ReactNode;
  /** Desktop sidebar content. Mobile renders `aside` via a sheet from the header. */
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  outdoor?: boolean;
}) {
  return (
    <div
      data-outdoor={outdoor ? "true" : undefined}
      className={cn(
        // z-40 sits above the app shell but below Radix Dialog/AlertDialog
        // portals (z-50). A higher z-index here made the shell intercept
        // clicks on the End Round dialog buttons — the "freeze" bug.
        "fixed inset-0 z-40 flex flex-col overflow-hidden bg-background text-foreground",
        "min-h-dvh h-dvh w-dvw",
        // Outdoor mode: solid surfaces, stronger contrast
        "data-[outdoor=true]:bg-neutral-950 data-[outdoor=true]:text-white",
      )}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="shrink-0">{header}</div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <main className="relative flex min-h-0 flex-col overflow-hidden">{main}</main>
        {aside ? (
          <aside className="hidden min-h-0 border-l border-border bg-card/40 lg:flex lg:flex-col lg:overflow-hidden">
            {aside}
          </aside>
        ) : null}
      </div>

      {footer ? (
        <div
          className="shrink-0 border-t border-border bg-card/70"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
