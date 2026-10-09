import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { rulebookEntry, type RulebookEntry } from "@/lib/game-rulebook";

export function GameRulesBody({ entry }: { entry: RulebookEntry }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{entry.players} players</Badge>
        {entry.alsoKnownAs?.map((a) => (
          <Badge key={a} variant="outline">
            Also called {a}
          </Badge>
        ))}
      </div>
      {entry.sections.map((s) => (
        <section key={s.heading}>
          <h3 className="text-sm font-semibold">{s.heading}</h3>
          <ul className="mt-1.5 space-y-1.5">
            {s.lines.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-muted-foreground">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {entry.appNote && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">In this app: </span>
          {entry.appNote}
        </p>
      )}
      {entry.ratingNote && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Ratings: </span>
          {entry.ratingNote}
        </p>
      )}
    </div>
  );
}

/** Small "Rules" trigger that opens the full rules for one game type. */
export function GameRulesSheet({
  id,
  label = "Rules",
  className,
}: {
  id: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const entry = rulebookEntry(id);
  if (!entry) return null;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={"h-7 gap-1 px-2 text-xs " + (className ?? "")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <BookOpen className="h-3.5 w-3.5" /> {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{entry.name}</SheetTitle>
            <SheetDescription>{entry.summary}</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <GameRulesBody entry={entry} />
            <Button asChild variant="outline" size="sm" className="mt-5 w-full">
              <Link to="/rulebook" onClick={() => setOpen(false)}>
                Open the full game rulebook
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
