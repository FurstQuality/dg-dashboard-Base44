import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listDgdPreviewTesters, publishDgdPreviewData, setDgdPreviewTester } from "@/lib/dgd-v1.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Admin: who can see the V1.1 Statboard preview, and rebuilding its stored data. */
export function DgdPreviewAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(listDgdPreviewTesters);
  const setT = useServerFn(setDgdPreviewTester);
  const publish = useServerFn(publishDgdPreviewData);
  const [name, setName] = useState("");
  const testers = useQuery({ queryKey: ["dgd-preview-testers"], queryFn: () => list() });
  const change = useMutation({
    mutationFn: (v: { username: string; add: boolean }) => setT({ data: v }),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["dgd-preview-testers"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const pub = useMutation({
    mutationFn: () => publish(),
    onSuccess: (r) => toast.success(`Preview rebuilt for ${r.players} players (${r.rounds} rounds)`),
    onError: () => toast.error("Preview rebuild failed"),
  });
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">V1.1 Statboard preview</h2>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => pub.mutate()} disabled={pub.isPending}>
          {pub.isPending ? "Rebuilding…" : "Rebuild preview data"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Admins always have access. Add testers by username. Public ratings stay on Production.</p>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) change.mutate({ username: name.trim(), add: true }); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Username" className="max-w-xs" aria-label="Tester username" />
        <Button type="submit" size="sm" disabled={change.isPending}>Add tester</Button>
      </form>
      <ul className="mt-3 divide-y divide-border/60 text-sm">
        {(testers.data?.testers ?? []).map((t: any) => (
          <li key={t.user_id} className="flex items-center justify-between py-1.5">
            <span>{t.profile?.display_name ?? t.profile?.username ?? t.user_id}</span>
            {t.profile?.username && (
              <Button size="sm" variant="ghost" onClick={() => change.mutate({ username: t.profile.username, add: false })}>Remove</Button>
            )}
          </li>
        ))}
        {testers.data && !testers.data.testers.length && <li className="py-1.5 text-muted-foreground">No testers yet.</li>}
      </ul>
    </section>
  );
}
