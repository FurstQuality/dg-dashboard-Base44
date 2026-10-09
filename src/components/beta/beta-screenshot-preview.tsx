import { useQuery } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import { betaScreenshotUrl } from "@/lib/beta-screenshot";

/** Shows the annotated screenshot attached to a feedback report, if there is one. */
export function BetaScreenshotPreview({ path }: { path: string | null | undefined }) {
  const { data, isPending } = useQuery({
    queryKey: ["beta", "screenshot", path],
    queryFn: () => betaScreenshotUrl(path!),
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
  });

  if (!path) return null;
  if (isPending) {
    return (
      <div className="mt-2 h-32 w-full max-w-xs animate-pulse rounded-lg border bg-muted" />
    );
  }
  if (!data) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" /> Screenshot attached, but it couldn't be loaded.
      </p>
    );
  }
  return (
    <a
      href={data}
      target="_blank"
      rel="noreferrer"
      className="mt-2 block w-full max-w-xs overflow-hidden rounded-lg border transition-opacity hover:opacity-90"
      title="Open the full screenshot"
    >
      <img src={data} alt="Screenshot attached to this report" className="w-full" loading="lazy" />
    </a>
  );
}
