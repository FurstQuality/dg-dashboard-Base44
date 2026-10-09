import { createFileRoute } from "@tanstack/react-router";
import { OpenTdKit } from "@/components/open-td/open-td-kit";

export const Route = createFileRoute("/td-kit/")({
  head: () => ({
    meta: [
      { title: "Free Event Director Kit — Run a Disc Golf Tournament or League" },
      {
        name: "description",
        content:
          "A free tournament director toolkit: tier-aware run-of-day checklist, running order, divisions and payout math, and a check-in list. No account needed.",
      },
      { property: "og:title", content: "Free Event Director Kit for Disc Golf Clubs" },
      {
        property: "og:description",
        content:
          "Plan and run a disc golf tournament or league night: checklist, schedule, payouts, and player check-in. Share it with your crew — no sign-up required.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <OpenTdKit />,
});
