import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { navMascotFor, navThemeFor, resolveNavAccent } from "@/lib/nav-theme";
import { useTheme } from "@/lib/theme-context";

/** DOM id of the slot PageHeader renders directly beneath the page title. */
export const HEADER_NAV_SLOT_ID = "page-header-nav-slot";

/**
 * Renders section navigation into the slot beneath the page title/mascot so
 * the sticky pill row never sits above the page header. Falls back to
 * rendering in place when a route has no PageHeader.
 */
export function HeaderNavSlot({ children }: { children: ReactNode }) {
  return <HeaderPortalSlot slotId={HEADER_NAV_SLOT_ID}>{children}</HeaderPortalSlot>;
}

/** DOM id of the slot PageHeader renders to the right of the page title. */
export const HEADER_ASIDE_SLOT_ID = "page-header-aside-slot";

/** Renders content into the header row, right of the page title/description. */
export function HeaderAsideSlot({ children }: { children: ReactNode }) {
  return <HeaderPortalSlot slotId={HEADER_ASIDE_SLOT_ID}>{children}</HeaderPortalSlot>;
}

function HeaderPortalSlot({ slotId, children }: { slotId: string; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // The page header can mount after this component (suspended route content,
    // late hydration), and it remounts on navigation — so watch the DOM instead
    // of looking the slot up once, otherwise the nav portals into a detached
    // node and the section buttons disappear.
    const sync = () => {
      const next = document.getElementById(slotId);
      setSlot((prev) => (prev === next ? prev : next));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, slotId]);

  if (slot) return createPortal(children, slot);
  return <>{children}</>;
}

export type HubTab = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Additional path prefixes that mark this tab active (e.g. detail routes). */
  match?: string[];
  /** Optional numeric badge (unread count, etc.). */
  badge?: number;
  /** Match `to` exactly instead of prefix-matching. */
  exact?: boolean;
  /** One-line explanation shown inside the large nav card. */
  description?: string;
  /** Consolidated child destinations, shown as a compact pill row when active. */
  sub?: { to: string; label: string; match?: string[] }[];
};

/**
 * Section navigation shared across every hub (Play, Community, StatLink,
 * Profile, Data). Renders large tappable cards with an icon, label, and a
 * short description of what lives behind each destination.
 *
 * Tab state IS the URL, so tabs are bookmarkable and back-button safe.
 */
/** Shared pill styling so every section nav (including StatLink) matches. */
export function hubTabClass(active: boolean): string {
  return (
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors " +
    (active
      ? "border-[color-mix(in_oklab,var(--nav-accent,var(--primary))_70%,transparent)] bg-[color-mix(in_oklab,var(--nav-accent,var(--primary))_18%,transparent)] text-[var(--nav-accent,var(--primary))] glow-ring"
      : "border-border bg-card text-foreground/80 hover:text-foreground glow-ring-hover")
  );
}

/** Shared card styling for large section navigation buttons. */
export function hubCardClass(active: boolean): string {
  return (
    "group relative flex h-full min-h-[56px] min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-2.5 text-left transition-all duration-200 surface-accent glow-ring-hover sm:gap-2.5 sm:px-3 " +
    (active
      ? "glow-ring bg-card"
      : "border-[color-mix(in_oklab,var(--nav-accent)_35%,transparent)] bg-card")
  );
}

/** Responsive grid wrapper so every section nav lays cards out identically. */
export function HubCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={className ?? "grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"}
    >
      {children}
    </div>
  );
}

type HubNavCardProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  badge?: number;
  active: boolean;
  /** Route target — renders a Link. Omit and pass onClick for in-page tabs. */
  to?: string;
  search?: Record<string, unknown>;
  onClick?: () => void;
  /** Override the color/mascot theme (defaults to the theme for `to`). */
  themePath?: string;
  /** Extra classes, e.g. grid column spans. */
  className?: string;
  /** Drop the description and shrink padding to save vertical space. */
  compact?: boolean;
  /** Flex basis used by the compact wrapping row layout. */
  flexBasis?: string;
};

