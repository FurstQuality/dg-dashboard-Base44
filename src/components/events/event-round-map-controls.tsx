import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Lock, Map as MapIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export type EventRoundKind = "tournament" | "league";

/**
 * Per event round / league night: shows which saved layout version it plays,
 * opens the event-only map rules, and freezes the round map so later course
 * edits never change this event.
 */
export function EventRoundMapControls({
  kind,
  roundId,
  eventId,
  courseId,
  layoutId,
  layoutVersionId,
  rulesSnapshot,
  label,
  onChange,
}: {
  kind: EventRoundKind;
  roundId: string;
  eventId: string;
  courseId: string | null;
  layoutId: string | null;
  layoutVersionId: string | null;
  rulesSnapshot: unknown;
  label: string;
  onChange: () => void;
}) {
  const navigate = useNavigate();
  const [pinned, setPinned] = useState<number | null>(null);
  const [latest, setLatest] = useState<{ id: string; version: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const snap = (rulesSnapshot ?? {}) as { captured_at?: string; event_rules?: unknown[] };

  useEffect(() => {
    if (!layoutId) return;
    (async () => {
      const { data } = await supabase
        .from("layout_versions")
        .select("id, version")
        .eq("layout_id", layoutId)
        .order("version", { ascending: false });
      const rows = data ?? [];
      setLatest(rows[0] ?? null);
      setPinned(rows.find((r) => r.id === layoutVersionId)?.version ?? null);
    })();
  }, [layoutId, layoutVersionId]);

  if (!courseId || !layoutId) return null;
  const table = kind === "tournament" ? "tournament_rounds" : "league_events";
  const outdated = latest && layoutVersionId && latest.id !== layoutVersionId;

  const useLatest = async () => {
    if (!latest) return;
    setBusy(true);
    const { error } = await supabase.from(table).update({ layout_version_id: latest.id }).eq("id", roundId);
    setBusy(false);
    if (error) return toast.error("Couldn't switch to the latest layout version.");
    toast.success(`Now playing layout version ${latest.version}.`);
    onChange();
  };

  const openRules = async () => {
    setBusy(true);
    const match =
      kind === "tournament" ? { tournament_id: eventId } : { league_event_id: roundId };
    let { data: overlay } = await supabase
      .from("course_event_overlays")
      .select("id")
      .match({ ...match, layout_id: layoutId })
      .maybeSingle();
    if (!overlay) {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("course_event_overlays")
        .insert({ ...match, course_id: courseId, layout_id: layoutId, name: `${label} rules`, created_by: u.user?.id })
        .select("id")
        .single();
      if (error) {
        setBusy(false);
        return toast.error("Couldn't open event rules. Only the event's directors can add them.");
      }
      overlay = data;
    }
    setBusy(false);
    navigate({
      to: "/courses/$courseId/edit",
      params: { courseId },
      search: { layout: layoutId, overlay: overlay!.id },
    });
  };

  const lock = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("build_event_round_snapshot", { _kind: kind, _id: roundId });
    setBusy(false);
    if (error) return toast.error("Couldn't lock the round map. Only the event's directors can do this.");
    toast.success("Round map locked. Later course edits won't change this event.");
    onChange();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-muted-foreground">
        {pinned != null ? `Layout version ${pinned}` : "Layout not published yet"}
      </span>
      {outdated ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={useLatest}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Use latest (v{latest!.version})
        </Button>
      ) : null}
      <Button size="sm" variant="outline" disabled={busy} onClick={openRules}>
        <MapIcon className="mr-1 h-3.5 w-3.5" /> Event map rules
      </Button>
      <Button size="sm" variant={snap.captured_at ? "ghost" : "outline"} disabled={busy} onClick={lock}>
        <Lock className="mr-1 h-3.5 w-3.5" />
        {snap.captured_at
          ? `Locked ${new Date(snap.captured_at).toLocaleDateString()} · relock`
          : "Lock round map"}
      </Button>
      {snap.captured_at && Array.isArray(snap.event_rules) ? (
        <span className="text-muted-foreground">{snap.event_rules.length} event rules</span>
      ) : null}
    </div>
  );
}
