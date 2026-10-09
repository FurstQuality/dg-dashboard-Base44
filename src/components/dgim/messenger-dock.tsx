import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, MessageCircle, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessengerPanel } from "@/components/dgim/messenger-panel";
import { useCommunityBadges } from "@/components/community/use-community-badges";
import {
  closeMessenger,
  minimizeMessenger,
  openMessenger,
  toggleMessenger,
  useMessengerWindow,
} from "@/lib/messenger-window";

/** Saved window geometry so the messenger reopens where the user left it. */
type DockGeometry = { x: number; y: number; w: number; h: number };

const GEOMETRY_KEY = "dgd:dgim:dock-geometry:v1";
const MIN_W = 320;
const MIN_H = 360;

function clampGeometry(g: DockGeometry): DockGeometry {
  const maxW = Math.max(MIN_W, window.innerWidth - 16);
  const maxH = Math.max(MIN_H, window.innerHeight - 16);
  const w = Math.min(Math.max(g.w, MIN_W), maxW);
  const h = Math.min(Math.max(g.h, MIN_H), maxH);
  return {
    w,
    h,
    x: Math.min(Math.max(g.x, 8), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(g.y, 8), Math.max(8, window.innerHeight - h - 8)),
  };
}

function defaultGeometry(): DockGeometry {
  const w = Math.min(380, window.innerWidth - 32);
  const h = Math.min(560, window.innerHeight - 32);
  return clampGeometry({ w, h, x: window.innerWidth - w - 80, y: window.innerHeight - h - 16 });
}

function readGeometry(): DockGeometry {
  try {
    const raw = localStorage.getItem(GEOMETRY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DockGeometry>;
      if (
        typeof parsed.x === "number" &&
        typeof parsed.y === "number" &&
        typeof parsed.w === "number" &&
        typeof parsed.h === "number"
      ) {
        return clampGeometry(parsed as DockGeometry);
      }
    }
  } catch {
    // Private browsing or blocked storage: fall back to the default corner.
  }
  return defaultGeometry();
}


/**
 * Docked messenger for the main app.
 *
 * A chat bubble sits in the corner and opens DGIM as a popup window instead of
 * a full page. Any link that points at /dgim inside the app opens the popup
 * too; the standalone messenger app stays available at /dgim in its own window,
 * the same split Facebook and Messenger use.
 */
export function MessengerDock() {
  const { open, minimized, conv } = useMessengerWindow();
  const navigate = useNavigate();
  const { unreadMessages } = useCommunityBadges();

  // In-app links to /dgim open the popup; opening in a new tab/window still
  // loads the standalone messenger app.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank") return;
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (url.pathname !== "/dgim" && url.pathname !== "/messages") return;
      event.preventDefault();
      openMessenger(url.searchParams.get("conv"));
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const showWindow = open && !minimized;

  const [geometry, setGeometry] = useState<DockGeometry | null>(null);
  const dragRef = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origin: DockGeometry;
  } | null>(null);

  // Geometry is read on first open so server rendering never touches window.
  useEffect(() => {
    if (showWindow && !geometry) setGeometry(readGeometry());
  }, [showWindow, geometry]);

  // Keep the window on screen when the viewport changes.
  useEffect(() => {
    if (!showWindow) return;
    function onResize() {
      setGeometry((g) => (g ? clampGeometry(g) : g));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [showWindow]);

  const beginDrag = useCallback(
    (mode: "move" | "resize", event: React.PointerEvent) => {
      if (event.button !== 0) return;
      const origin = geometry ?? readGeometry();
      dragRef.current = { mode, startX: event.clientX, startY: event.clientY, origin };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    },
    [geometry],
  );

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const next =
      drag.mode === "move"
        ? { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy }
        : { ...drag.origin, w: drag.origin.w + dx, h: drag.origin.h + dy };
    setGeometry(clampGeometry(next));
  }, []);

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setGeometry((g) => {
      if (g) {
        try {
          localStorage.setItem(GEOMETRY_KEY, JSON.stringify(g));
        } catch {
          // Storage unavailable: the window still moves for this session.
        }
      }
      return g;
    });
  }, []);

  return (
    <>
      {showWindow && geometry && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          style={{
            left: geometry.x,
            top: geometry.y,
            width: geometry.w,
            height: geometry.h,
          }}
          onPointerDown={(event) => {
            // The panel's title bar doubles as the window's move handle.
            const target = event.target as HTMLElement | null;
            if (target?.closest("button, a, input, textarea, select")) return;
            if (target?.closest("[data-dgim-drag-handle]")) beginDrag("move", event);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >

          <MessengerPanel
            layout="popup"
            initialConv={conv}
            onClose={closeMessenger}
            headerActions={
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    closeMessenger();
                    navigate({ to: "/dgim", search: conv ? { conv } : {} });
                  }}
                  aria-label="Open the full messenger app"
                  title="Open the full messenger app"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={minimizeMessenger}
                  aria-label="Minimize messenger"
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </>
            }
          />
          {/* Bottom-right grip resizes the window. */}
          <div
            role="separator"
            aria-label="Resize messenger window"
            title="Drag to resize"
            onPointerDown={(event) => beginDrag("resize", event)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-tl-md bg-border/70 hover:bg-border"
          />
        </div>

      )}

      <button
        type="button"
        onClick={() => toggleMessenger()}
        aria-label={showWindow ? "Minimize messenger" : "Open messenger"}
        className="fixed bottom-4 right-4 z-50 hidden h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:brightness-110 sm:flex"
      >
        <MessageCircle className="h-5 w-5" />
        {unreadMessages > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-destructive px-1 text-[11px] font-semibold leading-5 text-destructive-foreground">
            {unreadMessages > 99 ? "99+" : unreadMessages}
          </span>
        )}
      </button>
    </>
  );
}
