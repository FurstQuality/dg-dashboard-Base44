import { createFileRoute } from "@tanstack/react-router";
import { OverlayLab } from "@/components/studio/overlay-lab";
import { RouteErrorBoundary } from "@/components/route-boundaries";

export const Route = createFileRoute("/_authenticated/studio/overlays")({
  component: OverlayLabPage,
  errorComponent: RouteErrorBoundary,
  head: () => ({
    meta: [
      { title: "Overlay Lab · Creator Studio · DG Dashboard" },
      {
        name: "description",
        content:
          "Build reusable sponsor and contact overlays for your disc golf photos and videos, then export them as PNG frames.",
      },
      { property: "og:title", content: "Overlay Lab · Creator Studio · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Design a branded frame once and add sponsors, handles, and booking details to every post in seconds.",
      },
    ],
  }),
});

function OverlayLabPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Overlay Lab</h2>
        <p className="text-sm text-muted-foreground">
          Build a branded frame once, then drop it on any photo or video still to credit your
          sponsors and share how people reach you.
        </p>
      </div>
      <OverlayLab />
    </div>
  );
}
