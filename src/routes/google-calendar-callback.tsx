import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/google-calendar-callback")({
  head: () => ({ meta: [{ title: "Connecting Google Calendar · DG Dashboard" }, { name: "referrer", content: "no-referrer" }] }),
  component: CalendarCallback,
});

function CalendarCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = { type: "dgd-google-calendar", code: params.get("code"), state: params.get("state"), error: params.get("error") };
    window.history.replaceState(null, "", window.location.pathname);
    window.opener?.postMessage(message, window.location.origin);
  }, []);
  return <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground"><p>Completing your calendar connection. Return to the app window.</p></main>;
}
