import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  photoInputSchema,
  udiscInput,
  resolvePhotoUrl,
  storeAvatarFromUrl,
  assertSafeUrl,
  fetchHtml,
  absolutize,
  parseUdiscIdentity,
  parseUdiscPhoto,
  parseOgImage,
} from "@/lib/profile-photo.server";

/**
 * Import a player's profile photo from PDGA, Disc Golf Scene, UDisc, or any
 * public profile URL, and set it as the DG Dashboard avatar. Downloads the image
 * into the user's `avatars` bucket so it stays available even if the source
 * URL rotates.
 */
export const importProfilePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => photoInputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { photoUrl, pageUrl } = await resolvePhotoUrl(data.source, data.value);
    const finalUrl = await storeAvatarFromUrl(supabase, userId, photoUrl, pageUrl, data.source);

    const { error: updErr } = await (
      supabase.from("profiles") as unknown as {
        update: (v: Record<string, string>) => {
          eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update({ avatar_url: finalUrl })
      .eq("id", userId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, source: data.source, avatarUrl: finalUrl };
  });


/**
 * Pull the public account data a UDisc share link exposes (display name,
 * @username, avatar), store the avatar in the user's `avatars` bucket, and
 * link the URL on their DG Dashboard profile.
 */
export const importUdiscProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => udiscInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const pageUrl = data.url.trim();
    if (!/^https?:\/\//i.test(pageUrl)) throw new Error("Paste your full UDisc share link");
    assertSafeUrl(pageUrl);
    const html = await fetchHtml(pageUrl);

    const identity = parseUdiscIdentity(html);
    const photo = parseUdiscPhoto(html) ?? parseOgImage(html);

    let avatarUrl: string | null = null;
    if (photo) {
      avatarUrl = await storeAvatarFromUrl(supabase, userId, absolutize(photo, pageUrl), pageUrl, "udisc");
    }

    const { data: existing } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    const update: Record<string, string> = { udisc_profile_url: pageUrl };
    if (avatarUrl) update.avatar_url = avatarUrl;
    if (identity.displayName && !existing?.display_name) update.display_name = identity.displayName;

    const { error } = await (
      supabase.from("profiles") as unknown as {
        update: (v: Record<string, string>) => {
          eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update(update)
      .eq("id", userId);
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      displayName: identity.displayName,
      username: identity.username,
      avatarUrl,
      photoFound: Boolean(photo),
    };
  });
