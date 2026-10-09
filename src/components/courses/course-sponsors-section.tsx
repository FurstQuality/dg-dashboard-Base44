import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORIES = [
  ["course", "Course sponsor"],
  ["hole", "Hole sponsor"],
  ["event", "Event sponsor"],
  ["community", "Community partner"],
] as const;
type Category = (typeof CATEGORIES)[number][0];
type Sponsor = { id: string; name: string; logo_url: string | null; category: string; link_url: string | null; hole_number: number | null };

const httpsOrNull = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  try { const u = new URL(t); return u.protocol === "https:" ? u.toString() : undefined; } catch { return undefined; }
};

/** Course sponsors: name, logo, category and link. Stewards manage them; everyone sees them. */
export function CourseSponsorsSection({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const key = ["course-sponsors", courseId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [{ data }, { data: u }] = await Promise.all([
        supabase.from("course_sponsors").select("id, name, logo_url, category, link_url, hole_number").eq("course_id", courseId).order("sort_order").order("created_at"),
        supabase.auth.getUser(),
      ]);
      let canManage = false;
      if (u.user) {
        const { data: ok } = await supabase.rpc("can_steward_course", { _course: courseId, _user: u.user.id });
        canManage = !!ok;
      }
      return { rows: (data ?? []) as Sponsor[], canManage };
    },
  });
  const [form, setForm] = useState({ name: "", logo: "", link: "", category: "course" as Category, hole: "" });
  const add = useMutation({
    mutationFn: async () => {
      const logo = httpsOrNull(form.logo), link = httpsOrNull(form.link);
      if (!form.name.trim()) throw new Error("Add the sponsor's name.");
      if (logo === undefined || link === undefined) throw new Error("Logo and link must be full https:// addresses.");
      const hole = form.category === "hole" && form.hole ? Number(form.hole) : null;
      const { error } = await supabase.from("course_sponsors").insert({ course_id: courseId, name: form.name.trim(), logo_url: logo, link_url: link, category: form.category, hole_number: hole });
      if (error) throw new Error("The sponsor couldn't be saved. Only course stewards can add sponsors.");
    },
    onSuccess: () => { setForm({ name: "", logo: "", link: "", category: "course", hole: "" }); qc.invalidateQueries({ queryKey: key }); toast.success("Sponsor added"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_sponsors").delete().eq("id", id);
      if (error) throw new Error("The sponsor couldn't be removed.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data?.rows ?? [];
  const canManage = q.data?.canManage ?? false;
  if (!rows.length && !canManage) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">Sponsors</h2>
        <p className="text-sm text-muted-foreground">The businesses and partners who support this course.</p>
      </div>
      {rows.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              {s.logo_url ? <img src={s.logo_url} alt={`${s.name} logo`} className="h-10 w-10 shrink-0 rounded-md bg-muted object-contain" loading="lazy" /> : <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted text-sm font-semibold">{s.name.slice(0, 1)}</div>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {CATEGORIES.find((c) => c[0] === s.category)?.[1] ?? "Sponsor"}{s.hole_number ? ` · Hole ${s.hole_number}` : ""}
                </div>
              </div>
              {s.link_url ? <a href={s.link_url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${s.name}`} className="text-muted-foreground hover:text-primary"><ExternalLink className="h-4 w-4" /></a> : null}
              {canManage ? <Button size="icon" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => remove.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No sponsors yet. Add the first one below.</p>
      )}
      {canManage ? (
        <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <Input placeholder="Sponsor name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} className="lg:col-span-2" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })} className="h-10 rounded-md border border-input bg-background px-2 text-sm" aria-label="Category">
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {form.category === "hole" ? <Input type="number" min={1} placeholder="Hole" value={form.hole} onChange={(e) => setForm({ ...form, hole: e.target.value })} /> : null}
          <Input placeholder="Logo link (https://…)" value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} />
          <Input placeholder="Website (https://…)" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
          <Button type="submit" disabled={add.isPending} className="sm:col-span-2 lg:col-span-6 lg:justify-self-start"><Plus className="mr-1 h-4 w-4" />Add sponsor</Button>
        </form>
      ) : null}
    </section>
  );
}
