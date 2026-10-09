import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import { getMyCreatorProfile } from "@/lib/creator-studio.functions";

type Variant = "banner" | "inline";

/**
 * CreatorCta — small entry point to /studio.
 * - No profile: invites the user to apply as a content creator or ambassador.
 * - Pending: shows review status with a link to studio.
 * - Approved: becomes a "Creator Studio" shortcut.
 */
export function CreatorCta({ variant = "banner" }: { variant?: Variant }) {
  const fetchProfile = useServerFn(getMyCreatorProfile);
  const { data } = useQuery({
    queryKey: ["creator-profile", "me"],
    queryFn: () => fetchProfile(),
    staleTime: 60_000,
  });

  const status = data?.profile?.status as
    | "pending"
    | "approved"
    | "rejected"
    | "revoked"
    | undefined;

  const approved = status === "approved";
  const pending = status === "pending";

  const title = approved
    ? "Creator Studio"
    : pending
      ? "Application under review"
      : "Create content for the sport";
  const body = approved
    ? "Draft posts, plan a series, schedule content, and track reach."
    : pending
      ? "We're reviewing your creator application. You can still open the studio."
      : "Apply to be a content creator or course/club ambassador on DG Dashboard.";
  const cta = approved ? "Open Creator Studio" : pending ? "View application" : "Apply now";
  const Icon = approved ? Sparkles : pending ? Clock : CheckCircle2;

  if (variant === "inline") {
    return (
      <Link
        to="/studio"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Icon className="h-4 w-4" />
        {approved
          ? "Open Creator Studio"
          : pending
            ? "Creator application under review"
            : "Apply to be a content creator or ambassador"}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    );
  }

  return (
    <Link
      to="/studio"
      className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-semibold">{title}</div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{body}</p>
        <div className="mt-1.5 text-xs font-medium text-primary">{cta}</div>
      </div>
    </Link>
  );
}
