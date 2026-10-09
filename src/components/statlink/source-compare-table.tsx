/**
 * SourceCompareTable — puts PDGA, UDisc, and DG Dashboard data in one grid,
 * one column per source, so every number can be read across without switching
 * views. Values that a source cannot supply say so plainly instead of showing
 * a zero.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WidgetNote, WidgetSourceNote } from "@/components/shell/widget-note";

export type CompareColumn = {
  key: string;
  /** Column heading, e.g. "PDGA". */
  label: string;
  /** One line under the heading naming what the column's numbers are. */
  sublabel: string;
  chipClass: string;
  loading?: boolean;
};

export type CompareRow = {
  label: string;
  hint?: string;
  /** Value per column key. `null` renders as "—", a string renders as-is. */
  values: Record<string, number | string | null | undefined>;
  emphasis?: boolean;
};

function display(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  return typeof v === "number" ? (Number.isFinite(v) ? String(v) : "—") : v;
}

export function SourceCompareTable({
  title,
  note,
  sources,
  columns,
  rows,
  embedded = false,
}: {
  title: string;
  note: string;
  sources: string[];
  columns: CompareColumn[];
  rows: CompareRow[];
  /** Render heading + table only, for use inside a larger card. */
  embedded?: boolean;
}) {
  const header = (
    <>
      <CardTitle className="font-display text-lg">{title}</CardTitle>
      <WidgetNote>{note}</WidgetNote>
      <WidgetSourceNote sources={sources} />
    </>
  );
  const body = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-[34%] py-2 text-left text-[13px] font-medium text-muted-foreground">
              Measure
            </th>
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-2 text-right align-bottom">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${c.chipClass}`}
                >
                  {c.label}
                </span>
                <div className="mt-1 text-[12px] font-normal leading-snug text-muted-foreground">
                  {c.loading ? "Loading…" : c.sublabel}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/70">
              <th
                scope="row"
                className="py-2 pr-2 text-left text-[13px] font-medium text-muted-foreground"
                title={r.hint}
              >
                {r.label}
              </th>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 py-2 text-right tabular-nums ${
                    r.emphasis ? "font-display text-xl font-bold text-primary" : "text-foreground"
                  }`}
                >
                  {c.loading ? (
                    <span className="text-muted-foreground">…</span>
                  ) : (
                    display(r.values[c.key])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (embedded) {
    return (
      <section className="space-y-2">
        <div className="space-y-1">{header}</div>
        {body}
      </section>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">{header}</CardHeader>
      <CardContent className="pt-0">{body}</CardContent>
    </Card>
  );
}

export const SOURCE_CHIP_CLASS = {
  pdga: "border-primary/40 bg-primary/10 text-primary",
  udisc: "border-orange-500/40 bg-orange-500/10 text-orange-500",
  chainlink: "border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300",
} as const;
