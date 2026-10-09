import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { selfCheckIn } from "@/lib/checkin.functions";
import { hapticTap } from "@/lib/haptics";
import { playerPassKey } from "@/components/events/player-pass";

type Props = {
  target: { kind: "tournament" | "league_event"; id: string };
  /** Hide the control entirely when the viewer isn't registered. */
  registered: boolean;
  alreadyCheckedIn?: boolean;
  size?: "sm" | "default";
  onDone?: () => void;
};

/** Lets a registered player check themselves in when the window is open. */
export function SelfCheckInButton({
  target,
  registered,
  alreadyCheckedIn = false,
  size = "default",
  onDone,
}: Props) {
  const run = useServerFn(selfCheckIn);
  const queryClient = useQueryClient();
  const [done, setDone] = useState(alreadyCheckedIn);

  const mutation = useMutation({
    mutationFn: () => run({ data: target }),
    onSuccess: (result) => {
      if (result.outcome === "checked_in" || result.outcome === "already") {
        setDone(true);
        hapticTap([10, 40, 18]);
        toast.success(
          result.outcome === "already" ? "You're already checked in." : "You're checked in!",
        );
      } else {
        toast.error(result.message);
      }
      queryClient.invalidateQueries({ queryKey: playerPassKey });
      onDone?.();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't check you in just yet."),
  });

  if (!registered) return null;

  return (
    <Button
      size={size}
      variant={done ? "outline" : "default"}
      disabled={done || mutation.isPending}
      className={done ? "dg-success-pop" : undefined}
      onClick={() => mutation.mutate()}
    >
      <CheckCircle2 className="mr-1.5 h-4 w-4" />
      {done ? "Checked in" : "Check in"}
    </Button>
  );
}
