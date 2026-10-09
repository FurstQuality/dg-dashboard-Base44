import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileClock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { draftTitle, savedAgo, type EventDraftKind } from "@/lib/event-draft-state";
import { deleteEventDraft, listEventDrafts } from "@/lib/event-drafts.functions";

type Props = {
  kind: EventDraftKind;
};

/** Lists saved-but-unpublished setups so a director can pick one back up. */
export function UnfinishedSetups({ kind }: Props) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["event-drafts", kind],
    queryFn: () => listEventDrafts({ data: { kind } }),
  });
  const drafts = data ?? [];

  const discard = useMutation({
    mutationFn: (id: string) => deleteEventDraft({ data: { id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["event-drafts", kind] });
      toast.success("Draft discarded");
    },
    onError: () => toast.error("We couldn't discard that draft. Try again."),
  });

  if (drafts.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <FileClock className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-semibold">Unfinished setups</h2>
        <span className="text-[13px] text-muted-foreground">
          {drafts.length} saved {drafts.length === 1 ? "draft" : "drafts"}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="font-medium">{draftTitle(d)}</div>
              <div className="text-[13px] text-muted-foreground">
                Saved {savedAgo(d.updated_at)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                {kind === "league" ? (
                  <Link to="/director/leagues/new" search={{ draft: d.id }}>
                    Continue setup
                  </Link>
                ) : (
                  <Link to="/director/tournaments/new" search={{ draft: d.id }}>
                    Continue setup
                  </Link>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => discard.mutate(d.id)}
                disabled={discard.isPending}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Discard
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
