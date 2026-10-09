import { useEffect, useState } from "react";
import { resignMediaUrl } from "@/lib/post-media";

export type PostMediaItem = { url: string; path: string; type: string };

/**
 * One photo or clip. New posts store only the file location, and older posts
 * carry a link that eventually expires, so the frame resolves a fresh link when
 * there is none and again if a load fails.
 */
function MediaFrame({
  item,
  alt,
  className,
  wrapperClassName,
}: {
  item: PostMediaItem;
  alt: string;
  className: string;
  wrapperClassName: string;
}) {
  const [src, setSrc] = useState<string | null>(item.url || null);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    let active = true;
    setRetried(false);
    if (item.url) {
      setSrc(item.url);
      return () => {
        active = false;
      };
    }
    setSrc(null);
    void resignMediaUrl(item.path).then((fresh) => {
      if (active && fresh) setSrc(fresh);
    });
    return () => {
      active = false;
    };
  }, [item.url, item.path]);

  async function refresh() {
    if (retried || !item.path) return;
    setRetried(true);
    const fresh = await resignMediaUrl(item.path);
    if (fresh) setSrc(fresh);
  }

  const frame =
    src === null ? (
      <div className={className + " animate-pulse bg-muted/40"} aria-hidden />
    ) : item.type?.startsWith("video") ? (
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className={className}
        onError={() => void refresh()}
      />
    ) : (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
        onError={() => void refresh()}
      />
    );

  if (!src) return <div className={wrapperClassName}>{frame}</div>;
  return (
    <a href={src} target="_blank" rel="noreferrer" className={wrapperClassName}>
      {frame}
    </a>
  );
}

/** Photo/video block for a feed post: one full-width frame, or a 2-up grid. */
export function PostMedia({ media, authorName }: { media: PostMediaItem[]; authorName: string }) {
  if (media.length === 0) return null;

  if (media.length === 1) {
    return (
      <MediaFrame
        item={media[0]}
        alt={`Disc golf photo shared by ${authorName}`}
        className="mx-auto block max-h-[80vh] w-full object-contain"
        wrapperClassName="block bg-black"
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-0.5 bg-black">
      {media.slice(0, 4).map((m, i) => (
        <MediaFrame
          key={m.path + i}
          item={m}
          alt={`Disc golf photo ${i + 1} shared by ${authorName}`}
          className="aspect-square w-full object-cover"
          wrapperClassName="block"
        />
      ))}
    </div>
  );
}
