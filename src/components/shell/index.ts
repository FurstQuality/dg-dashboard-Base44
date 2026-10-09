/**
 * DG Dashboard shared shell primitives.
 *
 * Every page composes from these. If a page needs a shape that isn't here,
 * add or extend a primitive — don't hand-roll a one-off card on the route.
 */
export { PageShell } from "./page-shell";
export { PageHeader } from "./page-header";
export { StatCard } from "./stat-card";
export { ContentCard } from "./content-card";
export { ListCard, type ListCardItem } from "./list-card";
export { MascotIllustration } from "./mascot-illustration";
export { useRouteAccent, AccentMascotEmblem } from "./route-accent";
export { CoachCallout } from "./coach-callout";
export { MascotEmptyState } from "./mascot-empty-state";
export { SectionPattern, type BrandedSection } from "./section-pattern";
export { LoadingSkeleton } from "./loading-skeleton";
export { ErrorState } from "./error-state";
export { WidgetNote, WidgetSourceNote } from "./widget-note";
export { CollapsibleSection } from "./collapsible-section";
