import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listTrackedEvents } from "@/lib/tracker-watchlist.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";
import { TrackedEventsPanel } from "@/components/tracker/tracked-events-panel";
import { TournamentSearchPanel } from "@/components/tracker/tournament-search-panel";

/**
 * One panel for the Event Tracker page: a simple list of the events you follow,
 * plus the event search used to add more.
 */
export function EventTrackerPanel({ onPreview }: { onPreview?: (eventRef: string) => void }) {
  const [tab, setTab] = useState<"tracked" | "find">("tracked");
  const list = useServerFn(listTrackedEvents);

  const { data } = useQuery({
    queryKey: trackerKeys.watchlist(),
    queryFn: () => list(),
    staleTime: TRACKER_STALE.watchlist,
  });
  const trackedCount = data?.events.length ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4 text-primary" /> Events you follow
        </CardTitle>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "tracked" | "find")} className="mt-3">
          <TabsList>
            <TabsTrigger value="tracked" className="gap-2">
              Tracked
              {trackedCount > 0 ? (
                <Badge variant="secondary" className="text-[10px]">
                  {trackedCount}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="find" className="gap-2">
              <ListChecks className="h-3.5 w-3.5" /> Find events
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {tab === "tracked" ? (
          <TrackedEventsPanel bare onPreview={onPreview} />
        ) : (
          <TournamentSearchPanel bare onPreview={onPreview} />
        )}
      </CardContent>
    </Card>
  );
}
