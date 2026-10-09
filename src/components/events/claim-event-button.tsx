/**
 * "Are you the organizer?" for imported events nobody manages yet. Filing a claim
 * never grants access — a platform admin checks the evidence and approves it.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

export function ClaimEventButton({ tournamentId, userId }: { tournamentId: string; userId: string | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState("");
  const key = ["event-claim", tournamentId, userId];

  const mine = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("event_claim_requests")
        .select("id, status, review_note")
        .eq("tournament_id", tournamentId)
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("event_claim_requests")
        .insert({ tournament_id: tournamentId, user_id: userId!, evidence: evidence.trim() });
      if (error) throw new Error("Your claim didn't go through. Try again in a moment.");
    },
    onSuccess: () => {
      setOpen(false);
      setEvidence("");
      toast.success("Claim sent. We'll check it and let you know.");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!userId) return null;
  if (mine.data?.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" /> Organizer claim under review
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <BadgeCheck className="mr-2 h-4 w-4" /> Are you the organizer? Claim event
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Claim this event</DialogTitle>
          <DialogDescription>
            This event came from another site, so nobody runs it here yet. Tell us how we can confirm you organized it —
            your Disc Golf Scene or PDGA director listing, the club you ran it for, or someone who can vouch for you.
            "I ran this" on its own isn't enough.
          </DialogDescription>
        </DialogHeader>
        {mine.data?.status === "rejected" ? (
          <p className="text-sm text-muted-foreground">
            Your last claim wasn't approved{mine.data.review_note ? `: ${mine.data.review_note}` : "."} You can send a new one with more detail.
          </p>
        ) : null}
        <Textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="Link to your director listing, the club name, and how to reach you"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending || evidence.trim().length < 10}>
            {send.isPending ? "Sending…" : "Send claim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
