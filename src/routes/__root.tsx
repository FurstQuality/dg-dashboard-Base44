import { SIGN_FONTS_HREF } from "@/lib/tee-sign-design";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme-context";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { openExternal } from "@/lib/open-external";

import { Mascot } from "@/components/mascot";
import { SandboxPreviewBridge } from "@/components/admin/sandbox-preview-bridge";
import { PlatformScripts } from "@/components/platform-scripts";

function NotFoundComponent() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="flex justify-center">
          <Mascot
            name="scramble-fox"
            size={120}
            className="drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]"
          />
        </div>
        <h1 className="mt-2 font-display text-6xl font-extrabold tracking-tight text-primary">
          404
        </h1>
        <h2 className="mt-2 text-xl font-semibold">Off the fairway</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That page doesn't exist. Grab a mid-range and head back home.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try again or head home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "google-site-verification",
        content: "HZFh9Y3u_31-Q2e8Aqp-VatWbW4UgW7txAWy34NUwok",
      },
      { name: "author", content: "DG Dashboard" },
      { property: "og:site_name", content: "DG Dashboard" },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#0E1E1A" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "DG Dashboard" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },

      // Tee sign lettering sets (printed sign artwork).
      { rel: "stylesheet", href: SIGN_FONTS_HREF },
      {
        rel: "stylesheet",
        href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Runs before React hydrates so the theme is painted correctly on first frame.
const PERSONALIZATION_BOOTSTRAP = `(function(){try{
  var raw = localStorage.getItem('cl_theme_v2') || localStorage.getItem('cl_theme_v1');
  if(!raw) return;
  var s = JSON.parse(raw);
  var root = document.documentElement;
  var appearance = s.appearance || s.mode || 'dark';
  var resolved = appearance === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : appearance;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved !== 'dark');
  root.dataset.appearance = resolved;
  root.dataset.appearancePref = appearance;
  if (s.density) root.dataset.density = s.density;
  if (s.radiusScale) root.dataset.radiusScale = s.radiusScale;
  if (s.mascotIntensity) root.dataset.mascots = s.mascotIntensity;
  if (s.backgroundIntensity) root.dataset.backgrounds = s.backgroundIntensity;
  if (s.navigationPreference) root.dataset.navigation = s.navigationPreference;
  if (s.accentPalette) root.dataset.accentPalette = s.accentPalette;
  if (s.surfaceStyle) root.dataset.surfaceStyle = s.surfaceStyle;
  if (s.visualIntensity) root.dataset.visualIntensity = s.visualIntensity;
  if (s.highContrast) root.dataset.highContrast = 'true';
  if (s.reducedMotion || s.motionPreference === 'reduced') root.dataset.reducedMotion = 'true';
  var scale = typeof s.textScale === 'number' ? s.textScale : 1;
  root.style.setProperty('--text-scale', String(scale));
  if (s.palette && s.palette.bg) {
    root.style.setProperty('--background', s.palette.bg);
    /* Paint the canvas on <html>; <body> stays transparent so the branded
       backdrop layer (z-index:-10) remains visible behind page content. */
    root.style.backgroundColor = s.palette.bg;
    document.body && (document.body.style.backgroundColor = 'transparent');
  }
  if (s.palette && s.palette.accent) root.style.setProperty('--primary', s.palette.accent);
}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Search Console ownership proof for the custom domain (the merged
            head above carries the token for the lovable.app property). */}
        <meta
          name="google-site-verification"
          content="cpOYMdLkb0d7e-961TXwxjmL9m-rVh02ivvrlRUrAXA"
        />
        <script dangerouslySetInnerHTML={{ __html: PERSONALIZATION_BOOTSTRAP }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <PlatformScripts />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    // Register the service worker once per session for push + offline scoring.
    if (import.meta.env.VITE_DGD_ENVIRONMENT !== "sandbox" && typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    // A new deploy replaces hashed route chunks, so a tab left open on the old
    // build fails to lazy-load a page ("Failed to fetch dynamically imported
    // module"). Reload once to pick up the current build instead of showing an
    // error screen.
    // An installed home-screen app keeps its shell around for weeks, so this is
    // the common case there: tapping a page (Settings, for example) tries to
    // load a chunk that the current deploy no longer has, and nothing happens.
    // Recover by dropping caches and reloading from the network — throttled by
    // time rather than once per session, so a later tap can recover too.
    const RELOAD_KEY = "dgd:chunk-reload-at";
    const RELOAD_COOLDOWN_MS = 30_000;
    const isChunkLoadFailure = (message?: string) =>
      !!message &&
      (message.includes("Failed to fetch dynamically imported module") ||
        message.includes("error loading dynamically imported module") ||
        message.includes("Importing a module script failed") ||
        message.includes("Unable to preload CSS") ||
        message.includes("dynamically imported module"));
    const hardReload = () => {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        return;
      }
      const reload = () => window.location.reload();
      // Clear anything the browser cached for this origin before reloading;
      // otherwise the stale shell can come straight back in standalone mode.
      if (typeof caches !== "undefined" && caches.keys) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => {})
          .finally(reload);
      } else {
        reload();
      }
    };
    const recoverFromStaleBuild = (message?: string) => {
      if (!isChunkLoadFailure(message)) return;
      hardReload();
    };
    const onChunkError = (e: ErrorEvent) => recoverFromStaleBuild(e.message);
    const onChunkRejection = (e: PromiseRejectionEvent) =>
      recoverFromStaleBuild(
        typeof e.reason === "string" ? e.reason : (e.reason as Error | undefined)?.message,
      );
    // Vite fires this when a lazy route's chunk can't be fetched — the exact
    // signal for "this build is gone", and it never surfaces as window.error.
    const onPreloadError = (e: Event) => {
      e.preventDefault();
      hardReload();
    };
    window.addEventListener("error", onChunkError);
    window.addEventListener("unhandledrejection", onChunkRejection);
    window.addEventListener("vite:preloadError", onPreloadError as EventListener);

    // Finer wheel scroll increments — softer, more precise page scrolling.

    const SCROLL_FACTOR = 0.35;
    const onWheel = (e: WheelEvent) => {
      // Skip pinch-zoom, modifier gestures, and non-pixel deltas we don't want to fight
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Only handle when the wheel targets the document scroll (not a nested scroller)
      let el = e.target as HTMLElement | null;
      while (el && el !== document.body && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        const oy = cs.overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return;
        el = el.parentElement;
      }
      if (e.deltaMode !== 0) return; // let line/page-mode go native
      e.preventDefault();
      window.scrollBy({
        top: e.deltaY * SCROLL_FACTOR,
        left: e.deltaX * SCROLL_FACTOR,
        behavior: "auto",
      });
    };
    window.addEventListener("wheel", onWheel, { passive: false });

    // Any link that leaves the app opens in exactly one separate browser tab. Inside the
    // installed app there is no address bar or back chrome, so an outside site
    // loaded in place traps the user with no way back.
    const onDocClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let dest: URL;
      try {
        dest = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (dest.protocol !== "http:" && dest.protocol !== "https:") return; // mailto:, sms:, tel:
      if (dest.origin === window.location.origin) return; // in-app navigation
      e.preventDefault();
      e.stopPropagation();
      openExternal(dest.href);
    };
    document.addEventListener("click", onDocClick, true);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("click", onDocClick, true);
      window.removeEventListener("error", onChunkError);
      window.removeEventListener("unhandledrejection", onChunkRejection);
      window.removeEventListener("vite:preloadError", onPreloadError as EventListener);
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SandboxPreviewBridge />
        <Outlet />
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
