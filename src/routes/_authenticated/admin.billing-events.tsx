import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AdminErrorState,
  AdminPanelSkeleton,
  AdminEmptyState,
} from "@/components/admin/admin-states";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/billing-events")({
  component: AdminBillingEvents,
  head: () => ({
    meta: [
      { title: "Billing events · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Every Stripe and in-app purchase webhook this project has received.",
      },
      { property: "og:title", content: "Billing events · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Every Stripe and in-app purchase webhook this project has received.",
      },
    ],
  }),
});

function AdminBillingEvents() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();
  const [q, setQ] = useState("");

  const events = useQuery({
    queryKey: ["admin", "billing-events", q],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      let query = supabase
        .from("billing_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (q) query = query.ilike("event_type", `%${q}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

  if (loading) return null;
  if (!user || !isAdmin)
    return (
      <PageShell>
        <PageHeader title="Admin only" description="Super admin access required." />
      </PageShell>
    );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin"
        title="Billing events"
        description="Every Stripe / IAP webhook this project has received, newest first."
      />

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-sm"
            placeholder="Filter by event type (e.g. invoice.payment_failed)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Filter billing events by event type"
          />
          {q ? (
            <Button variant="ghost" size="sm" onClick={() => setQ("")}>
              Clear filter
            </Button>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">
            Showing the 200 most recent events
          </span>
        </div>
        {events.isError ? (
          <AdminErrorState
            className="mt-3"
            title="We couldn't load billing events"
            message="The webhook log didn't come back. Try again in a moment."
            onRetry={() => void events.refetch()}
            retrying={events.isFetching}
          />
        ) : events.isPending ? (
          <AdminPanelSkeleton className="mt-3" rows={5} />
        ) : !events.data?.length ? (
          <AdminEmptyState
            className="mt-3"
            title={q ? "No events match that filter" : "No billing events yet"}
            message={
              q
                ? "Nothing in the last 200 events matches what you typed. Clear the filter to see everything."
                : "Payment and in-app purchase webhooks will appear here as soon as the first one arrives."
            }
            action={
              q ? (
                <Button size="sm" variant="outline" onClick={() => setQ("")}>
                  Clear filter
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-2 text-left">When</th>
                  <th className="px-2 py-2 text-left">Provider</th>
                  <th className="px-2 py-2 text-left">Event</th>
                  <th className="px-2 py-2 text-left">User</th>
                  <th className="px-2 py-2 text-left">Result</th>
                </tr>
              </thead>
              <tbody>
                {events.data.map((e) => (
                  <tr key={e.id} className="border-b align-top last:border-b-0">
                    <td className="px-2 py-2 text-xs tabular-nums text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-2 py-2">{e.provider}</td>
                    <td className="px-2 py-2 font-mono text-xs">{e.event_type}</td>
                    <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">
                      {e.user_id ?? "—"}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs",
                          e.processed_ok
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-destructive/15 text-destructive",
                        )}
                      >
                        {e.processed_ok ? "ok" : "error"}
                      </span>
                      {e.error_message ? (
                        <div className="mt-1 text-[11px] text-destructive">{e.error_message}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
