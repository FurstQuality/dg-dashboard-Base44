/**
 * Per-user connector-key storage. SERVER-ONLY.
 * Uses the admin client because the ciphertext column is service-role scoped.
 */
import { encryptConnectionKey, decryptConnectionKey } from "./connection-key-crypto.server";

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw error;
}

export async function getConnectionKeyForUser(
  userId: string,
  connectorId: string,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { connection_key_ciphertext: string } | null;
  return row ? decryptConnectionKey(row.connection_key_ciphertext) : null;
}

export async function deleteConnectionKeyForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
  if (error) throw error;
}

/** Atomically claim one pending OAuth attempt so concurrent callbacks cannot replay it. */
export async function consumeConnectionKeyForUser(userId: string, connectorId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_user_connections")
    .delete().eq("user_id", userId).eq("connector_id", connectorId)
    .select("connection_key_ciphertext").maybeSingle();
  if (error) throw new Error("Could not complete the calendar connection. Please try again.");
  return data ? decryptConnectionKey(data.connection_key_ciphertext) : null;
}

/** A refresh cannot recreate a connection deleted or replaced while it was in flight. */
export async function replaceConnectionKeyForUser(userId: string, connectorId: string, expected: string, next: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_user_connections").select("connection_key_ciphertext")
    .eq("user_id", userId).eq("connector_id", connectorId).maybeSingle();
  if (error || !data || decryptConnectionKey(data.connection_key_ciphertext) !== expected) throw new Error("Calendar connection changed. Please try again.");
  const result = await supabaseAdmin.from("app_user_connections").update({ connection_key_ciphertext: encryptConnectionKey(next), updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("connector_id", connectorId).eq("connection_key_ciphertext", data.connection_key_ciphertext)
    .select("user_id").maybeSingle();
  if (result.error || !result.data) throw new Error("Calendar connection changed. Please try again.");
}
