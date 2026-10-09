/**
 * "Ask to help run this" for players who don't yet have management access.
 * Shows pending state and lets them take the request back.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldPlus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  requestEventAccess,
  withdrawEventAccessRequest,
  type EventAccess,
  type EventKind,
} from "@/lib/event-access.functions";

export function RequestManageButton({
  kind,
  eventId,
  access,
}: {
  kind: EventKind;
  eventId: string;
  access: EventAccess | undefined;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const ask = useServerFn(requestEventAccess);
  const withdraw = useServerFn(withdrawEventAccessRequest);
  const label = kind === "league" ? "league" : "tournament";

  const send = useMutation({
    mutationFn: () => ask({ data: { kind, eventId, message: message.trim() || undefined } }),
    onSuccess: () => {
      setOpen(false);
      setMessage("");
      toast.success(`Request sent — the ${label} director will see it.`);
      qc.invalidateQueries({ queryKey: ["event-access", kind, eventId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pull = useMutation({
    mutationFn: (requestId: string) => withdraw({ data: { requestId } }),
    onSuccess: () => {
      toast.success("Request withdrawn.");
      qc.invalidateQueries({ queryKey: ["event-access", kind, eventId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!access || access.canManage) return null;

  if (access.myRequest) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" /> Request pending
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => pull.mutate(access.myRequest!.id)}
          disabled={pull.isPending}
        >
          Withdraw
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ShieldPlus className="mr-2 h-4 w-4" /> Request to manage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask to help run this {label}</DialogTitle>
          <DialogDescription>
            {access.clubName
              ? `${access.clubName} controls who manages this ${label}. A club admin will review your request.`
              : `The ${label} director will review your request and can give you full management or scorekeeping access.`}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder="Tell them how you'd like to help — scorekeeping, check-in, running divisions…"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending}>
            {send.isPending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
