import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users2, Pencil, Trash2, Plus, Check, X, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

type Crew = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
};

/**
 * Manages the current user's Friend Tracker crews as first-class groups:
 * create, rename, delete, and jump into the tracker view for member editing.
 */
export function CrewList() {
  const { user } = useSession();
  const uid = user?.id ?? null;
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const { data: groups } = await supabase
      .from("tracker_groups")
      .select("id, name, description")
      .eq("owner_id", uid)
      .order("created_at", { ascending: true });
    const ids = ((groups ?? []) as Array<{ id: string }>).map((g) => g.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: members } = await supabase
        .from("tracker_group_members")
        .select("group_id")
        .in("group_id", ids);
      counts = ((members ?? []) as Array<{ group_id: string }>).reduce<Record<string, number>>(
        (acc, m) => {
          acc[m.group_id] = (acc[m.group_id] ?? 0) + 1;
          return acc;
        },
        {},
      );
    }
    setCrews(
      ((groups ?? []) as Array<{ id: string; name: string; description: string | null }>).map(
        (g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          member_count: counts[g.id] ?? 0,
        }),
      ),
    );
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCrew() {
    const name = newName.trim();
    if (!name || !uid) return;
    const { error } = await supabase.from("tracker_groups").insert({ owner_id: uid, name });
    if (error) return toast.error(error.message);
    toast.success("Crew created");
    setNewName("");
    setCreating(false);
    void load();
  }

  async function renameCrew(id: string) {
    const name = editValue.trim();
    if (!name) return;
    const { error } = await supabase.from("tracker_groups").update({ name }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Crew renamed");
    setEditingId(null);
    void load();
  }

  async function deleteCrew(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This removes the crew and its members from your tracker.`))
      return;
    const { error } = await supabase.from("tracker_groups").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Crew deleted");
    void load();
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Your crews</h2>
          {!loading ? (
            <span className="text-xs text-muted-foreground">
              {crews.length} · {crews.reduce((n, c) => n + c.member_count, 0)} members
            </span>
          ) : null}
        </div>
        {!creating ? (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New crew
          </Button>
        ) : null}
      </header>

      {creating ? (
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Input
            value={newName}
            autoFocus
            placeholder="Crew name (e.g. Wednesday Night League)"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createCrew();
            }}
          />
          <Button size="sm" onClick={createCrew}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}

      {loading ? (
        <p className="p-3 text-sm text-muted-foreground">Loading your crews…</p>
      ) : crews.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">
          You don't have any crews yet. Build one to group the players you regularly practice,
          travel, or compete with.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {crews.map((c) => (
            <li key={c.id} className="flex items-center gap-2 p-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Users2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                {editingId === c.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editValue}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void renameCrew(c.id);
                      }}
                    />
                    <Button size="sm" onClick={() => renameCrew(c.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.member_count} member{c.member_count === 1 ? "" : "s"}
                      {c.description ? ` · ${c.description}` : ""}
                    </div>
                  </>
                )}
              </div>
              {editingId === c.id ? null : (
                <>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/tracker/$groupId" params={{ groupId: c.id }}>
                      <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditValue(c.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteCrew(c.id, c.name)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
