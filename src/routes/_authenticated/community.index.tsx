import { createFileRoute } from "@tanstack/react-router";
import { CommunityFeedHome } from "@/components/community/community-feed-home";

export const Route = createFileRoute("/_authenticated/community/")({
  component: CommunityFeedHome,
  head: () => ({
    meta: [
      { title: "Community · DG Dashboard" },
      { name: "description", content: "Your disc golf feed, friends, clubs and conversations in one place." },
      { property: "og:title", content: "Community · DG Dashboard" },
      { property: "og:description", content: "Posts, rounds and aces from your crew, plus clubs and community events near you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
