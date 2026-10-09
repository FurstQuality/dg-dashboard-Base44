/**
 * One shared "Add to tracker" control used everywhere a player shows up.
 * Instead of always dropping people into the first crew, it opens a short menu
 * of the viewer's trackers so a player can be added to any of them, and offers
 * to start a brand new tracker on the spot.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  addFriendToTracker,
  createTrackerGroup,
  listTrackerGroupOptions,
} from "@/lib/tracker.functions";

export function AddToTrackerButton({
  userId,
  name,
  size = "sm",
  variant = "outline",
  className,
}: {
  userId: string;
  name?: string | null;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "secondary";
  className?: string;
}) {
  const who = name?.trim() || "That player";
  const queryClient = useQueryClient();
  const listFn = useServerFn(listTrackerGroupOptions);
  const addFn = useServerFn(addFriendToTracker);
  const createFn = useServerFn(createTrackerGroup);

  const [open, setOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [addedTo, setAddedTo] = useState<string[]>([]);

  const groups = useQuery({
    queryKey: ["tracker-group-options"],
    queryFn: () => listFn(),
    enabled: open,
    staleTime: 60_000,
  });

  const add = useMutation({
    mutationFn: (groupId: string | null) => addFn({ data: { user_id: userId, group_id: groupId } }),
    onSuccess: (res) => {
      if (!res.group_id) {
        toast.info(`${who} hasn't added a PDGA number yet, so there's nothing to follow yet.`);
        return;
      }
      const label = res.group_name ?? "your tracker";
      const groupId = res.group_id;
      setAddedTo((prev) => (prev.includes(groupId) ? prev : [...prev, groupId]));
      toast[res.duplicate ? "info" : "success"](
        res.duplicate ? `${who} is already in ${label}.` : `Added ${who} to ${label}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["tracker-groups"] });
      void queryClient.invalidateQueries({ queryKey: ["tracker-group-options"] });
    },
    onError: (e: Error) =>
      toast.error(e.message || "Couldn't add that player to your tracker just yet."),
  });

  const createAndAdd = useMutation({
    mutationFn: async (label: string) => {
      const group = await createFn({ data: { name: label } });
      return addFn({ data: { user_id: userId, group_id: group.id } });
    },
    onSuccess: (res) => {
      setNewOpen(false);
      setNewName("");
      if (!res.group_id) {
        toast.info(`${who} hasn't added a PDGA number yet, so there's nothing to follow yet.`);
        return;
      }
      const groupId = res.group_id;
      setAddedTo((prev) => (prev.includes(groupId) ? prev : [...prev, groupId]));
      toast.success(`Started ${res.group_name} and added ${who}.`);
      void queryClient.invalidateQueries({ queryKey: ["tracker-groups"] });
      void queryClient.invalidateQueries({ queryKey: ["tracker-group-options"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't start that tracker."),
  });

  const busy = add.isPending || createAndAdd.isPending;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button size={size} variant={variant} disabled={busy} className={className}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Target className="mr-1.5 h-3.5 w-3.5" />
            )}
            {addedTo.length ? "Add to another tracker" : "Add to tracker"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Add {who} to</DropdownMenuLabel>
          {groups.isLoading ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">Loading your trackers…</div>
          ) : null}
          {!groups.isLoading && !(groups.data ?? []).length ? (
            <DropdownMenuItem onSelect={() => add.mutate(null)}>
              <Target className="mr-2 h-4 w-4" /> All-time crew (new)
            </DropdownMenuItem>
          ) : null}
          {(groups.data ?? []).map((g) => (
            <DropdownMenuItem key={g.id} onSelect={() => add.mutate(g.id)}>
              {addedTo.includes(g.id) ? (
                <Check className="mr-2 h-4 w-4 text-primary" />
              ) : (
                <Target className="mr-2 h-4 w-4" />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{g.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {g.is_all_time
                    ? "Always on"
                    : g.trip_start || g.trip_end
                      ? `${g.trip_start ?? "?"} – ${g.trip_end ?? "?"}`
                      : "Temporary crew"}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setNewOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> New tracker…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a new tracker</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            placeholder="Weekend crew, Pro tour watchlist…"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) createAndAdd.mutate(newName.trim());
            }}
          />
          <p className="text-sm text-muted-foreground">
            {who} will be the first player you follow in it.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newName.trim() || createAndAdd.isPending}
              onClick={() => createAndAdd.mutate(newName.trim())}
            >
              {createAndAdd.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Create and add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
