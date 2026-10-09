import { Check, X, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";

export type ExternalScoring = "" | "pdga_live" | "udisc";

type Props = {
  courseName: string | null;
  layoutBuilt: boolean;
  value: ExternalScoring;
  onChange: (v: ExternalScoring) => void;
  /** True once a course is chosen for the event. */
  courseSelected?: boolean;
  /** True when a saved layout carries full builder measurements. */
  layoutVerified?: boolean;
  /** Holes on the selected course, used for the readiness checklist. */
  holeCount?: number | null;
};

type ChecklistItem = { label: string; done: boolean; hint: string };

/**
 * Scoring source for an event. DG Dashboard scoring is the default and the
 * recommended path — it is the only option that produces live standings and
 * ratings here. PDGA Live and UDisc remain available for events scored
 * elsewhere. Publishing requires either a built layout or an external source,
 * and the same rule is enforced in the database so it cannot be bypassed.
 */
export function ExternalScoringGate({
  courseName,
  layoutBuilt,
  value,
  onChange,
  courseSelected,
  layoutVerified,
  holeCount,
}: Props) {
  const hasCourse = courseSelected ?? !!courseName;
  const checklist: ChecklistItem[] = [
    {
      label: "Course selected",
      done: hasCourse,
      hint: "Pick the course in the step above.",
    },
    {
      label: "Layout built in the course builder",
      done: layoutBuilt,
      hint: "Players need a layout to score hole by hole.",
    },
    {
      label: "Hole pars and distances measured",
      done: !!layoutVerified,
      hint: "Measurements unlock round ratings and hole stats.",
    },
    {
      label: "Hole count confirmed",
      done: (holeCount ?? 0) > 0,
      hint: "Set the hole count on the course so scorecards match.",
    },
  ];
  const ready = checklist.every((c) => c.done);
  const appSelected = value === "";

  const options: { key: ExternalScoring; title: string; body: string }[] = [
    {
      key: "",
      title: "DG Dashboard scoring",
      body: "Players score in the app. Live standings, hole stats, and DGD ratings are handled for you.",
    },
    {
      key: "pdga_live",
      title: "PDGA Live",
      body: "Scoring runs on PDGA Live. Import results afterward to update standings.",
    },
    {
      key: "udisc",
      title: "UDisc",
      body: "Scoring runs in UDisc. Import the round links afterward — UDisc rounds don't produce ratings.",
    },
  ];

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <div>
        <div className="text-sm font-medium">Scoring source</div>
        <p className="text-xs text-muted-foreground">
          DG Dashboard scoring is the default. Switch only if this event is scored somewhere else.
        </p>
      </div>

      <div className="grid gap-2">
        {options.map((opt) => {
          const selected = value === opt.key;
          const recommended = opt.key === "";
          return (
            <button
              key={opt.key || "app"}
              type="button"
              onClick={() => onChange(opt.key)}
              className={`rounded-md border px-3 py-2 text-left transition ${
                selected
                  ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{opt.title}</span>
                {recommended ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                    <Sparkles className="h-3 w-3" /> Recommended
                  </span>
                ) : null}
                {selected ? (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{opt.body}</p>
            </button>
          );
        })}
      </div>

      {appSelected ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
          <div className="text-xs font-medium">
            {ready
              ? `${courseName ?? "This course"} is ready to score in the app`
              : "Finish these to score this event in the app"}
          </div>
          <ul className="mt-2 space-y-1.5">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-xs">
                {item.done ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <span className={item.done ? "" : "text-muted-foreground"}>
                  {item.label}
                  {item.done ? null : <span className="block text-[11px]">{item.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
          {!layoutBuilt ? (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              <Link to="/courses" search={{ add: "1" } as never} target="_blank" className="underline">
                Build the course layout
              </Link>{" "}
              before publishing, or choose PDGA Live or UDisc above.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
