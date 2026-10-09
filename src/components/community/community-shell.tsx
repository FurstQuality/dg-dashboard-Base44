import type { ReactNode } from "react";
import { PageShell, PageHeader } from "@/components/shell";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Hide the internal shell (title/actions) when a page renders its own hero */
  bare?: boolean;
  /** Hide the generic page Share control when the page has its own create action. */
  shareable?: boolean;
};

/**
 * Shared shell for every Community page.
 * Uses the canonical PageShell + PageHeader so every Community route
 * matches the rest of the app (max-width, gutters, mascot, typography).
 * The Community subnav is rendered once by AppShell for all community paths.
 */
export function CommunityShell({ title, description, actions, children, bare = false, shareable }: Props) {
  return (
    <div className="w-full">
      <PageShell section="community">
        {!bare ? (
          <PageHeader title={title} description={description} primaryAction={actions} shareable={shareable} />
        ) : null}
        {children}
      </PageShell>
    </div>
  );
}
