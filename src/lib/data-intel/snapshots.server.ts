/**
 * Write path for the unified raw snapshot store. Every adapter calls this
 * after a successful fetch; identical content (same hash) is stored once.
 */
export type SnapshotInput = {
  source: string;
  entityType: string;
  externalId: string;
  sourceUrl?: string | null;
  payload: unknown;
  parserVersion?: string | null;
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function recordSnapshot(input: SnapshotInput): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const content_hash = await sha256(JSON.stringify(input.payload));
  const row = {
    source: input.source,
    entity_type: input.entityType,
    external_id: input.externalId,
    source_url: input.sourceUrl ?? null,
    payload: input.payload as never,
    parser_version: input.parserVersion ?? null,
    content_hash,
  };
  const { data } = await supabaseAdmin
    .from("source_snapshots")
    .upsert(row, { onConflict: "source,entity_type,external_id,content_hash", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (data?.id) return data.id;
  // An identical import is still a valid archived source. Reuse its immutable
  // snapshot rather than making retries look like a missing archive.
  const {data: existing} = await supabaseAdmin.from("source_snapshots").select("id")
    .eq("source",input.source).eq("entity_type",input.entityType).eq("external_id",input.externalId).eq("content_hash",content_hash).maybeSingle();
  return existing?.id ?? null;
}

/** Record one field value from a source; the DB supersedes the previous one. Skips unchanged values. */
export async function recordObservation(o: {
  entityType: string; entityId: string; field: string; source: string;
  value: unknown; snapshotId?: string | null; parserVersion?: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cur } = await supabaseAdmin
    .from("field_observations").select("value")
    .eq("entity_type", o.entityType).eq("entity_id", o.entityId).eq("field", o.field)
    .eq("source", o.source).is("superseded_at", null).maybeSingle();
  if (cur && JSON.stringify(cur.value) === JSON.stringify(o.value)) return;
  await supabaseAdmin.from("field_observations").insert({
    entity_type: o.entityType, entity_id: o.entityId, field: o.field, source: o.source,
    value: o.value as never, snapshot_id: o.snapshotId ?? null, parser_version: o.parserVersion ?? null,
  });
}
