// The single import & sync tool for the whole app.
// Every source (PDGA, UDisc, Disc Golf Scene, links, manual entry) is handled
// here so syncing and importing only ever happens in one place.

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Link2, IdCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { LinkedProfilesCard } from "@/components/linked-profiles-card";
import { ImportPage } from "@/components/imports/import-rounds-panel";
import {
  PDGA_SERVER_FUNCTIONS,
  syncAllPdgaData,
  getLastPdgaSyncAt,
  formatRelativeSyncAt,
} from "@/lib/pdga-sync";

type PanelKey = "accounts" | "rounds";

export function ImportSyncTool(_props: { initialPanel?: PanelKey } = {}) {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const profileQ = useQuery({
    enabled: !!user,
    queryKey: ["settings-imports", "profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "pdga_number, pdga_rating, scene_profile_url, scene_profile_urls, udisc_profile_url",
        )
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const sourceCountsQ = useQuery({
    enabled: !!user,
    queryKey: ["settings-imports", "source-counts", user?.id],
    staleTime: 30_000,
    queryFn: async () => {
      const uid = user!.id;
      const [pdga, udisc, dgd] = await Promise.all([
        supabase
          .from("external_rounds")
          .select("*", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("source", "pdga"),
        supabase
          .from("external_rounds")
          .select("*", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("source", "udisc"),
        supabase.from("rounds").select("*", { count: "exact", head: true }).eq("created_by", uid),
      ]);
      return { pdga: pdga.count ?? 0, udisc: udisc.count ?? 0, dgd: dgd.count ?? 0 };
    },
  });

  const syncProfileFn = useServerFn(PDGA_SERVER_FUNCTIONS.syncMyPdgaFromProfile);
  const syncEventsFn = useServerFn(PDGA_SERVER_FUNCTIONS.syncMyPdgaEvents);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => getLastPdgaSyncAt());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<{ at: string }>).detail;
      setLastSyncAt(detail?.at ?? getLastPdgaSyncAt());
    };
    window.addEventListener("dgd:pdga-synced", onSync as EventListener);
    return () => window.removeEventListener("dgd:pdga-synced", onSync as EventListener);
  }, []);

  const profile = profileQ.data as {
    pdga_number?: number | string | null;
    scene_profile_url?: string | null;
    scene_profile_urls?: Record<string, string> | null;
    udisc_profile_url?: string | null;
  } | null;
  const pdgaNumber = profile?.pdga_number != null ? String(profile.pdga_number) : null;

  async function syncEverything() {
    if (!profile?.pdga_number) {
      toast.error("Link your PDGA number first", {
        description: "Add it under Connected accounts, then sync.",
      });
      return;
    }
    setSyncing(true);
    try {
      const res = await syncAllPdgaData(
        { syncProfile: syncProfileFn, syncEvents: syncEventsFn },
        { force: true, queryClient },
      );
      if (res.ok) {
        setLastSyncAt(res.syncedAt);
        await Promise.all([profileQ.refetch(), sourceCountsQ.refetch()]);
      }
    } finally {
      setSyncing(false);
    }
  }

  const counts = sourceCountsQ.data;

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {/* Source status + one sync control */}
        <div className="flex flex-wrap items-center gap-2">
          <SourceChip
            label="PDGA"
            connected={!!profile?.pdga_number}
            detail={counts ? `${counts.pdga} rounds` : undefined}
          />
          <SourceChip
            label="UDisc"
            connected={!!profile?.udisc_profile_url}
            detail={counts ? `${counts.udisc} rounds` : undefined}
          />
          <SourceChip
            label="Disc Golf Scene"
            connected={
              !!profile?.scene_profile_url ||
              Object.keys(profile?.scene_profile_urls ?? {}).length > 0
            }
          />
          <SourceChip
            label="DG Dashboard"
            connected
            detail={counts ? `${counts.dgd} rounds` : undefined}
          />
          <div className="ml-auto flex items-center gap-2">
            {lastSyncAt ? (
              <span className="text-[11px] text-muted-foreground">
                Synced {formatRelativeSyncAt(lastSyncAt)}
              </span>
            ) : null}
            <Button
              size="sm"
              disabled={syncing}
              onClick={() => {
                void syncEverything();
              }}
            >
              <RefreshCw className={cn("mr-1 h-3.5 w-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync everything"}
            </Button>
          </div>
        </div>

        {/* One page: accounts first, then rounds & links */}
        <div className="space-y-6 border-t border-border/60 pt-4">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <IdCard className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Connected accounts</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Link PDGA, UDisc, and Disc Golf Scene. Once linked, your rating, rounds, and schedule
              refresh together.
            </p>
            {user ? (
              <LinkedProfilesCard
                userId={user.id}
                pdgaNumber={pdgaNumber}
                sceneUrl={profile?.scene_profile_url ?? null}
                sceneUrls={profile?.scene_profile_urls ?? null}
                udiscUrl={profile?.udisc_profile_url ?? null}
                onChanged={async () => {
                  await Promise.all([profileQ.refetch(), sourceCountsQ.refetch()]);
                }}
              />
            ) : null}
          </section>

          <section className="space-y-3 border-t border-border/60 pt-6">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Rounds &amp; links</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Pull PDGA rated rounds, paste a tournament, club, or course link, or add a round by
              hand.
            </p>
            <ImportPage />
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceChip({
  label,
  connected,
  detail,
}: {
  label: string;
  connected: boolean;
  detail?: string;
}) {
  return (
    <Badge variant={connected ? "secondary" : "outline"} className="gap-1.5 font-normal">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          connected ? "bg-emerald-500" : "bg-muted-foreground/50",
        )}
        aria-hidden
      />
      {label}
      {detail ? <span className="text-muted-foreground">· {detail}</span> : null}
    </Badge>
  );
}
