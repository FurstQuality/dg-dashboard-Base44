import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { entityHref, type EntityKind } from "@/lib/smart-routes";

type Props = {
  /** What kind of thing is being mentioned. */
  kind: EntityKind;
  /** Slug, username, uuid or event ref for that thing. */
  id?: string | number | null;
  /** Visible text. Defaults to children. */
  children?: ReactNode;
  className?: string;
  /** Optional tooltip, e.g. "Open Maple Hill". */
  title?: string;
  onClick?: () => void;
};

/**
 * Inline link for a thing mentioned in copy — a player, course, event, club,
 * round, post. Renders plain text when there's nothing to link to, so a
 * mention never becomes a dead link.
 *
 * Deliberately quiet: no button chrome, no icon. It reads as text and
 * underlines on hover.
 */
export function EntityLink({ kind, id, children, className, title, onClick }: Props) {
  const href = entityHref({ kind, id: id == null ? "" : String(id) });
  const content = children ?? String(id ?? "");
  if (!href) return <span className={className}>{content}</span>;
  return (
    <Link
      to={href as never}
      title={title}
      onClick={onClick}
      className={cn(
        "font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline",
        className,
      )}
    >
      {content}
    </Link>
  );
}
