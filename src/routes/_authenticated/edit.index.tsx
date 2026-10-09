import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { EntityEditor } from "@/components/entity-editor/entity-editor";
import { ENTITY_KINDS, ENTITY_LABELS, type EntityKind } from "@/lib/entity-editor.functions";
import { z } from "zod";

// Optional on purpose: opening /edit without a record must explain itself
// rather than throw a raw validation error into the error boundary.
const searchSchema = z.object({
  type: z.enum(ENTITY_KINDS).optional(),
  id: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/edit/")({
  validateSearch: searchSchema,
  component: EditPage,
  head: () => ({
    meta: [
      { title: "Edit record · DG Dashboard" },
      {
        name: "description",
        content:
          "Edit tracked fields on courses, ratings, events, and profiles with full audit history.",
      },
      { property: "og:title", content: "Edit record · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Edit tracked fields on courses, ratings, events, and profiles with full audit history.",
      },
    ],
  }),
});

function EditPage() {
  const { type, id } = Route.useSearch();
  const kind = type as EntityKind | undefined;

  if (!kind || !id) {
    return (
      <PageShell>
        <PageHeader
          title="Edit a record"
          description="Open this editor from the record you want to change — a course, a rating profile, an event, or a profile — so it knows what to load."
          eyebrow="Editor"
        />
        <p className="text-muted-foreground max-w-prose">
          Nothing is selected yet. Head to the course, event, or profile you want to correct and
          choose Edit there. Every change made here is logged and can be reverted.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={`Edit ${ENTITY_LABELS[kind].toLowerCase()}`}
        description="Fields here follow the field registry. Every change is logged and can be reverted."
        eyebrow={ENTITY_LABELS[kind]}
      />
      <EntityEditor entity_type={kind} id={id} />
    </PageShell>
  );
}
