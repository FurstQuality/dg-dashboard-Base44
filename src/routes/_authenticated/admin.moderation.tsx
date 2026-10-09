import { createFileRoute } from "@tanstack/react-router";
import AdminModerationPage from "@/components/pages/admin-moderation-page";

export const Route = createFileRoute("/_authenticated/admin/moderation")({
  component: AdminModerationPage,
  head: () => ({
    meta: [
      { title: "Course moderation · Admin · DG Dashboard" },
      { name: "description", content: "Approve or reject courses and edit requests." },
      { property: "og:title", content: "Course moderation · Admin · DG Dashboard" },
      { property: "og:description", content: "Approve or reject courses and edit requests." },
    ],
  }),
});
