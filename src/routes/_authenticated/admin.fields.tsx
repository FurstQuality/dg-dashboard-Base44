/**
 * Admin: Field Registry editor.
 *
 * Lets super admins tune labels, help text, groups, editability, and visibility
 * for every registered field across the five tracked entity types.
 */
import { useMemo, useState } from "react";
import { matchesOmnisearch } from "@/lib/omnisearch";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  listFields,
  updateField,
  createField,
  deleteField,
  ENTITY_KINDS,
  ENTITY_LABELS,
  type EntityKind,
} from "@/lib/entity-editor.functions";
import { FIELD_DATA_TYPES } from "@/lib/field-registry-meta";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import { ShieldAlert, Search, Plus, Trash2 } from "lucide-react";
import {
  AdminErrorState,
  AdminPanelSkeleton,
  AdminEmptyState,
} from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/fields")({
  component: FieldsAdmin,
  head: () => ({
    meta: [
      { title: "Field registry · Admin · DG Dashboard" },
      {
        name: "description",
        content:
          "Configure editable fields, labels, help text, and permissions across every entity type.",
      },
      { property: "og:title", content: "Field registry · Admin · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Configure editable fields, labels, help text, and permissions across every entity type.",
      },
    ],
  }),
});

function FieldsAdmin() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();
  const [tab, setTab] = useState<EntityKind>("course_rating_profile");

  if (loading) return null;
  if (!user || !isAdmin) {
    return (
      <PageShell>
        <PageHeader title="Admin only" description="Super admin access required." />
        <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          Access denied.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Field registry"
        description="One source of truth for every editable field. Adjust labels, help text, grouping, and who can change them."
        eyebrow="Super admin"
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as EntityKind)}>
        <TabsList className="flex-wrap">
          {ENTITY_KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {ENTITY_LABELS[k]}
            </TabsTrigger>
          ))}
        </TabsList>
        {ENTITY_KINDS.map((k) => (
          <TabsContent key={k} value={k} className="mt-4">
            <FieldTable entity_type={k} />
          </TabsContent>
        ))}
      </Tabs>
    </PageShell>
  );
}

