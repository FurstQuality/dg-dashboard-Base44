/**
 * Plan state for the account-free Event Director Kit.
 *
 * Local mode keeps the plan in this browser only. Shared mode loads it from the
 * share link and autosaves when the visitor holds the editing code, which is
 * stored per link in this browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createOpenPlan, loadOpenPlan, saveOpenPlan } from "@/lib/open-td-plan.functions";
import { newPlan, parsePlan, syncTasks, type OpenPlan } from "@/lib/open-td-plan";

const LOCAL_KEY = "dgd.td-kit.plan.v1";
const editKey = (shareToken: string) => `dgd.td-kit.edit.${shareToken}`;

export type PlanStatus = "loading" | "ready" | "missing" | "error";

export function readEditToken(shareToken: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(editKey(shareToken));
}

export function storeEditToken(shareToken: string, editToken: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(editKey(shareToken), editToken);
}

export function useOpenPlan(shareToken?: string) {
  const [plan, setPlan] = useState<OpenPlan | null>(null);
  const [status, setStatus] = useState<PlanStatus>("loading");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(!shareToken);
  const [sharing, setSharing] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (shareToken) {
        try {
          const row = await loadOpenPlan({ data: { shareToken } });
          if (cancelled) return;
          if (!row) {
            setStatus("missing");
            return;
          }
          const parsed = parsePlan(JSON.parse(row.plan) as unknown);
          setPlan({ ...parsed, title: row.title || parsed.title });
          setSavedAt(row.updatedAt);
          setCanEdit(!!readEditToken(shareToken));
          setStatus("ready");
        } catch {
          if (!cancelled) setStatus("error");
        }
        return;
      }
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_KEY) : null;
      setPlan(raw ? parsePlan(JSON.parse(raw) as unknown) : newPlan());
      setStatus("ready");
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  const persistLocal = useCallback((next: OpenPlan) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked — the plan still works for this session */
    }
  }, []);

  const pushRemote = useCallback(
    async (next: OpenPlan) => {
      if (!shareToken) return;
      const editToken = readEditToken(shareToken);
      if (!editToken) return;
      setSaving(true);
      try {
        const res = await saveOpenPlan({
          data: {
            shareToken,
            editToken,
            title: next.title,
            plan: JSON.stringify(next),
          },
        });
        dirty.current = false;
        setSavedAt(res.updatedAt);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save this plan.");
      } finally {
        setSaving(false);
      }
    },
    [shareToken],
  );

  /** Applies a change and schedules persistence. */
  const update = useCallback(
    (patch: Partial<OpenPlan> | ((prev: OpenPlan) => Partial<OpenPlan>)) => {
      setPlan((prev) => {
        if (!prev) return prev;
        const delta = typeof patch === "function" ? patch(prev) : patch;
        let next: OpenPlan = { ...prev, ...delta };
        const settingsTouched =
          "sanctioned" in delta || "tier" in delta || "rounds" in delta || "divisions" in delta;
        if (settingsTouched) next = { ...next, tasks: syncTasks(next, next.tasks) };
        dirty.current = true;
        if (shareToken) {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void pushRemote(next), 1200);
        } else {
          persistLocal(next);
        }
        return next;
      });
    },
    [persistLocal, pushRemote, shareToken],
  );

  const saveNow = useCallback(async () => {
    if (!plan) return;
    if (shareToken) await pushRemote(plan);
    else persistLocal(plan);
  }, [persistLocal, plan, pushRemote, shareToken]);

  /** Creates a share link for the current plan and returns the share code. */
  const share = useCallback(async () => {
    if (!plan) return null;
    setSharing(true);
    try {
      const res = await createOpenPlan({
        data: { title: plan.title, plan: JSON.stringify(plan) },
      });
      storeEditToken(res.shareToken, res.editToken);
      return res.shareToken;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the share link.");
      return null;
    } finally {
      setSharing(false);
    }
  }, [plan]);

  const reset = useCallback(
    (kind: OpenPlan["kind"]) => {
      const fresh = newPlan(kind);
      setPlan(fresh);
      if (shareToken) void pushRemote(fresh);
      else persistLocal(fresh);
    },
    [persistLocal, pushRemote, shareToken],
  );

  const mode = useMemo(() => (shareToken ? "shared" : "local"), [shareToken]);

  return { plan, status, update, saveNow, saving, savedAt, canEdit, share, sharing, reset, mode };
}