/** Large section navigation button: emblem, icon, label, badge + description. */
export function HubNavCard({
  icon: Icon,
  label,
  description,
  badge,
  active,
  to,
  search,
  onClick,
  themePath,
  className,
  compact,
  flexBasis,
}: HubNavCardProps) {
  const path = themePath ?? to ?? "";
  const { navColorMode } = useTheme();
  const accent = resolveNavAccent(navThemeFor(path).accent, navColorMode);
  const emblem = navMascotFor(path);
  const cardClass =
    hubCardClass(active) +
    (compact ? " min-h-0 gap-2 px-2 py-1.5 sm:gap-2 sm:px-2.5" : "") +
    (className ? " " + className : "");
  const style = {
    ["--nav-accent" as string]: accent,
    ...(flexBasis ? { flexBasis } : {}),
  } as CSSProperties;

  const body = (
    <>
      {/* Accent wash — color-codes the destination at a glance. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,color-mix(in_oklab,var(--nav-accent)_18%,transparent),transparent_65%)] opacity-80"
      />
      {/* Left accent rail keeps the color readable even in mono mode. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[var(--nav-accent)] opacity-70"
      />
      {/* Mascot emblem watermark — identifies the destination at a glance. */}
      <img
        src={emblem.url}
        alt=""
        aria-hidden
        draggable={false}
        loading="lazy"
        className={
          "pointer-events-none absolute -bottom-1.5 -right-1 select-none object-contain opacity-30 sm:opacity-45 drop-shadow-[0_2px_8px_color-mix(in_oklab,var(--nav-accent)_45%,transparent)] transition-all duration-200 group-hover:scale-105 group-hover:opacity-70 " +
          (compact ? "h-6 w-6 sm:h-7 sm:w-7" : "h-7 w-7 sm:h-9 sm:w-9")
        }
      />
      <span
        className={
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border text-[var(--nav-accent)] shadow-[0_0_12px_color-mix(in_oklab,var(--nav-accent)_35%,transparent)] " +
          (compact ? "h-6 w-6 " : "h-8 w-8 ") +
          (active
            ? "border-[color-mix(in_oklab,var(--nav-accent)_70%,transparent)] bg-[color-mix(in_oklab,var(--nav-accent)_26%,transparent)]"
            : "border-[color-mix(in_oklab,var(--nav-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--nav-accent)_14%,transparent)]")
        }
      >
        <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </span>

      <span className={"relative min-w-0 flex-1 " + (compact ? "pr-5" : "pr-1 sm:pr-4")}>
        <span className="flex items-start gap-2">
          <span
            className={
              "min-w-0 hyphens-none [overflow-wrap:normal] font-semibold leading-tight " +
              (compact ? "text-[13px] " : "text-[15px] ") +
              (active ? "text-[var(--nav-accent)]" : "text-foreground")
            }
          >
            {label}
          </span>
          {badge && badge > 0 ? (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--nav-accent)] px-1 text-[10px] font-semibold text-background">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </span>
        {description && !compact ? (
          <span className="mt-1 line-clamp-1 block text-[12px] leading-snug text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        search={search as never}
        aria-current={active ? "page" : undefined}
        className={cardClass}
        style={style}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cardClass}
      style={style}
    >
      {body}
    </button>
  );
}

const FIVE_UP_GRID = "grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6";

/** Eight links read best as a uniform 4x2 block that fills the page width. */
const FOUR_UP_GRID = "grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4";

/**
 * Consolidated sections read best as tight rows of small buttons that grow to
 * fill the width, so a trailing partial row still lines up edge to edge.
 */
const COMPACT_GRID = "flex flex-wrap gap-1.5";
const COMPACT_ITEM = "min-w-[130px] flex-1 grow";

export function HubTabs({
  tabs,
  label,
  compact,
}: {
  tabs: HubTab[];
  label?: string;
  /** Hide card descriptions — use when a section has many destinations. */
  compact?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string, match?: string[], exact?: boolean) => {
    const matches = match ?? [to];
    return exact
      ? pathname === to
      : matches.some((m) => pathname === m || pathname.startsWith(m + "/"));
  };
  // Five links read best as a 3-over-2 row pair that fills the full width.
  const fiveUp = tabs.length === 5 && !compact;
  const fourUp = tabs.length === 8 && !compact;
  // Compact rows keep every button the same width and fill the row edge to
  // edge, so a trailing partial row lines up with the row above it. With only
  // two or three destinations, stretching them edge to edge makes each button
  // half the page wide — keep those at a natural button size instead.
  const fewCompact = Boolean(compact) && tabs.length <= 3;
  const perRow =
    compact && !fewCompact
      ? tabs.length <= 5
        ? Math.max(tabs.length, 1)
        : Math.min(5, Math.ceil(tabs.length / 2))
      : 0;
  const compactBasis = perRow ? `calc(${(100 / perRow).toFixed(4)}% - 0.5rem)` : undefined;
  const activeTab = tabs.find((t) => isActive(t.to, t.match, t.exact));
  const subs = activeTab?.sub ?? [];
  return (
    <HeaderNavSlot>
      <nav aria-label={label ?? "Section"} className="mb-4">
        {/* Phones: a tight wrapping row of small chips instead of tall cards. */}
        <div className="flex flex-wrap gap-1.5 sm:hidden">
          {tabs.map((t) => {
            const on = isActive(t.to, t.match, t.exact);
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-current={on ? "page" : undefined}
                className={hubTabClass(on) + " inline-flex min-h-8 items-center gap-1 px-2.5 py-1 text-[13px]"}
              >
                <t.icon className="h-3.5 w-3.5" aria-hidden />
                {t.label}
                {t.badge && t.badge > 0 ? (
                  <span className="ml-0.5 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {t.badge > 99 ? "99+" : t.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
        <div className="hidden sm:block">
        <HubCardGrid
          className={
            fiveUp ? FIVE_UP_GRID : fourUp ? FOUR_UP_GRID : compact ? COMPACT_GRID : undefined
          }
        >
          {tabs.map((t, i) => (
            <HubNavCard
              key={t.to}
              to={t.to}
              icon={t.icon}
              label={t.label}
              description={t.description}
              badge={t.badge}
              active={isActive(t.to, t.match, t.exact)}
              compact={compact}
              flexBasis={compact ? compactBasis : undefined}
              className={
                compact
                  ? fewCompact
                    ? "min-w-[150px] shrink-0 grow-0"
                    : COMPACT_ITEM
                  : fiveUp
                    ? i < 2
                      ? "lg:col-span-3"
                      : "lg:col-span-2"
                    : undefined
              }
            />
          ))}
        </HubCardGrid>
        </div>

        {subs.length > 1 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {subs.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                aria-current={isActive(s.to, s.match) ? "page" : undefined}
                className={hubTabClass(isActive(s.to, s.match)) + " px-3 py-1.5 text-[13px]"}
              >
                {s.label}
              </Link>
            ))}
          </div>
        ) : null}
      </nav>
    </HeaderNavSlot>
  );
}
