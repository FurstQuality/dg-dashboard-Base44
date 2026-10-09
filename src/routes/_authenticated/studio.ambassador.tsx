import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listMyAmbassadorships, requestAmbassadorship } from "@/lib/creator-studio.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, MapPin, Users, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio/ambassador")({
  component: AmbassadorPage,
  head: () => ({
    meta: [
      { title: "Ambassador program · Creator Studio · DG Dashboard" },
      { name: "description", content: "Apply to the ambassador program and track your standing." },
      { property: "og:title", content: "Ambassador program · Creator Studio · DG Dashboard" },
      {
        property: "og:description",
        content: "Apply to the ambassador program and track your standing.",
      },
    ],
  }),
});

function AmbassadorPage() {
  const qc = useQueryClient();
  const fetch = useServerFn(listMyAmbassadorships);
  const request = useServerFn(requestAmbassadorship);
  const q = useQuery({ queryKey: ["my-ambassadorships"], queryFn: () => fetch() });

  const [kind, setKind] = useState<"course" | "club">("course");
  const [entityId, setEntityId] = useState("");
  const [entityName, setEntityName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [notes, setNotes] = useState("");

  const reqMut = useMutation({
    mutationFn: () =>
      request({
        data: {
          entity_kind: kind,
          entity_id: entityId,
          entity_name: entityName || undefined,
          role_title: roleTitle || undefined,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Ambassador request submitted");
      setEntityId("");
      setEntityName("");
      setRoleTitle("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["my-ambassadorships"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Request failed"),
  });

  const rows = q.data?.rows ?? [];
  const active = rows.filter((r) => r.is_active);
  const pending = rows.filter((r) => !r.is_active && !r.ended_at);
  const ended = rows.filter((r) => r.ended_at);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Your ambassadorships
            </CardTitle>
            <CardDescription>
              Represent a course or club as its official DG Dashboard voice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not an active ambassador yet — submit a request on the right.
              </p>
            ) : (
              <div className="space-y-2">
                {active.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border rounded-lg p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        {r.entity_kind === "course" ? (
                          <MapPin className="h-3.5 w-3.5" />
                        ) : (
                          <Users className="h-3.5 w-3.5" />
                        )}
                        {r.entity_name ?? r.entity_id}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {r.role_title ?? "Ambassador"} · since{" "}
                        {new Date(r.since).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge
                      className="bg-primary/15 text-primary border-primary/30"
                      variant="outline"
                    >
                      Active
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {pending.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pending review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pending.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border rounded p-2">
                    <div className="text-sm">
                      {r.entity_kind} · {r.entity_name ?? r.entity_id}
                    </div>
                    <Badge variant="secondary">Pending</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {ended.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Past</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm text-muted-foreground">
                {ended.map((r) => (
                  <div key={r.id}>
                    {r.entity_name ?? r.entity_id} · ended{" "}
                    {new Date(r.ended_at!).toLocaleDateString()}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request ambassadorship</CardTitle>
          <CardDescription>An admin reviews every request before you're activated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Represent a…</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="course">Course</SelectItem>
                <SelectItem value="club">Club</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{kind === "course" ? "Course" : "Club"} ID (UUID)</Label>
            <Input
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="Paste the ID from the URL"
            />
          </div>
          <div>
            <Label>{kind === "course" ? "Course" : "Club"} name</Label>
            <Input
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              placeholder="For quick reference"
              maxLength={200}
            />
          </div>
          <div>
            <Label>Your role title (optional)</Label>
            <Input
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="Course Ambassador, Club President…"
              maxLength={120}
            />
          </div>
          <div>
            <Label>Why you (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
            />
          </div>
          <Button onClick={() => reqMut.mutate()} disabled={!entityId || reqMut.isPending}>
            <Send className="h-4 w-4 mr-1" /> Submit request
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
