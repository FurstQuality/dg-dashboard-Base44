import { CalendarPlus, Download, FileJson, FileSpreadsheet } from "lucide-react";
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
import { exportRowsToCsv, exportRowsToIcs, exportRowsToJson } from "./events-exporters";
import type { UnifiedRow } from "./events-types";

interface Props {
  rows: UnifiedRow[];
}

export function EventsExportMenu({ rows }: Props) {
  function handle(kind: "csv" | "json" | "ics") {
    if (rows.length === 0) {
      toast.info("No events match your current filters.");
      return;
    }
    const count =
      kind === "csv"
        ? exportRowsToCsv(rows)
        : kind === "json"
          ? exportRowsToJson(rows)
          : exportRowsToIcs(rows);
    if (count === 0) {
      toast.info("No dated events to export to calendar.");
      return;
    }
    toast.success(`Exported ${count} event${count === 1 ? "" : "s"} · ${kind.toUpperCase()}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1">
          <Download className="h-3.5 w-3.5" />
          Export
          <span className="text-xs text-muted-foreground">({rows.length})</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          Export {rows.length} filtered event{rows.length === 1 ? "" : "s"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handle("csv")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV spreadsheet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle("json")}>
          <FileJson className="mr-2 h-4 w-4" /> JSON (raw data)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle("ics")}>
          <CalendarPlus className="mr-2 h-4 w-4" /> ICS calendar file
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
