/**
 * Admin section layout.
 *
 * Decides access once for the whole section — a short "checking access" state,
 * then either the tools or a single clear denial — and renders the shared
 * section navigation above every admin page. Server functions and RLS remain
 * the security boundary; this gate keeps people from landing on a tool they
 * cannot use.
 */
import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { ShieldAlert, Loader2, ArrowLeft } from "lucide-react";
import { PageShell, PageHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useAdminAccess } from "@/lib/admin-access";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { checking, isAdmin } = useAdminAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (checking) {
    return (
      <PageShell>
        <PageHeader title="Admin" description="Checking your access…" eyebrow="Admin" />
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          One moment while we confirm your admin access.
        </div>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell>
        <PageHeader
          title="Admin tools are restricted"
          description="These tools are only available to platform admins."
          eyebrow="Admin"
        />
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">You don't have admin access</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nothing is wrong with your account — this section is limited to the people who
                review courses, ratings, and billing. If you think you should be in that group, ask
                an admin to add you.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/home">Back to your feed</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/settings">Open settings</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <>
      <AdminSubnav />
      {pathname !== "/admin" ? (
        <div className="mx-auto w-full max-w-[1560px] px-5 pt-3 lg:px-8 2xl:max-w-[1840px] 2xl:px-10">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All admin tools
          </Link>
        </div>
      ) : null}
      <Outlet />
    </>
  );
}
