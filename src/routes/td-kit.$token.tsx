import { createFileRoute } from "@tanstack/react-router";
import { OpenTdKit } from "@/components/open-td/open-td-kit";

export const Route = createFileRoute("/td-kit/$token")({
  head: () => ({
    meta: [
      { title: "Shared Event Plan — DG Dashboard Event Director Kit" },
      {
        name: "description",
        content:
          "A shared disc golf event plan: run-of-day checklist, running order, divisions and payout, and the player check-in list.",
      },
      { property: "og:title", content: "Shared Event Plan — Event Director Kit" },
      {
        property: "og:description",
        content:
          "Open this event plan to see the checklist, running order, payout, and player list for the day.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SharedPlan,
});

function SharedPlan() {
  const { token } = Route.useParams();
  return <OpenTdKit shareToken={token} />;
}
