import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type PlayerLinkProps = {
  username?: string | null;
  userId?: string | null;
  pdgaNumber?: number | string | null;
  className?: string;
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
};

/**
 * Renders a player name as a link to their profile page.
 * Prefers username -> /u/$username, falls back to /me for current user
 * or the PDGA profile deep-link when only a PDGA number is available.
 * If nothing resolves, renders plain text (never a broken link).
 */
export function PlayerLink({
  username,
  userId,
  pdgaNumber,
  className,
  children,
  onClick,
  title,
}: PlayerLinkProps) {
  const linkClass = cn(
    "text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors",
    className,
  );

  if (username) {
    return (
      <Link
        to="/u/$username"
        params={{ username }}
        className={linkClass}
        onClick={onClick}
        title={title}
      >
        {children}
      </Link>
    );
  }
  if (userId) {
    return (
      <Link
        to="/u/$username"
        params={{ username: userId }}
        className={linkClass}
        onClick={onClick}
        title={title}
      >
        {children}
      </Link>
    );
  }
  if (pdgaNumber) {
    return (
      <a
        href={`https://www.pdga.com/player/${pdgaNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onClick={onClick}
        title={title ?? `View PDGA #${pdgaNumber} profile`}
      >
        {children}
      </a>
    );
  }
  return (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

type EventKind = "tournament" | "league" | "community" | "pdga" | "public";
type EventLinkProps = {
  kind?: EventKind;
  slug?: string | null;
  id?: string | null;
  pdgaEventRef?: string | number | null;
  className?: string;
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
};

/**
 * Renders an event/tournament/league name as a link to its detail page.
 * kind defaults to "tournament".
 */
export function EventLink({
  kind = "tournament",
  slug,
  id,
  pdgaEventRef,
  className,
  children,
  onClick,
  title,
}: EventLinkProps) {
  const linkClass = cn(
    "font-medium text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors",
    className,
  );

  if (kind === "pdga" && pdgaEventRef) {
    return (
      <Link
        to="/events/pdga/$eventRef"
        params={{ eventRef: String(pdgaEventRef) }}
        className={linkClass}
        onClick={onClick}
        title={title}
      >
        {children}
      </Link>
    );
  }
  if (kind === "league" && slug) {
    return (
      <Link
        to="/leagues/$slug"
        params={{ slug }}
        className={linkClass}
        onClick={onClick}
        title={title}
      >
        {children}
      </Link>
    );
  }
  if (kind === "community" && id) {
    return (
      <Link
        to="/community/$eventId"
        params={{ eventId: id }}
        className={linkClass}
        onClick={onClick}
        title={title}
      >
        {children}
      </Link>
    );
  }
  if (kind === "public" && slug) {
    return (
      <Link to="/e/$slug" params={{ slug }} className={linkClass} onClick={onClick} title={title}>
        {children}
      </Link>
    );
  }
  // tournament default
  if (slug) {
    return (
      <Link
        to="/tournaments/$slug"
        params={{ slug }}
        className={linkClass}
        onClick={onClick}
        title={title}
      >
        {children}
      </Link>
    );
  }
  return (
    <span className={className} title={title}>
      {children}
    </span>
  );
}