function FieldTable({ entity_type }: { entity_type: EntityKind }) {
  const qc = useQueryClient();
  const $list = useServerFn(listFields);
  const $update = useServerFn(updateField);
  const $create = useServerFn(createField);
  const $remove = useServerFn(deleteField);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const fieldsQ = useQuery({
    queryKey: ["field-registry", entity_type],
    queryFn: () => $list({ data: { entity_type } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["field-registry", entity_type] });

  const mut = useMutation({
    mutationFn: (vars: { id: string; patch: any }) => $update({ data: vars }),
    onSuccess: () => {
      toast.success("Field updated.");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed."),
  });

  const createMut = useMutation({
    mutationFn: (vars: any) => $create({ data: { entity_type, ...vars } }),
    onSuccess: () => {
      toast.success("Field added.");
      setAdding(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not add that field."),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => $remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Field removed.");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not remove that field."),
  });

  const rows = useMemo(() => {
    const data = (fieldsQ.data as any[]) ?? [];
    return data.filter((r) => matchesOmnisearch(r, q));
  }, [fieldsQ.data, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search fields, groups, keys, or source mappings…"
            className="pl-8"
          />
        </div>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {adding ? "Cancel" : "Add field"}
        </Button>
      </div>

      {adding ? (
        <NewFieldForm
          pending={createMut.isPending}
          onCancel={() => setAdding(false)}
          onCreate={(values) => createMut.mutate(values)}
        />
      ) : null}

      {fieldsQ.isError ? (
        <AdminErrorState
          title="We couldn't load these fields"
          message="The field list didn't come back. Try again in a moment."
          onRetry={() => void fieldsQ.refetch()}
          retrying={fieldsQ.isFetching}
        />
      ) : fieldsQ.isPending ? (
        <AdminPanelSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          title="No fields match that search"
          message="Clear the search or add a field to start mapping this entity."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Key</th>
                <th className="px-3 py-2 text-left">Label</th>
                <th className="px-3 py-2 text-left">Group</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Maps to</th>
                <th className="px-3 py-2 text-left">Help text</th>
                <th className="px-3 py-2 text-center">Owner</th>
                <th className="px-3 py-2 text-center">Admin</th>
                <th className="px-3 py-2 text-center">Public</th>
                <th className="px-3 py-2 text-center">Deprecated</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f: any) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  removing={removeMut.isPending}
                  onSave={(patch) => mut.mutate({ id: f.id, patch })}
                  onRemove={() => {
                    if (
                      confirm(
                        `Remove the "${f.label ?? f.key}" field? Existing values stay in the record but the field stops appearing on forms.`,
                      )
                    )
                      removeMut.mutate(f.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TypeSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? "h-8 w-[130px]"}>
        <SelectValue placeholder="Type" />
      </SelectTrigger>
      <SelectContent>
        {FIELD_DATA_TYPES.map((t) => (
          <SelectItem key={t} value={t}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NewFieldForm({
  pending,
  onCancel,
  onCreate,
}: {
  pending: boolean;
  onCancel: () => void;
  onCreate: (values: Record<string, unknown>) => void;
}) {
  const [fieldKey, setFieldKey] = useState("");
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState("General");
  const [dataType, setDataType] = useState<string>("text");
  const [sourceKey, setSourceKey] = useState("");
  const [help, setHelp] = useState("");

  const valid = /^[a-z0-9_]+$/.test(fieldKey) && label.trim().length > 0;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="new-field-key">Field key</Label>
          <Input
            id="new-field-key"
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value.trim().toLowerCase())}
            placeholder="course_rating"
          />
          <p className="text-xs text-muted-foreground">
            Lowercase letters, numbers, and underscores.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-field-label">Label</Label>
          <Input
            id="new-field-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Course rating"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-field-group">Group</Label>
          <Input id="new-field-group" value={group} onChange={(e) => setGroup(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Data type</Label>
          <TypeSelect value={dataType} onChange={setDataType} className="h-9 w-full" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-field-source">Maps to</Label>
          <Input
            id="new-field-source"
            value={sourceKey}
            onChange={(e) => setSourceKey(e.target.value)}
            placeholder="pdga_course_ref"
          />
          <p className="text-xs text-muted-foreground">
            Column or import field this value comes from.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-field-help">Help text</Label>
          <Textarea
            id="new-field-help"
            value={help}
            onChange={(e) => setHelp(e.target.value)}
            rows={1}
            className="min-h-9"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!valid || pending}
          onClick={() =>
            onCreate({
              field_key: fieldKey,
              label: label.trim(),
              field_group: group.trim() || "General",
              data_type: dataType,
              source_key: sourceKey.trim() || null,
              help_text: help.trim() || null,
            })
          }
        >
          {pending ? "Adding…" : "Add field"}
        </Button>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  onSave,
  onRemove,
  removing,
}: {
  field: any;
  onSave: (patch: any) => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const [label, setLabel] = useState(field.label);
  const [group, setGroup] = useState(field.field_group);
  const [help, setHelp] = useState(field.help_text ?? "");
  const [dataType, setDataType] = useState<string>(field.data_type);
  const [sourceKey, setSourceKey] = useState(field.source_key ?? "");

  const dirty =
    label !== field.label ||
    group !== field.field_group ||
    dataType !== field.data_type ||
    (sourceKey || null) !== (field.source_key ?? null) ||
    (help || null) !== (field.help_text ?? null);

  return (
    <tr className="border-t">
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-0.5">
          <code className="text-xs">{field.field_key}</code>
          <Badge variant="outline" className="w-fit text-[10px]">
            {field.data_type}
          </Badge>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8" />
      </td>
      <td className="px-3 py-2 align-top">
        <Input value={group} onChange={(e) => setGroup(e.target.value)} className="h-8" />
      </td>
      <td className="px-3 py-2 align-top">
        <TypeSelect value={dataType} onChange={setDataType} />
      </td>
      <td className="px-3 py-2 align-top">
        <Input
          value={sourceKey}
          onChange={(e) => setSourceKey(e.target.value)}
          placeholder="Unmapped"
          className="h-8 min-w-[9rem]"
        />
      </td>
      <td className="px-3 py-2 align-top">
        <Textarea
          value={help}
          onChange={(e) => setHelp(e.target.value)}
          rows={1}
          className="min-h-8"
        />
      </td>
      <td className="px-3 py-2 text-center align-middle">
        <Switch
          checked={field.editable_by_owner}
          onCheckedChange={(v) => onSave({ editable_by_owner: v })}
        />
      </td>
      <td className="px-3 py-2 text-center align-middle">
        <Switch
          checked={field.editable_by_admin}
          onCheckedChange={(v) => onSave({ editable_by_admin: v })}
        />
      </td>
      <td className="px-3 py-2 text-center align-middle">
        <Switch
          checked={field.visible_to_public}
          onCheckedChange={(v) => onSave({ visible_to_public: v })}
        />
      </td>
      <td className="px-3 py-2 text-center align-middle">
        <Switch checked={field.deprecated} onCheckedChange={(v) => onSave({ deprecated: v })} />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant={dirty ? "default" : "ghost"}
            disabled={!dirty}
            onClick={() =>
              onSave({
                label,
                field_group: group,
                data_type: dataType,
                source_key: sourceKey || null,
                help_text: help || null,
              })
            }
          >
            Save
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${field.label}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove “{field.label}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes the registry entry for <code>{field.field_key}</code>. Stored data
                  isn’t touched, but this field will no longer be editable or mapped anywhere. Mark
                  it deprecated instead if you only want to retire it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep field</AlertDialogCancel>
                <AlertDialogAction disabled={removing} onClick={onRemove}>
                  Remove field
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
}
