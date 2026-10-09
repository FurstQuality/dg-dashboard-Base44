/**
 * Isomorphic, auth-free reads used only to build head metadata (titles,
 * descriptions, JSON-LD) for public routes. Uses the REST endpoint directly so
 * it is safe in SSR loaders as well as in the browser.
 */
const URL_BASE = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;

async function selectOne<T>(table: string, query: string): Promise<T | null> {
  if (!URL_BASE || !KEY) return null;
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?${query}&limit=1`, {
      headers: { apikey: KEY, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as T[];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

export type PostMeta = {
  id: string;
  body: string | null;
  course_name: string | null;
  created_at: string;
  author_id?: string | null;
  author: { username: string | null; display_name: string | null } | null;
};

export async function fetchPostMeta(postId: string): Promise<PostMeta | null> {
  const post = await selectOne<PostMeta>(
    "posts",
    `select=id,body,course_name,created_at,author_id&id=eq.${encodeURIComponent(postId)}`,
  );
  if (!post) return null;
  // posts.author_id has no declared FK to profiles, so the author is a second read.
  const author = post.author_id
    ? await selectOne<{ username: string | null; display_name: string | null }>(
        "profiles",
        `select=username,display_name&id=eq.${encodeURIComponent(post.author_id)}`,
      )
    : null;
  return { ...post, author };
}

export type EventMeta = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  cover_url: string | null;
  entry_fee_cents: number | null;
  pdga_tier: string | null;
};

export async function fetchEventMeta(slug: string): Promise<EventMeta | null> {
  return selectOne<EventMeta>(
    "tournaments",
    `select=id,name,slug,description,start_date,end_date,location,cover_url,entry_fee_cents,pdga_tier&slug=eq.${encodeURIComponent(slug)}`,
  );
}

/** Trim text to a metadata-safe single-line snippet. */
export function snippet(text: string | null | undefined, max = 150): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
