import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell, PageHeader } from "@/components/shell";
import { HeartHandshake } from "lucide-react";

export const Route = createFileRoute("/_authenticated/community/new")({
  component: NewEventPage,
  validateSearch: (s: Record<string, unknown>): { kind?: "cleanup" | "charity" | "group_round" | "meetup" | "clinic"; type?: string } => ({
    kind: ["cleanup", "charity", "group_round", "meetup", "clinic"].includes(String(s["kind"]))
      ? (s["kind"] as "cleanup")
      : undefined,
    type: typeof s["type"] === "string" ? String(s["type"]).slice(0, 40) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Host a community event · DG Dashboard" },
      {
        name: "description",
        content:
          "Create a course cleanup, charity drive, group round, meetup, or clinic and rally the disc golf community.",
      },
      { property: "og:title", content: "Host a community event · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Create a course cleanup, charity drive, group round, meetup, or clinic and rally the disc golf community.",
      },
    ],
  }),
});

function NewEventPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    kind: (search.kind ?? "cleanup") as "cleanup" | "charity" | "group_round" | "meetup" | "clinic",
    title: "",
    description: "",
    location: "",
    starts_at: "",
    ends_at: "",
    capacity: "",
    cause: "",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;
    if (!form.title || !form.starts_at) {
      toast.error("Add a title and start time");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("community_events")
      .insert({
        host_id: user.id,
        kind: form.kind,
        title: form.title,
        description: form.description || null,
        location: form.location || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        capacity: form.capacity ? Number(form.capacity) : null,
        cause: form.cause || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Event created! +200 XP");
    navigate({ to: "/community/$eventId", params: { eventId: data.id } });
  }

  return (
    <PageShell narrow>
      <PageHeader
        eyebrow="Community"
        title="Host a community event"
        description="Bring people together. Hosts earn XP and trophies. Attendees who check in earn XP too."
        leading={
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
            <HeartHandshake className="h-5 w-5" />
          </div>
        }
      />

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-border bg-card p-6">
        <div>
          <Label>Event type</Label>
          <Select
            value={form.kind}
            onValueChange={(v) => setForm((f) => ({ ...f, kind: v as typeof form.kind }))}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cleanup">Course Cleanup</SelectItem>
              <SelectItem value="charity">Charity Drive</SelectItem>
              <SelectItem value="group_round">Group Round</SelectItem>
              <SelectItem value="meetup">Meetup</SelectItem>
              <SelectItem value="clinic">Clinic</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Saturday morning cleanup at Maple Hill"
          />
        </div>
        <div>
          <Label htmlFor="description">Details</Label>
          <Textarea
            id="description"
            rows={4}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What to bring, meet point, agenda, dress code…"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="starts">Starts</Label>
            <Input
              id="starts"
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="ends">Ends (optional)</Label>
            <Input
              id="ends"
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Course name or address"
            />
          </div>
          <div>
            <Label htmlFor="capacity">Capacity (optional)</Label>
            <Input
              id="capacity"
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            />
          </div>
        </div>
        {form.kind === "charity" ? (
          <div>
            <Label htmlFor="cause">Cause / beneficiary</Label>
            <Input
              id="cause"
              value={form.cause}
              onChange={(e) => setForm((f) => ({ ...f, cause: e.target.value }))}
              placeholder="Local youth disc golf program"
            />
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/community" })}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Publishing…" : "Publish event"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
