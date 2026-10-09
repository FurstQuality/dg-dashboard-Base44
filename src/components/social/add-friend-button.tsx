/**
 * One shared "Add friend" button so every place a player shows up can start a
 * connection: the people directory, suggestions, chat, rosters and profiles.
 * It handles the "already connected" and "request already waiting" answers
 * without needing an extra lookup up front.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Clock, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendFriendRequest } from "@/lib/friends.functions";

type State = "idle" | "sending" | "sent" | "pending" | "friends";

export function AddFriendButton({
  userId,
  name,
  isFriend = false,
  size = "sm",
  variant = "outline",
  className,
  onSent,
}: {
  userId: string;
  name?: string | null;
  /** Pass true when the caller already knows they are connected. */
  isFriend?: boolean;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
  onSent?: () => void;
}) {
  const send = useServerFn(sendFriendRequest);
  const [state, setState] = useState<State>(isFriend ? "friends" : "idle");

  if (state === "friends") {
    return (
      <Button size={size} variant="ghost" className={className} disabled>
        <Check className="mr-1 h-3.5 w-3.5" /> Friends
      </Button>
    );
  }

  const label =
    state === "sent" ? "Request sent" : state === "pending" ? "Request waiting" : "Add friend";
  const busy = state === "sending";
  const done = state === "sent" || state === "pending";

  const onClick = async () => {
    setState("sending");
    try {
      const res = await send({ data: { targetId: userId } });
      if (res.kind === "sent") {
        setState("sent");
        toast.success(name ? `Friend request sent to ${name}` : "Friend request sent");
        onSent?.();
        return;
      }
      if (res.status === "accepted") {
        setState("friends");
        toast.info(name ? `You and ${name} are already friends` : "You're already friends");
        return;
      }
      setState("pending");
      toast.info("There's already a request between you two.");
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "That request didn't go through. Try again.");
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={onClick}
      disabled={busy || done}
      aria-label={name ? `Add ${name} as a friend` : "Add friend"}
    >
      {busy ? (
        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
      ) : state === "pending" ? (
        <Clock className="mr-1 h-3.5 w-3.5" />
      ) : state === "sent" ? (
        <Check className="mr-1 h-3.5 w-3.5" />
      ) : (
        <UserPlus className="mr-1 h-3.5 w-3.5" />
      )}
      {label}
    </Button>
  );
}
