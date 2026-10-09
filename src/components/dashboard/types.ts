import type { ComponentType, ReactNode } from "react";

export type WidgetSize = "sm" | "md" | "lg" | "full";
export type DashboardMode = "view" | "customize";

export type WidgetContext = {
  mode: DashboardMode;
  size: WidgetSize;
};

export type WidgetDefinition = {
  /** Stable widget id, used as key in prefs. Never rename in-place. */
  id: string;
  /** Human title shown in card header. */
  title: string;
  /** Optional short subtitle rendered under the title. */
  subtitle?: string;
  /** Lucide icon component. */
  icon?: ComponentType<{ className?: string }>;
  /** Widget body renderer. Receives the current size to adapt layout. */
  render: (ctx: WidgetContext) => ReactNode;
  /** Default column footprint. */
  defaultSize: WidgetSize;
  /** Sizes this widget supports (order = order shown in size picker). */
  supportedSizes?: WidgetSize[];
  /** Cannot be hidden. Used for essential surfaces (Composer, Personal Feed, PDGA rating). */
  locked?: boolean;
  /** Optional canonical deep-link. Renders an "Open" chevron in the header. */
  href?: string;
  /** Categorization for the customize tray. */
  category?: string;
  /** When the widget is truly empty, hint text + optional CTA replaces the body. */
  emptyState?: {
    label: string;
    actionLabel?: string;
    actionHref?: string;
  };
  /** Coarse role gate — widget is filtered out entirely if it returns false. */
  requiresAccess?: (access: UserAccess) => boolean;
};

export type WidgetRegistry = Record<string, WidgetDefinition>;

export type DashboardPreset = {
  key: string;
  label: string;
  description: string;
  order: string[];
  hidden?: string[];
  sizes?: Record<string, WidgetSize>;
};

export type DashboardKey = "feed" | "play" | "community" | "statlink" | "profile" | "td" | "club";

export type DashboardDefinition = {
  key: DashboardKey;
  layoutVersion: number;
  defaultOrder: string[];
  defaultHidden?: string[];
  defaultSizes?: Record<string, WidgetSize>;
  presets?: DashboardPreset[];
  /** Optional access predicate — dashboard renders a role gate when false. */
  requiresAccess?: (access: UserAccess) => boolean;
  /** Copy for the access denied panel. */
  accessDenied?: {
    title: string;
    description: string;
    actionLabel?: string;
    actionHref?: string;
  };
};

export type UserAccess = {
  isAuthenticated: boolean;
  isOrganizer: boolean;
  isClubManager: boolean;
  isSuperAdmin: boolean;
};

export type DashboardPrefsRow = {
  widget_order: string[];
  hidden_widgets: string[];
  widget_sizes: Record<string, WidgetSize>;
  preset: string | null;
  layout_version: number;
};
