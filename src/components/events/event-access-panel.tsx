/**
 * Access panel for a league or tournament: who manages it, who's asking,
 * and (for whoever controls permissions) the approve / decline / remove actions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Check, Crown, ShieldCheck, UserMinus, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  decideEventAccessRequest,
  getEventAccess,
  removeEventManager,
  setEventManager,
  type EventAccess,
  type EventAccessLevel,
  type EventKind,
} from "@/lib/event-access.functions";

export function eventAccessQueryKey(kind: EventKind, eventId: string) {
  return ["event-access", kind, eventId] as const;
}

export function useEventAccess(kind: EventKind, eventId: string | undefined) {
  const load = useServerFn(getEventAccess);
  return useQuery({
    queryKey: eventAccessQueryKey(kind, eventId ?? "none"),
    enabled: !!eventId,
    queryFn: () => load({ data: { kind, eventId: eventId! } }) as Promise<EventAccess>,
    staleTime: 30_000,
  });
}

function Person({
  name,
  username,
  avatarUrl,
}: {
  name: string;
  username: string | null;
  avatarUrl: string | null;
}) {
  const initials = name.slice(0, 2).toUpperCase();
  const body = (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar className="h-8 w-8">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <span className="truncate font-medium">{name}</span>
    </span>
  );
  return username ? (
    <Link to="/players/$username" params={{ username }} className="min-w-0 hover:text-primary">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EventAccessPanel({ kind, eventId }: { kind: EventKind; eventId: string }) {
  const qc = useQueryClient();
  const { data: access, isLoading } = useEventAccess(kind, eventId);
  const decide = useServerFn(decideEventAccessRequest);
  const setLevel = useServerFn(setEventManager);
  const remove = useServerFn(removeEventManager);
  const label = kind === "league" ? "league" : "tournament";

  const refresh = () => qc.invalidateQueries({ queryKey: eventAccessQueryKey(kind, eventId) });

  const answer = useMutation({
    mutationFn: (v: { requestId: string; approve: boolean; accessLevel?: EventAccessLevel }) =>
      decide({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.approve ? "Access granted." : "Request declined.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeLevel = useMutation({
    mutationFn: (v: { userId: string; accessLevel: EventAccessLevel }) =>
      setLevel({ data: { kind, eventId, ...v } }),
    onSuccess: () => {
      toast.success("Access updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const drop = useMutation({
    mutationFn: (managerId: string) => remove({ data: { managerId } }),
    onSuccess: () => {
      toast.success("Manager removed.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !access) return null;
  if (!access.canManage) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Who can manage this {label}
        </CardTitle>
        <CardDescription>
          {access.clubName ? (
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />
              {access.clubName} owns this {label}, so its club owner and admins decide who can make
              changes.
            </span>
          ) : access.isController ? (
            `You created this ${label}, so you decide who can make changes. Assign it to a club and the club's admins take over access.`
          ) : (
            `You can make changes to this ${label}. The director decides who else gets access.`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 text-sm font-medium">Managers</div>
          <ul className="space-y-2">
            {access.managers.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-2.5"
              >
                <Person name={m.displayName} username={m.username} avatarUrl={m.avatarUrl} />
                <div className="flex items-center gap-2">
                  {m.isOwner ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-medium text-primary">
                      <Crown className="h-4 w-4" /> Created this {label}
                    </span>
                  ) : (
                    <>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm">
                        {m.accessLevel === "manage" ? "Full management" : "Scorekeeping only"}
                      </span>
                      {access.isController ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              changeLevel.mutate({
                                userId: m.userId,
                                accessLevel: m.accessLevel === "manage" ? "score" : "manage",
                              })
                            }
                            disabled={changeLevel.isPending}
                          >
                            {m.accessLevel === "manage" ? "Limit to scoring" : "Give full access"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => drop.mutate(m.id)}
                            disabled={drop.isPending}
                            aria-label={`Remove ${m.displayName}`}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {access.isController ? (
          <div>
            <div className="mb-2 text-sm font-medium">
              Requests to help {access.requests.length ? `(${access.requests.length})` : ""}
            </div>
            {access.requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody's asked to help run this {label} yet. Players can request access from the{" "}
                {label} page.
              </p>
            ) : (
              <ul className="space-y-2">
                {access.requests.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border/60 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Person name={r.displayName} username={r.username} avatarUrl={r.avatarUrl} />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            answer.mutate({ requestId: r.id, approve: true, accessLevel: "manage" })
                          }
                          disabled={answer.isPending}
                        >
                          <Check className="mr-1.5 h-4 w-4" /> Full access
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            answer.mutate({ requestId: r.id, approve: true, accessLevel: "score" })
                          }
                          disabled={answer.isPending}
                        >
                          Scoring only
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => answer.mutate({ requestId: r.id, approve: false })}
                          disabled={answer.isPending}
                          aria-label={`Decline ${r.displayName}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {r.message ? (
                      <p className="mt-1.5 text-sm text-muted-foreground">“{r.message}”</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
