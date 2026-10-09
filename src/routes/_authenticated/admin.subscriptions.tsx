import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Gift, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { matchesOmnisearch } from "@/lib/omnisearch";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import { grantOverride, revokeOverrides } from "@/lib/billing.functions";
import {
  AdminErrorState,
  AdminPanelSkeleton,
  AdminEmptyState,
} from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  component: AdminSubs,
  head: () => ({
    meta: [
      { title: "Subscriptions · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Search subscribers, review plans, and grant comp entitlements.",
      },
      { property: "og:title", content: "Subscriptions · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Search subscribers, review plans, and grant comp entitlements.",
      },
    ],
  }),
});

function AdminSubs() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const grantFn = useServerFn(grantOverride);
  const revokeFn = useServerFn(revokeOverrides);

  const subs = useQuery({
    queryKey: ["admin", "subscriptions", search],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data: subRows } = await supabase
        .from("subscriptions")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);
      const { data: overrides } = await supabase
        .from("entitlement_overrides")
        .select("*")
        .order("created_at", { ascending: false });
      const userIds = Array.from(
        new Set([
          ...(subRows ?? []).map((r) => r.user_id),
          ...(overrides ?? []).map((r) => r.user_id),
        ]),
      );
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, pdga_number")
        .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const rows = (subRows ?? []).map((s) => ({
        ...s,
        profile: profileMap.get(s.user_id),
      }));
      const overrideMap = new Map<string, any[]>();
      for (const o of overrides ?? []) {
        const arr = overrideMap.get(o.user_id) ?? [];
        arr.push(o);
        overrideMap.set(o.user_id, arr);
      }
      const orphanOverrides = (overrides ?? [])
        .filter((o) => !(subRows ?? []).some((s) => s.user_id === o.user_id))
        .map((o) => ({
          id: `override-${o.id}`,
          user_id: o.user_id,
          tier_key: o.tier_key,
          status: "comp",
          provider: "manual",
          profile: profileMap.get(o.user_id),
          override_only: true,
          current_period_end: o.expires_at,
          cancel_at_period_end: false,
        }));
      const all = [...rows, ...orphanOverrides];
      const filtered = all.filter((r) => matchesOmnisearch(r, search));
      return { rows: filtered, overrideMap };
    },
  });

  const [grantUserId, setGrantUserId] = useState("");
  const [grantTier, setGrantTier] = useState("pro");
  const [grantReason, setGrantReason] = useState("");
  const [grantExpires, setGrantExpires] = useState("");

  async function doGrant() {
    if (!grantUserId) return toast.error("User ID required");
    try {
      await grantFn({
        data: {
          userId: grantUserId,
          tierKey: grantTier,
          reason: grantReason || undefined,
          expiresAt: grantExpires || null,
        },
      });
      toast.success("Override granted");
      setGrantUserId("");
      setGrantReason("");
      setGrantExpires("");
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doRevoke(userId: string) {
    if (!confirm("Revoke all entitlement overrides for this user?")) return;
    try {
      await revokeFn({ data: { userId } });
      toast.success("Overrides revoked");
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

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
        title="Subscriptions"
        description="Search subscribers, review their active plan, and grant comp / test entitlements."
      />

      <div className="rounded-2xl border bg-card p-4">
        <div className="text-sm font-semibold">Grant entitlement override</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label className="text-xs">User ID</Label>
            <Input
              placeholder="uuid"
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Tier</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={grantTier}
              onChange={(e) => setGrantTier(e.target.value)}
            >
              <option value="pro">pro</option>
              <option value="elite">elite</option>
              <option value="free">free</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Expires (optional)</Label>
            <Input
              type="date"
              value={grantExpires}
              onChange={(e) => setGrantExpires(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input
              placeholder="beta tester, refund, etc."
              value={grantReason}
              onChange={(e) => setGrantReason(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={doGrant}>
            <Gift className="mr-1 h-4 w-4" /> Grant
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by username, display name, PDGA #, or user ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {subs.isError ? (
          <AdminErrorState
            className="mt-3"
            title="We couldn't load subscribers"
            message="The subscriber list didn't come back. Try again in a moment."
            onRetry={() => void subs.refetch()}
            retrying={subs.isFetching}
          />
        ) : subs.isPending ? (
          <AdminPanelSkeleton className="mt-3" rows={4} />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-2 text-left">User</th>
                  <th className="px-2 py-2 text-left">Tier</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Provider</th>
                  <th className="px-2 py-2 text-left">Renews</th>
                  <th className="px-2 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subs.data?.rows.map((r: any) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-2 py-2">
                      <div className="font-medium">
                        {r.profile?.display_name ?? r.profile?.username ?? "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{r.user_id}</div>
                    </td>
                    <td className="px-2 py-2">{r.tier_key}</td>
                    <td className="px-2 py-2">{r.status}</td>
                    <td className="px-2 py-2">{r.provider}</td>
                    <td className="px-2 py-2">
                      {r.current_period_end
                        ? new Date(r.current_period_end).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <Button size="sm" variant="ghost" onClick={() => doRevoke(r.user_id)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Revoke overrides
                      </Button>
                    </td>
                  </tr>
                ))}
                {!subs.data?.rows.length ? (
                  <tr>
                    <td className="px-2 py-8 text-center text-muted-foreground" colSpan={6}>
                      No subscribers match this view yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
