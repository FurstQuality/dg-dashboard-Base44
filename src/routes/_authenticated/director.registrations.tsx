import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Download,
  Search,
  Shield,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell";
import { DirectorErrorState } from "@/components/director/director-error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/lib/current-user";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  getDirectorRegistrations,
  mutateRegistrations,
  type DirectorRegistrationRow,
} from "@/lib/director.functions";
import {
  DirectorEventPicker,
  useDirectorEventOptions,
} from "@/components/director/director-event-picker";
import { directorKeys, DIRECTOR_STALE } from "@/lib/director-queries";
import { money } from "@/lib/director-kit";

type Search = { event?: string; status?: string; paid?: string; q?: string; page?: number };

const STATUS_OPTIONS = ["pending", "confirmed", "waitlist", "checked_in", "withdrawn"] as const;
const PAID_OPTIONS = ["unpaid", "paid", "refunded", "waived"] as const;

export const Route = createFileRoute("/_authenticated/director/registrations")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    event: typeof s.event === "string" ? s.event : undefined,
    status: typeof s.status === "string" ? s.status : undefined,
    paid: typeof s.paid === "string" ? s.paid : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
    page: typeof s.page === "number" ? s.page : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Registration desk · DG Dashboard" },
      {
        name: "description",
        content:
          "Approve entries, manage waitlists, take check-ins, and track entry fees across every event you direct.",
      },
      { property: "og:title", content: "Registration desk — DG Dashboard" },
      {
        property: "og:description",
        content: "One roster for every event you run: entries, waitlist, payments, and check-in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegistrationDesk,
});

const LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  waitlist: "Waitlist",
  checked_in: "Checked in",
  withdrawn: "Withdrawn",
  unpaid: "Unpaid",
  paid: "Paid",
  refunded: "Refunded",
  waived: "Waived",
};


