/**
 * Reusable entity editor — renders any registered entity from the field_registry.
 *
 * - Groups fields by field_group in registered order.
 * - Honors editable_by_owner / editable_by_admin flags.
 * - Diff-checks before submit; empty patches are no-ops.
 * - Shows revision history + revert (queued for owners, instant for admins).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, RotateCcw, Save, ShieldCheck, User } from "lucide-react";
import {
  getEntity,
  listFields,
  updateEntity,
  listRevisions,
  revertToRevision,
  type EntityKind,
  ENTITY_LABELS,
} from "@/lib/entity-editor.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type FieldRow = {
  id: string;
  field_key: string;
  label: string;
  data_type: string;
  field_group: string;
  order_index: number;
  help_text: string | null;
  required: boolean;
  editable_by_owner: boolean;
  editable_by_admin: boolean;
  deprecated: boolean;
  options: any;
};

export function EntityEditor({ entity_type, id }: { entity_type: EntityKind; id: string }) {
  const qc = useQueryClient();
  const $getEntity = useServerFn(getEntity);
  const $listFields = useServerFn(listFields);
  const $updateEntity = useServerFn(updateEntity);

  const entityQ = useQuery({
    queryKey: ["entity", entity_type, id],
    queryFn: () => $getEntity({ data: { entity_type, id } }),
  });
  const fieldsQ = useQuery({
    queryKey: ["field-registry", entity_type],
    queryFn: () => $listFields({ data: { entity_type } }),
  });

  const [dirty, setDirty] = useState<Record<string, any>>({});
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      $updateEntity({
        data: { entity_type, id, patch: dirty, note: note || null },
      }),
    onSuccess: (res) => {
      toast.success(
        res.changed
          ? `Saved ${res.changed} field${res.changed === 1 ? "" : "s"}.`
          : "No changes to save.",
      );
      setDirty({});
      setNote("");
      qc.invalidateQueries({ queryKey: ["entity", entity_type, id] });
      qc.invalidateQueries({ queryKey: ["entity-revisions", entity_type, id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed."),
  });

  const grouped = useMemo(() => {
    const fields: FieldRow[] = (fieldsQ.data as FieldRow[] | undefined) ?? [];
    const admin = Boolean(entityQ.data?.permissions.admin);
    const owner = Boolean(entityQ.data?.permissions.owner);
    const visible = fields.filter((f) => {
      if (f.deprecated) return false;
      if (admin) return f.editable_by_admin;
      if (owner) return f.editable_by_owner;
      return false;
    });
    const g: Record<string, FieldRow[]> = {};
    for (const f of visible) {
      (g[f.field_group] ??= []).push(f);
    }
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [fieldsQ.data, entityQ.data]);

  if (entityQ.isLoading || fieldsQ.isLoading) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Loading editor…
      </div>
    );
  }
  if (entityQ.error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        {(entityQ.error as Error).message}
      </div>
    );
  }
  const row = entityQ.data!.row as Record<string, any>;
  const perms = entityQ.data!.permissions;

  if (!perms.canEdit) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        You don't have permission to edit this {ENTITY_LABELS[entity_type].toLowerCase()}.
      </div>
    );
  }

  const value = (key: string) => (key in dirty ? dirty[key] : row[key]);
  const setValue = (key: string, v: any) => {
    setDirty((d) => {
      const next = { ...d };
      if (v === row[key]) delete next[key];
      else next[key] = v;
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2 text-sm">
          {perms.admin ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Admin edit
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <User className="h-3 w-3" /> Owner edit
            </Badge>
          )}
          <span className="text-muted-foreground">
            {ENTITY_LABELS[entity_type]} · <span className="font-mono">{id.slice(0, 8)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <RevisionHistory entity_type={entity_type} id={id} isAdmin={perms.admin} />
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={Object.keys(dirty).length === 0 || mut.isPending}
          >
            <Save className="mr-1 h-4 w-4" />
            {mut.isPending
              ? "Saving…"
              : `Save${Object.keys(dirty).length ? ` (${Object.keys(dirty).length})` : ""}`}
          </Button>
        </div>
      </div>

      {grouped.map(([group, fields]) => (
        <section key={group} className="rounded-xl border bg-card">
          <header className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group}
          </header>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {fields.map((f) => (
              <FieldControl
                key={f.field_key}
                field={f}
                value={value(f.field_key)}
                onChange={(v) => setValue(f.field_key, v)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="rounded-xl border bg-card p-4">
        <Label className="text-xs font-medium">Change note (optional)</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why did you make this change?"
          className="mt-1"
          rows={2}
        />
      </div>
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldRow;
  value: any;
  onChange: (v: any) => void;
}) {
  const inputId = `f-${field.field_key}`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId} className="text-xs font-medium">
          {field.label}
          {field.required ? <span className="ml-1 text-destructive">*</span> : null}
        </Label>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {field.data_type}
        </span>
      </div>
      {renderControl(field, value, onChange, inputId)}
      {field.help_text ? (
        <p className="text-[11px] text-muted-foreground">{field.help_text}</p>
      ) : null}
    </div>
  );
}

function renderControl(field: FieldRow, value: any, onChange: (v: any) => void, id: string) {
  const t = field.data_type;
  if (t === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
        <span className="text-sm text-muted-foreground">{value ? "Enabled" : "Disabled"}</span>
      </div>
    );
  }
  if (t === "integer" || t === "number") {
    return (
      <Input
        id={id}
        type="number"
        value={value ?? ""}
        step={t === "integer" ? 1 : "any"}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = t === "integer" ? parseInt(raw, 10) : parseFloat(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
      />
    );
  }
  if (t === "date") {
    return (
      <Input
        id={id}
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    );
  }
  if (t === "datetime") {
    const v = value ? String(value).slice(0, 16) : "";
    return (
      <Input
        id={id}
        type="datetime-local"
        value={v}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
      />
    );
  }
  if (t === "time") {
    return (
      <Input
        id={id}
        type="time"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    );
  }
  if (t === "json" || t === "array") {
    return (
      <Textarea
        id={id}
        rows={4}
        className="font-mono text-xs"
        value={value == null ? "" : JSON.stringify(value, null, 2)}
        onChange={(e) => {
          try {
            onChange(e.target.value === "" ? null : JSON.parse(e.target.value));
          } catch {
            /* leave; user is still typing */
          }
        }}
      />
    );
  }
  // long text fields
  if (
    field.field_key === "description" ||
    field.field_key === "bio" ||
    field.field_key === "rules" ||
    field.field_key.endsWith("_notes")
  ) {
    return (
      <Textarea id={id} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return <Input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

function RevisionHistory({
  entity_type,
  id,
  isAdmin,
}: {
  entity_type: EntityKind;
  id: string;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const $listRevisions = useServerFn(listRevisions);
  const $revert = useServerFn(revertToRevision);
  const [open, setOpen] = useState(false);

  const revQ = useQuery({
    queryKey: ["entity-revisions", entity_type, id],
    queryFn: () => $listRevisions({ data: { entity_type, id } }),
    enabled: open,
  });

  const revertMut = useMutation({
    mutationFn: (revision_id: string) => $revert({ data: { revision_id } }),
    onSuccess: (res) => {
      if (res.queued) {
        toast.success("Revert request submitted for admin review.");
      } else {
        toast.success(`Reverted ${res.applied ?? 0} field(s).`);
        qc.invalidateQueries({ queryKey: ["entity", entity_type, id] });
      }
      qc.invalidateQueries({ queryKey: ["entity-revisions", entity_type, id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Revert failed."),
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <History className="mr-1 h-4 w-4" /> History
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Revision history</SheetTitle>
          <SheetDescription>
            {isAdmin
              ? "Reverting as admin applies changes immediately."
              : "Reverting queues a request for admin review."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {revQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : (revQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No edits recorded yet.</p>
          ) : (
            (revQ.data as any[]).map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()} ·{" "}
                      {r.editor?.display_name ?? "Unknown"}
                    </div>
                    <div className="mt-1 text-sm">
                      Changed{" "}
                      <span className="font-medium">{Object.keys(r.after_data ?? {}).length}</span>{" "}
                      field
                      {Object.keys(r.after_data ?? {}).length === 1 ? "" : "s"}
                      {r.note ? <span className="text-muted-foreground"> — {r.note}</span> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.keys(r.after_data ?? {})
                        .slice(0, 6)
                        .map((k) => (
                          <Badge key={k} variant="outline" className="text-[10px]">
                            {k}
                          </Badge>
                        ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revertMut.mutate(r.id)}
                    disabled={revertMut.isPending}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    {isAdmin ? "Revert" : "Request"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
