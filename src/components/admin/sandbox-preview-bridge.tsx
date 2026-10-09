import { useEffect } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { appOrigin, previewRoutePath } from "@/lib/app-sandbox";

/** Mounted at the app root: every screen and navigation remains inside the running draft. */
export function SandboxPreviewBridge() {
  const router = useRouter();
  const path = useRouterState({
    select: (state) => state.location.pathname + state.location.searchStr,
  });
  const sandbox = import.meta.env.VITE_DGD_ENVIRONMENT === "sandbox";
  useEffect(() => {
    if (!sandbox || window.parent === window) return;
    const parentOrigin = appOrigin(import.meta.env.VITE_DGD_STUDIO_ORIGIN);
    if (!parentOrigin) return;
    const report = () => {
      try {
        window.parent.postMessage(
          { type: "dgd:preview:location", path: previewRoutePath(path), environment: "sandbox" },
          parentOrigin,
        );
      } catch {
        /* Never relay a nested studio URL or credentials. */
      }
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== parentOrigin) return;
      if (event.data?.type === "dgd:preview:ping") report();
      if (event.data?.type === "dgd:preview:navigate" && typeof event.data.path === "string") {
        try {
          void router.navigate({ to: previewRoutePath(event.data.path) });
        } catch {
          /* Reject external navigation. */
        }
      }
      if (event.data?.type === "dgd:preview:back") router.history.back();
      if (event.data?.type === "dgd:preview:forward") router.history.forward();
    };
    report();
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [sandbox, path, router]);
  if (!sandbox) return null;
  const studioOrigin = appOrigin(import.meta.env.VITE_DGD_STUDIO_ORIGIN);
  return (
    <a
      href={`${studioOrigin ?? ""}/admin/sandbox`}
      target="_blank"
      rel="noopener noreferrer"
      title="Open app studio in a new tab"
      className="fixed bottom-2 right-2 z-[100] rounded-full border border-amber-500/40 bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-100 shadow"
    >
      Draft app · unpublished
    </a>
  );
}