function RegistrationDesk() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { user } = useSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [term, setTerm] = useState(search.q ?? "");

  const fetchRows = useServerFn(getDirectorRegistrations);
  const runMutation = useServerFn(mutateRegistrations);

  const eventsQuery = useDirectorEventOptions(userId, "");

  const filters = {
    tournamentId: search.event,
    status: search.status,
    paid: search.paid,
    search: search.q,
    page: search.page ?? 0,
  };

  const rowsQuery = useQuery({
    queryKey: directorKeys.registrations(userId, filters),
    enabled: !!userId,
    staleTime: DIRECTOR_STALE.short,
    queryFn: () =>
      fetchRows({
        data: {
          ...(search.event ? { tournamentId: search.event } : {}),
          ...(search.status ? { status: search.status as (typeof STATUS_OPTIONS)[number] } : {}),
          ...(search.paid ? { paid: search.paid as (typeof PAID_OPTIONS)[number] } : {}),
          ...(search.q ? { search: search.q } : {}),
          page: search.page ?? 0,
        },
      }),
  });

  const mutation = useMutation({
    mutationFn: (input: { action: string; divisionId?: string }) =>
      runMutation({
        data: {
          registrationIds: [...selected],
          action: input.action as "confirm",
          ...(input.divisionId ? { divisionId: input.divisionId } : {}),
        },
      }),
    onSuccess: (_r, vars) => {
      toast.success(`Updated ${selected.size} player${selected.size === 1 ? "" : "s"}.`);
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["director-registrations"] });
      void queryClient.invalidateQueries({ queryKey: directorKeys.cockpit(userId) });
      void vars;
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "That change didn't save. Try again."),
  });

  const rows = rowsQuery.data?.rows ?? [];
  const totals = rowsQuery.data?.totals;
  const page = search.page ?? 0;
  const pageSize = rowsQuery.data?.pageSize ?? 50;
  const total = rowsQuery.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const setSearch = (patch: Partial<Search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch, page: patch.page ?? 0 }) });

  const csv = useMemo(
    () =>
      toCsv(
        [
          "Player",
          "Username",
          "PDGA",
          "Event",
          "Division",
          "Status",
          "Payment",
          "Entry fee",
          "Registered",
        ],
        rows.map((r) => [
          r.displayName,
          r.username,
          r.pdgaNumber,
          r.tournamentName,
          r.divisionName,
          LABEL[r.status] ?? r.status,
          LABEL[r.paymentStatus] ?? r.paymentStatus,
          money(r.entryFeeCents),
          new Date(r.createdAt).toLocaleDateString(),
        ]),
      ),
    [rows],
  );

  function exportCsv() {
    downloadCsv("registrations.csv", csv);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Event Director
          </span>
        }
        title="Registration desk"
        description="Approve entries, run the waitlist, take payments, and check players in — across every event you direct."
        primaryAction={
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={Users}
          label="Entries in view"
          value={String(total)}
          hint={
            totals
              ? `${totals.confirmed + totals.checkedIn} in the field · ${totals.pending} pending · ${totals.waitlist} waitlisted`
              : "Loading roster…"
          }
        />
        <Stat
          icon={CheckCircle2}
          label="Checked in"
          value={totals ? String(totals.checkedIn) : "—"}
          hint="Players who have signed in on site"
        />
        <Stat
          icon={DollarSign}
          label="Fees collected"
          value={totals ? money(totals.feesCollectedCents) : "—"}
          hint={
            totals ? `${money(totals.feesOutstandingCents)} still outstanding` : "Loading fees…"
          }
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-card border border-border bg-card p-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-[12px] text-muted-foreground" htmlFor="reg-event">
            Event
          </label>
          <DirectorEventPicker
            id="reg-event"
            userId={userId}
            value={search.event ?? "all"}
            onChange={(v) => setSearch({ event: v === "all" ? undefined : v })}
            allLabel="All my events"
            placeholder="All my events"
          />
        </div>
        <div className="w-[160px]">
          <label className="mb-1 block text-[12px] text-muted-foreground" htmlFor="reg-status">
            Status
          </label>
          <Select
            value={search.status ?? "all"}
            onValueChange={(v) => setSearch({ status: v === "all" ? undefined : v })}
          >
            <SelectTrigger id="reg-status">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[160px]">
          <label className="mb-1 block text-[12px] text-muted-foreground" htmlFor="reg-paid">
            Payment
          </label>
          <Select
            value={search.paid ?? "all"}
            onValueChange={(v) => setSearch({ paid: v === "all" ? undefined : v })}
          >
            <SelectTrigger id="reg-paid">
              <SelectValue placeholder="Any payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any payment</SelectItem>
              {PAID_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <form
          className="flex min-w-[220px] flex-1 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch({ q: term.trim() || undefined });
          }}
        >
          <div className="flex-1">
            <label className="mb-1 block text-[12px] text-muted-foreground" htmlFor="reg-search">
              Find a player
            </label>
            <Input
              id="reg-search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Name, username, or PDGA #"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            <Search className="h-4 w-4" />
            <span className="sr-only">Search registrations</span>
          </Button>
        </form>
      </div>

      {selected.size > 0 ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-card border border-primary/40 bg-card p-3">
          <span className="text-sm font-semibold">{selected.size} selected</span>
          {[
            { action: "confirm", label: "Confirm" },
            { action: "waitlist", label: "Move to waitlist" },
            { action: "check_in", label: "Check in" },
            { action: "mark_paid", label: "Mark paid" },
            { action: "waive_fee", label: "Waive fee" },
            { action: "withdraw", label: "Withdraw" },
          ].map((a) => (
            <Button
              key={a.action}
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ action: a.action })}
            >
              {a.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-card border border-border bg-card">
        {rowsQuery.isPending ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rowsQuery.isError ? (
          <div className="p-3">
            <DirectorErrorState
              title="The roster didn't load"
              onRetry={() => void rowsQuery.refetch()}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No entries match these filters yet. Once players register, they show up here for
            approval, payment, and check-in.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked}
                    aria-label="Select all entries on this page"
                    onCheckedChange={(v) =>
                      setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                  />
                </TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="hidden md:table-cell">Event</TableHead>
                <TableHead className="hidden sm:table-cell">Division</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="hidden lg:table-cell">Registered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <Row
                  key={r.id}
                  row={r}
                  checked={selected.has(r.id)}
                  onToggle={(on) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(r.id);
                      else next.delete(r.id);
                      return next;
                    })
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {total > pageSize ? (
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-muted-foreground">
            Showing {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => void navigate({ search: (prev) => ({ ...prev, page: page - 1 }) })}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= lastPage}
              onClick={() => void navigate({ search: (prev) => ({ ...prev, page: page + 1 }) })}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  row,
  checked,
  onToggle,
}: {
  row: DirectorRegistrationRow;
  checked: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <Checkbox
          checked={checked}
          aria-label={`Select ${row.displayName}`}
          onCheckedChange={(v) => onToggle(!!v)}
        />
      </TableCell>
      <TableCell>
        <span className="block text-sm font-semibold">{row.displayName}</span>
        <span className="block text-[12px] text-muted-foreground">
          {row.username ? `@${row.username}` : "No username"}
          {row.pdgaNumber ? ` · PDGA #${row.pdgaNumber}` : ""}
        </span>
      </TableCell>
      <TableCell className="hidden md:table-cell text-[13px]">{row.tournamentName}</TableCell>
      <TableCell className="hidden sm:table-cell text-[13px]">
        {row.divisionName ?? "Not set"}
      </TableCell>
      <TableCell>
        <Badge variant="outline">{LABEL[row.status] ?? row.status}</Badge>
      </TableCell>
      <TableCell>
        <span className="block text-[13px]">{LABEL[row.paymentStatus] ?? row.paymentStatus}</span>
        <span className="block text-[12px] text-muted-foreground">{money(row.entryFeeCents)}</span>
      </TableCell>
      <TableCell className="hidden lg:table-cell text-[13px]">
        {new Date(row.createdAt).toLocaleDateString()}
      </TableCell>
    </TableRow>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-card border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="font-display text-2xl font-semibold">{value}</div>
      <div className="text-[12px] text-muted-foreground">{hint}</div>
    </div>
  );
}
