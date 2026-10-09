import { useState } from "react";
import { Download, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { planId, rosterCsv, rosterTotals, type OpenPlan, type PlanPlayer } from "@/lib/open-td-plan";
import { SectionCard } from "./section-card";

interface Props {
  plan: OpenPlan;
  canEdit: boolean;
  update: (patch: Partial<OpenPlan>) => void;
}

export function PlanRoster({ plan, canEdit, update }: Props) {
  const [name, setName] = useState("");
  const [division, setDivision] = useState("");
  const totals = rosterTotals(plan.players);

  function setPlayers(next: PlanPlayer[]) {
    update({ players: next });
  }

  function add() {
    const clean = name.trim();
    if (!clean) return;
    setPlayers([
      ...plan.players,
      {
        id: planId(),
        name: clean,
        division: division || plan.divisions[0]?.name || "",
        pdgaNumber: "",
        paid: false,
        checkedIn: false,
        note: "",
      },
    ]);
    setName("");
  }

  function downloadCsv() {
    const blob = new Blob([rosterCsv(plan)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${plan.title.replace(/[^\w -]/g, "").trim() || "player-list"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SectionCard
      title="Player list and check-in"
      blurb="Add players as they sign up, then mark them paid and checked in on event day."
      actions={
        <>
          <Button size="sm" variant="outline" onClick={downloadCsv}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export list
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer className="mr-1 h-3.5 w-3.5" /> Print
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>{totals.total} on the list</span>
        <span>{totals.checkedIn} checked in</span>
        <span>{totals.paid} paid</span>
        <span>{totals.unpaid} still to pay</span>
      </div>

      {canEdit ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <Input
            className="min-w-[12rem] flex-1"
            placeholder="Player name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <Input
            className="w-40"
            placeholder="Division"
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          />
          <Button onClick={add}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add player
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Player</th>
              <th className="py-2 pr-3 font-medium">Division</th>
              <th className="py-2 pr-3 font-medium">PDGA #</th>
              <th className="py-2 pr-3 font-medium">Paid</th>
              <th className="py-2 pr-3 font-medium">Checked in</th>
              <th className="py-2 pr-3 font-medium">Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {plan.players.map((p) => (
              <tr key={p.id} className="border-b border-border/60">
                <td className="py-2 pr-3">
                  <Input
                    className="h-8 min-w-[10rem]"
                    value={p.name}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setPlayers(
                        plan.players.map((x) =>
                          x.id === p.id ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </td>
                <td className="py-2 pr-3">
                  <Input
                    className="h-8 w-36"
                    value={p.division}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setPlayers(
                        plan.players.map((x) =>
                          x.id === p.id ? { ...x, division: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </td>
                <td className="py-2 pr-3">
                  <Input
                    className="h-8 w-24"
                    value={p.pdgaNumber}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setPlayers(
                        plan.players.map((x) =>
                          x.id === p.id ? { ...x, pdgaNumber: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </td>
                <td className="py-2 pr-3">
                  <Checkbox
                    checked={p.paid}
                    disabled={!canEdit}
                    onCheckedChange={(v) =>
                      setPlayers(
                        plan.players.map((x) => (x.id === p.id ? { ...x, paid: v === true } : x)),
                      )
                    }
                  />
                </td>
                <td className="py-2 pr-3">
                  <Checkbox
                    checked={p.checkedIn}
                    disabled={!canEdit}
                    onCheckedChange={(v) =>
                      setPlayers(
                        plan.players.map((x) =>
                          x.id === p.id ? { ...x, checkedIn: v === true } : x,
                        ),
                      )
                    }
                  />
                </td>
                <td className="py-2 pr-3">
                  <Input
                    className="h-8 min-w-[10rem]"
                    value={p.note}
                    disabled={!canEdit}
                    placeholder="Non-member fee, ride, pack size…"
                    onChange={(e) =>
                      setPlayers(
                        plan.players.map((x) =>
                          x.id === p.id ? { ...x, note: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </td>
                <td className="py-2">
                  {canEdit ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Remove player"
                      onClick={() => setPlayers(plan.players.filter((x) => x.id !== p.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!plan.players.length ? (
              <tr>
                <td colSpan={7} className="py-4 text-sm text-muted-foreground">
                  Nobody on the list yet. Add players as they sign up, or add them at the table on
                  event day.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
