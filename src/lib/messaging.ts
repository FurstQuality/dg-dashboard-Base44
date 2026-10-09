import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Open or create a 1:1 conversation between the current user and `otherUserId`.
 * Returns the conversation id. Toasts on error.
 */
export async function openDirectConversation(
  currentUserId: string,
  otherUserId: string,
): Promise<string | null> {
  if (currentUserId === otherUserId) {
    toast.error("Can't DM yourself");
    return null;
  }
  try {
    const { data: mine } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", currentUserId);
    const myIds = (mine ?? []).map((m) => m.conversation_id);
    if (myIds.length) {
      const { data: theirs } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", otherUserId)
        .in("conversation_id", myIds);
      const overlap = (theirs ?? []).map((m) => m.conversation_id);
      if (overlap.length) {
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .in("id", overlap)
          .eq("is_group", false)
          .limit(1)
          .maybeSingle();
        if (conv) return conv.id;
      }
    }
    const { data: blockReason } = await supabase.rpc("contact_block_reason", { _target: otherUserId, _kind: "message" });
    if (blockReason) throw new Error(blockReason);
    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({ is_group: false, created_by: currentUserId })
      .select("id")
      .single();
    if (error) throw error;
    const { error: memberError } = await supabase.from("conversation_members").insert([
      { conversation_id: newConv.id, user_id: currentUserId },
      { conversation_id: newConv.id, user_id: otherUserId },
    ]);
    if (memberError) throw new Error(memberError.message);
    return newConv.id;
  } catch (err) {
    toast.error(
      err instanceof Error
        ? err.message
        : "We couldn't open that conversation. Give it another shot.",
    );
    return null;
  }
}

/**
 * Prefill a message body via sessionStorage so the /messages page can pick it
 * up on open. Handy for "Share to messages" flows.
 */
export function stashComposerDraft(convId: string, body: string) {
  try {
    sessionStorage.setItem(`composer:${convId}`, body);
  } catch {
    /* ignore */
  }
}
