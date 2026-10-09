import { EntityLink } from "@/components/smart/entity-link";

/** Matches @username, #hashtag, and bare http(s) links. */
const TOKEN = /(@[a-z0-9_.]{2,30}|#[a-z0-9_]{2,40}|https?:\/\/[^\s<]+)/gi;

export function extractMentions(body: string | null | undefined): string[] {
  if (!body) return [];
  const out = new Set<string>();
  for (const m of body.matchAll(/@([a-z0-9_.]{2,30})/gi)) {
    out.add(m[1].toLowerCase().replace(/[.]+$/, ""));
  }
  return [...out];
}

export function extractHashtags(body: string | null | undefined): string[] {
  if (!body) return [];
  const out = new Set<string>();
  for (const m of body.matchAll(/#([a-z0-9_]{2,40})/gi)) out.add(m[1].toLowerCase());
  return [...out];
}

/**
 * Renders post/comment text with player mentions, hashtags, and links made tappable.
 * Everything else stays literal text so nothing a player types can inject markup.
 */
export function PostBody({ body, className }: { body: string | null; className?: string }) {
  if (!body) return null;
  const parts = body.split(TOKEN);

  return (
    <div className={className ?? "px-4 pb-3 text-sm leading-relaxed whitespace-pre-wrap"}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("@")) {
          const username = part.slice(1).replace(/[.]+$/, "");
          return (
            <EntityLink
              key={i}
              kind="player"
              id={username}
              title={`Open @${username}'s profile`}
              className="font-medium text-primary hover:underline"
            >
              @{username}
            </EntityLink>
          );
        }
        if (part.startsWith("#")) {
          const tag = part.slice(1).toLowerCase();
          return (
            <EntityLink
              key={i}
              kind="tag"
              id={tag}
              title={`See posts tagged #${tag}`}
              className="font-medium text-accent hover:underline"
            >
              #{part.slice(1)}
            </EntityLink>
          );
        }
        if (/^https?:\/\//i.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {part.replace(/^https?:\/\//, "")}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}
