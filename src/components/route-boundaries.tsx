import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared route-level error boundary. Attach via `errorComponent` on
 * `createFileRoute` so a loader/render failure on one page doesn't kick the
 * user all the way to the root error boundary (which loses navigation
 * context — bad UX for mid-round scoring, tournament pages, etc.).
 */
export function RouteErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <h1 className="text-xl font-semibold">We couldn't load this page</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your saved data is still safe. Give it another shot, or head home and come back.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link to="/home">
            <Home className="mr-2 h-4 w-4" />
            Go home
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Shared route-level not-found boundary. Attach via `notFoundComponent` so a
 * bad slug/id shows a scoped "not found" instead of a blank page.
 */
export function RouteNotFound({ label = "This page" }: { label?: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-5xl">🥏</div>
      <div>
        <h1 className="text-xl font-semibold">{label} was not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been removed, renamed, or the link is out of date.
        </p>
      </div>
      <Button asChild>
        <Link to="/home">
          <Home className="mr-2 h-4 w-4" />
          Back to home
        </Link>
      </Button>
    </div>
  );
}
