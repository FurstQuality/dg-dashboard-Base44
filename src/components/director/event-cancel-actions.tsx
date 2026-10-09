import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { changeEventLifecycle, type CancellableKind } from "@/lib/event-cancel.functions";

interface Props {
  kind: CancellableKind;
  id: string;
  name: string;
  cancelled: boolean;
  onChanged?: () => void;
}

/** Cancel / restore / delete controls for an event the viewer hosts. */
export function EventCancelActions({ kind, id, name, cancelled, onChanged }: Props) {
  const run = useServerFn(changeEventLifecycle);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const noun = { tournament: "tournament", league: "league", series: "series", community: "event" }[kind];

  async function act(action: "cancel" | "restore" | "delete") {
    setBusy(true);
    try {
      await run({ data: { kind, id, action } });
      if (action === "delete") {
        toast.success(`${name} was deleted.`);
        void navigate({
          to:
            kind === "tournament"
              ? "/director/tournaments"
              : kind === "league"
                ? "/director/leagues"
                : kind === "series"
                  ? "/director/series"
                  : "/community/events",
        });
      } else {
        toast.success(action === "cancel" ? `${name} is cancelled.` : `${name} is back on.`);
        onChanged?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {cancelled ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act("restore")}>
          <RotateCcw className="mr-1 h-4 w-4" /> Restore {noun}
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              <Ban className="mr-1 h-4 w-4" /> Cancel {noun}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel {name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Players will see it as cancelled. Registrations, results and history stay saved, and
                you can restore it later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep event</AlertDialogCancel>
              <AlertDialogAction onClick={() => act("cancel")}>Cancel {noun}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <AlertDialog onOpenChange={() => setConfirmText("")}>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="destructive" disabled={busy}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {noun}, its sign-ups and schedule for good. To keep its history,
              cancel it instead. Type the event name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={name}
            aria-label="Event name"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep event</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText.trim() !== name.trim()}
              onClick={() => act("delete")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
