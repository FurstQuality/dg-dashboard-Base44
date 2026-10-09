import { createFileRoute, Outlet, Link, notFound } from "@tanstack/react-router";
import { Flag } from "lucide-react";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { resolveJoinCode } from "@/lib/guest-scoring.functions";

export const Route = createFileRoute("/score/$code")({
  loader: async ({ params }) => {
    try {
      return await resolveJoinCode({ data: { code: params.code } });
    } catch {
      // An unknown, retired, or mistyped code is a missing page, not a crash.
      throw notFound();
    }
  },

  head: ({ loaderData, params }) => {
    const name = loaderData?.event_name ?? `Event ${params.code}`;
    const description = `Keep score for ${name} in your browser with code ${params.code} — no account needed.`;
    return {
      meta: [
        { title: `${name} — live scoring · DG Dashboard` },
        { name: "description", content: description },
        { property: "og:title", content: `${name} — score with code ${params.code}` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "robots", content: "noindex" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This event code" />,
  component: GuestScoreLayout,
});

function GuestScoreLayout() {
  const info = Route.useLoaderData();
  if (!info) return null;
  const params = Route.useParams();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{info.event_name}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {[info.round_label, info.course_name, info.layout_name].filter(Boolean).join(" · ") ||
                "Guest scoring"}
            </p>
          </div>
          <Link
            to="/score/$code"
            params={{ code: params.code }}
            className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground"
          >
            <Flag className="h-3.5 w-3.5" />
            {info.code}
          </Link>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
