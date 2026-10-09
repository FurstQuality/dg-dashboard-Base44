import { useState } from "react";
import { ChevronDown, ShieldCheck, Lightbulb, CircleDot } from "lucide-react";
import type { PlaybookLevel, PlaybookSection } from "@/lib/sanctioning-plan";
import { DirectorTaskLink } from "@/components/director/director-task-link";
import type { DirectorTaskContext } from "@/lib/director-task-links";

const LEVEL_META: Record<PlaybookLevel, { label: string; className: string }> = {
  required: {
    label: "Required",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  recommended: {
    label: "Recommended",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  idea: { label: "Idea", className: "border-border bg-muted text-muted-foreground" },
};

function LevelIcon({ level }: { level: PlaybookLevel }) {
  if (level === "required") return <ShieldCheck className="h-3.5 w-3.5 shrink-0" />;
  if (level === "idea") return <Lightbulb className="h-3.5 w-3.5 shrink-0" />;
  return <CircleDot className="h-3.5 w-3.5 shrink-0" />;
}

/**
 * The run-the-event guide: one collapsible card per phase, from registration
 * through financial reporting. Sanctioned events show tier obligations,
 * unsanctioned events show relaxed guidance and quirk ideas.
 */
export function EventPlaybook({
  sections,
  defaultOpen,
  taskContext,
}: {
  sections: PlaybookSection[];
  defaultOpen?: PlaybookSection["id"][];
  taskContext?: DirectorTaskContext;
}) {
  const [open, setOpen] = useState<string[]>(defaultOpen ?? [sections[0]?.id ?? ""]);
  const toggle = (id: string) =>
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const isOpen = open.includes(section.id);
        const requiredCount = section.items.filter((i) => i.level === "required").length;
        return (
          <div key={section.id} className="rounded-xl border border-border bg-card">
            <button
              type="button"
              onClick={() => toggle(section.id)}
              aria-expanded={isOpen}
              className="flex w-full items-start gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{section.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                  {section.blurb}
                </span>
              </span>
              {requiredCount > 0 ? (
                <span className="mt-0.5 shrink-0 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  {requiredCount} required
                </span>
              ) : null}
              <ChevronDown
                className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen ? (
              <ul className="space-y-2 border-t border-border px-4 py-3">
                {section.items.map((item, i) => (
                  <li key={`${section.id}-${i}`} className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${LEVEL_META[item.level].className}`}
                    >
                      <LevelIcon level={item.level} />
                      {LEVEL_META[item.level].label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium leading-snug">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                        {item.detail}
                      </span>
                      {taskContext ? (
                        <span className="mt-1.5 block">
                          <DirectorTaskLink
                            text={item.label}
                            detail={item.detail}
                            context={taskContext}
                          />
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
