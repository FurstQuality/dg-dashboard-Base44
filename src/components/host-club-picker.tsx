import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";

/** Clubs the signed-in director helps run (owner or admin), plus the current host. */
export function HostClubPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ["host-club-options", user?.id, value],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: owned }, { data: admin }] = await Promise.all([
        supabase.from("clubs").select("id, name").eq("owner_id", user!.id),
        supabase.from("club_members").select("club_id, clubs(id, name)").eq("user_id", user!.id).in("role", ["owner", "admin"]),
      ]);
      const map = new Map<string, string>();
      (owned ?? []).forEach((c) => map.set(c.id, c.name));
      (admin ?? []).forEach((m: any) => m.clubs && map.set(m.clubs.id, m.clubs.name));
      if (value && !map.has(value)) {
        const { data: cur } = await supabase.from("clubs").select("id, name").eq("id", value).maybeSingle();
        if (cur) map.set(cur.id, cur.name);
      }
      return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  const opts = q.data ?? [];
  return (
    <div className="space-y-1">
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Hosting club"
      >
        <option value="">No club — hosted by me</option>
        {opts.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {q.isSuccess && opts.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">You can pick a club here once you own or help run one.</p>
      ) : null}
    </div>
  );
}
