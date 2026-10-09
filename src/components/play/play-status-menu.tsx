import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/lib/current-user";
import {
  getMyPlayStatus,
  setPlayAutoStatus,
  setPlayAvailability,
  type PlayAvailabilityStatus,
} from "@/lib/play-status.functions";

type StatusMeta = {
  value: PlayAvailabilityStatus;
  label: string;
  short: string;
  dot: string;
  desc: string;
};

/** Single source of truth for how each play status reads and looks. */
export const PLAY_STATUS_META: StatusMeta[] = [
  {
    value: "looking",
    label: "Looking to play",
    short: "Looking",
    dot: "bg-emerald-500",
    desc: "Friends can see you're up for a round today.",
  },
  {
    value: "maybe",
    label: "Maybe today",
    short: "Maybe",
    dot: "bg-amber-500",
    desc: "You're interested if something comes together.",
  },
  {
    value: "casual_round",
    label: "Casual round in progress",
    short: "Casual round",
    dot: "bg-sky-500",
    desc: "You're out playing a practice or casual round.",
  },
  {
    value: "league_round",
    label: "League in progress",
    short: "League",
    dot: "bg-violet-500",
    desc: "You're playing a league night round.",
  },
  {
    value: "tournament_round",
    label: "Tournament in progress",
    short: "Tournament",
    dot: "bg-yellow-500",
    desc: "You're competing in a sanctioned or club event.",
  },
  {
    value: "practicing",
    label: "Practicing",
    short: "Practicing",
    dot: "bg-teal-500",
    desc: "You're in a putting or field-work session.",
  },
  {
    value: "not_looking",
    label: "Not playing",
    short: "Off",
    dot: "bg-muted-foreground/60",
    desc: "You won't show up as available to friends.",
  },
];

export const playStatusMeta = (status: PlayAvailabilityStatus): StatusMeta =>
  PLAY_STATUS_META.find((m) => m.value === status) ?? PLAY_STATUS_META[PLAY_STATUS_META.length - 1];

export const playStatusKey = (userId?: string) => ["play-status", userId ?? "anon"] as const;

/**
 * Header play status control. Always visible, one tap to change, and it keeps
 * itself in sync with the round the player is currently scoring.
 */
export function PlayStatusMenu({ className }: { className?: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const statusFn = useServerFn(getMyPlayStatus);
  const { data } = useQuery({
    queryKey: playStatusKey(user?.id),
    // Never resolve undefined: the header control must survive an empty
    // response (session still settling) instead of throwing inside Query.
    // A failed status check (e.g. a tab left open across an app update) must
    // never blank the page: fall back to the default and retry next interval.
    queryFn: async () => {
      const fallback = {
        status: "not_looking" as const,
        note: null,
        updated_at: null,
        auto: true,
        auto_round_id: null,
        active_round: null,
      };
      try {
        return (await statusFn()) ?? fallback;
      } catch {
        return fallback;
      }
    },
    throwOnError: false,
    enabled: !!user,
    // The smart resolver runs server-side, so re-check while the app is open.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: playStatusKey(user?.id) });
    queryClient.invalidateQueries({ queryKey: ["play-lobby", user?.id ?? "anon"] });
  };

  const setStatusFn = useServerFn(setPlayAvailability);
  const setStatus = useMutation({
    mutationFn: (status: PlayAvailabilityStatus) =>
      setStatusFn({ data: { status, note: data?.note ?? null, auto: false } }),
    onSuccess: (_r, status) => {
      invalidate();
      toast.success(`Status set to ${playStatusMeta(status).label.toLowerCase()}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAutoFn = useServerFn(setPlayAutoStatus);
  const setAuto = useMutation({
    mutationFn: (auto: boolean) => setAutoFn({ data: { auto } }),
    onSuccess: (_r, auto) => {
      invalidate();
      toast.success(
        auto ? "Status will follow your rounds automatically." : "Automatic status turned off.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;

  const status = data?.status ?? "not_looking";
  const meta = playStatusMeta(status);
  const busy = setStatus.isPending || setAuto.isPending;
  const active = data?.active_round;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label={`Play status: ${meta.label}. Change status`}
              className={
                "h-10 shrink-0 gap-1.5 rounded-full px-2 text-muted-foreground hover:text-foreground " +
                (className ?? "")
              }
            >
              <span aria-hidden className={"h-2.5 w-2.5 rounded-full " + meta.dot} />
              <span className="hidden text-[13px] font-medium leading-none lg:inline">
                {meta.short}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Play status — {meta.label}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Play status
        </DropdownMenuLabel>
        {PLAY_STATUS_META.map((m) => (
          <DropdownMenuItem
            key={m.value}
            onSelect={() => {
              if (m.value !== status || data?.auto) setStatus.mutate(m.value);
            }}
            className="flex items-start gap-2"
          >
            <span aria-hidden className={"mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full " + m.dot} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.desc}</span>
            </span>
            {status === m.value ? <Check className="mt-1 h-4 w-4 shrink-0 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => setAuto.mutate(!data?.auto)}
          className="flex items-start gap-2"
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              {data?.auto ? "Automatic status is on" : "Set my status automatically"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {active
                ? `Now: ${playStatusMeta(active.context).label.toLowerCase()}${active.course_name ? ` at ${active.course_name}` : ""}.`
                : "Tournament, league, and casual rounds set your status while you score, then switch back to looking to play."}
            </span>
          </span>
          {data?.auto ? <Check className="mt-1 h-4 w-4 shrink-0 text-primary" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
