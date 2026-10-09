import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCog, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell, PageHeader } from "@/components/shell";
import { CalendarSyncPanel } from "@/components/calendar/sync-panel";
import { AddEventPanel } from "@/components/calendar/add-event-panel";
import { useSettingsSetup } from "@/lib/settings-wizard";

export const Route = createFileRoute("/_authenticated/settings/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar · Settings · DG Dashboard" },
      {
        name: "description",
        content:
          "Sync Google Calendar, PDGA, UDisc, and Disc Golf Scene events into one unified disc golf calendar. Manage your feed URL and add events manually.",
      },
      { property: "og:title", content: "Calendar · Settings · DG Dashboard" },
      {
        property: "og:description",
        content: "One place to connect every disc golf calendar source.",
      },
    ],
  }),
  component: CalendarSettingsPage,
});

function CalendarSettingsPage() {
  const qc = useQueryClient();
  const setup = useSettingsSetup();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["my-schedule"] });
    qc.invalidateQueries({ queryKey: ["calendar-status"] });
  };

  return (
    <PageShell section="play">
      <PageHeader
        eyebrow="Step 3 · Calendar"
        leading={<CalendarCog className="h-6 w-6 text-primary" aria-hidden />}
        title="Calendar settings"
        description="Once your PDGA or UDisc account is linked in the previous step, connect Google, generate an ICS feed for Apple or Outlook, and add manual events here."
        primaryAction={
          <Button asChild variant="outline">
            <Link to="/schedule">Open calendar</Link>
          </Button>
        }
      />

      {/* Connected accounts + ICS feed + bulk imports — gated on step 2 so the
          sync tools only appear once there is an account to sync from. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Connected accounts &amp; feeds
        </h2>
        {setup.loading ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Checking your connected accounts…
            </CardContent>
          </Card>
        ) : setup.hasConnectedSource ? (
          <>
            <CalendarSyncPanel onChanged={invalidate} />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  PDGA and UDisc stay current on their own
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Your calendar, rating, rounds, and event listings refresh in the background, so
                  there is nothing to run by hand.
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Finish step 2 first</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                There's nothing to sync yet. Link your PDGA number, UDisc profile, or Disc Golf
                Scene page in <b className="text-foreground">Data &amp; sync</b>, then come back and
                your event feeds will show up here.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <Link to="/settings/imports">
                    Go to Data &amp; sync
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
                <span className="text-xs">
                  You can still add events by hand below in the meantime.
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Manual add */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Add an event manually
        </h2>
        <AddEventPanel onSaved={invalidate} />
      </section>

      {/* Help */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How syncing works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <b className="text-foreground">PDGA:</b> Sync pulls your upcoming registrations directly
            from your PDGA profile. Your linked PDGA number in{" "}
            <Link to="/me/edit" className="text-primary underline">
              Edit profile
            </Link>{" "}
            is required.
          </p>
          <p>
            <b className="text-foreground">UDisc:</b> Imports rounds you've played from your linked
            UDisc profile so the calendar shows history alongside upcoming events.
          </p>
          <p>
            <b className="text-foreground">Google Calendar:</b> A two-way link — pull events in, and
            push tournaments you've registered for out to your Google Calendar.
          </p>
          <p>
            <b className="text-foreground">Apple / Outlook:</b> Generate a private feed URL and
            subscribe once. Your calendar refreshes automatically as new events show up.
          </p>
          <p>
            <b className="text-foreground">Recurring leagues:</b> Set "Repeats on" when adding a
            manual event to add a weekly casual league to your own calendar without creating it
            app-wide.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
