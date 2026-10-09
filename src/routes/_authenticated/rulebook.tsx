import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell, PageHeader } from "@/components/shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GameRulesBody } from "@/components/play/game-rules-sheet";
import {
  RULEBOOK,
  RULEBOOK_CATEGORY_LABELS,
  rulebookByCategory,
  type RulebookCategory,
} from "@/lib/game-rulebook";

export const Route = createFileRoute("/_authenticated/rulebook")({
  head: () => ({
    meta: [
      { title: "Disc Golf Game Rulebook — Wolf, Doubles, Skins | DG Dashboard" },
      {
        name: "description",
        content:
          "Full rules for every way to play a round: singles, doubles and team throw styles, stroke play, match play, skins, points, plus the casual Wolf and Imposter games.",
      },
      {
        property: "og:title",
        content: "Disc Golf Game Rulebook — Wolf, Doubles, Skins | DG Dashboard",
      },
      {
        property: "og:description",
        content:
          "Learn best throw, worst throw, alternate throw, skins, Wolf and Imposter — then score them in DG Dashboard.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RulebookPage,
});

const CATEGORY_ORDER: RulebookCategory[] = ["format", "throw_style", "scoring"];

function RulebookPage() {
  const [openId, setOpenId] = useState<string | null>(RULEBOOK[0]?.id ?? null);

  return (
    <PageShell section="play">
      <PageHeader
        title="Game rulebook"
        description="How every playing style in DG Dashboard actually works — read the rules, then start a round with those settings."
      />

      {CATEGORY_ORDER.map((category) => (
        <section key={category} className="space-y-3">
          <h2 className="text-lg font-semibold">{RULEBOOK_CATEGORY_LABELS[category]}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {rulebookByCategory(category).map((entry) => {
              const open = openId === entry.id;
              return (
                <Card key={entry.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{entry.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{entry.summary}</p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    {open && <GameRulesBody entry={entry} />}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-auto w-full"
                      onClick={() => setOpenId(open ? null : entry.id)}
                    >
                      {open ? "Hide rules" : "Read the rules"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
