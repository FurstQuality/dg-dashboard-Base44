import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ExternalLink, Loader2, MapPin, Search } from "lucide-react";
import { searchDgcr, importDgcrCourse } from "@/lib/dgcr.functions";

type Hit = {
  dgcr_id: string;
  name: string;
  url: string;
  snippet: string | null;
  location: string | null;
  imported: boolean;
};

/**
 * Search Disc Golf Course Review and pull a course profile into the library.
 * Matches an existing course when possible, otherwise adds it for review.
 */
export function DgcrImportDialog({
  courseId,
  trigger,
  onImported,
}: {
  courseId?: string;
  trigger?: React.ReactNode;
  onImported?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);

  const search = useServerFn(searchDgcr);
  const runImport = useServerFn(importDgcrCourse);

  const searchMutation = useMutation({
    mutationFn: async (q: string) => await search({ data: { query: q } }),
    onSuccess: (res) => {
      setHits(res.hits);
      if (res.hits.length === 0)
        toast.info("No matches on Disc Golf Course Review — try adding the city.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importMutation = useMutation({
    mutationFn: async (url: string) =>
      await runImport({ data: { url, courseId: courseId ?? null, createCourse: !courseId } }),
    onSuccess: (res) => {
      const place = [res.profile.city, res.profile.state].filter(Boolean).join(", ");
      const label = place ? `${res.profile.name} (${place})` : res.profile.name;
      toast.success(
        res.createdCourse
          ? `Added ${label} — it's pending review.`
          : `Course review data saved for ${label}.`,
      );

      onImported?.();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Download className="mr-1 h-4 w-4" /> Import course data
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from Disc Golf Course Review</DialogTitle>
          <DialogDescription>
            Search the DGCR library to pull in ratings, hole counts, tee lengths, terrain, and
            course difficulty (SSE) numbers.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim().length >= 2) searchMutation.mutate(query.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Course name and city, e.g. Rogers Lakewood Valparaiso"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={searchMutation.isPending || query.trim().length < 2}>
            {searchMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Search
          </Button>
        </form>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {searchMutation.isPending ? (
            <>
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </>
          ) : null}

          {hits?.map((hit) => (
            <div
              key={hit.dgcr_id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{hit.name}</span>
                  {hit.location ? (
                    <Badge variant="outline" className="font-normal">
                      <MapPin className="mr-1 h-3 w-3" />
                      {hit.location}
                    </Badge>
                  ) : null}
                  {hit.imported ? <Badge variant="secondary">Already imported</Badge> : null}
                </div>
                {!hit.location ? (
                  <p className="text-xs text-muted-foreground">
                    City not listed — open the course page to confirm it&apos;s the right one.
                  </p>
                ) : null}
                {hit.snippet ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{hit.snippet}</p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <a href={hit.url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="h-4 w-4" />
                    <span className="sr-only">Open on Disc Golf Course Review</span>
                  </a>
                </Button>
                <Button
                  size="sm"
                  disabled={importMutation.isPending}
                  onClick={() => importMutation.mutate(hit.url)}
                >
                  {importMutation.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : null}
                  {courseId ? "Link to this course" : "Import"}
                </Button>
              </div>
            </div>
          ))}

          {hits && hits.length === 0 && !searchMutation.isPending ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nothing found yet. Add the city or state to narrow the search.
            </p>
          ) : null}
        </div>

        <DialogFooter className="text-xs text-muted-foreground">
          Data courtesy of dgcoursereview.com. Imported courses stay pending until a reviewer
          approves them.
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
