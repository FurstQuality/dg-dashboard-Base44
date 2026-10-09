import { useState } from "react";
import { Radio, Users, UsersRound } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrewPeopleManager } from "@/components/tracker/crew-people-manager";
import { TrackersHub } from "@/components/community/trackers-hub";
import { FriendsLiveNowPanel } from "@/components/tracker/friends-live-now-panel";
import { FriendsPlayingPanel } from "@/components/tracker/friends-playing-panel";

type Tab = "players" | "crews" | "live";

/**
 * One panel for the Players & crews page: the people you follow, your crews,
 * and what everyone is playing right now.
 */
export function PlayerTrackerPanel({ onPreview }: { onPreview?: (eventRef: string) => void }) {
  const [tab, setTab] = useState<Tab>("players");

  return (
    <Card>
      <CardHeader className="pb-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="players" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Following
            </TabsTrigger>
            <TabsTrigger value="crews" className="gap-1.5">
              <UsersRound className="h-3.5 w-3.5" /> Crews
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-1.5">
              <Radio className="h-3.5 w-3.5" /> Live now
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {tab === "players" ? <CrewPeopleManager bare /> : null}
        {tab === "crews" ? <TrackersHub variant="embedded" /> : null}
        {tab === "live" ? (
          <div className="space-y-6">
            <FriendsLiveNowPanel bare onPreview={onPreview} />
            <FriendsPlayingPanel bare onPreview={onPreview} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
