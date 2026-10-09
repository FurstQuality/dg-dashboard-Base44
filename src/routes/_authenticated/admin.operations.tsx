import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { OPERATION_SECTIONS } from "@/lib/admin-operations";
import { AdminOperationsPage } from "@/components/admin/admin-operations-page";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  validateSearch: z.object({ section: z.enum(OPERATION_SECTIONS).catch("overview") }),
  head: () => ({
    meta: [
      { title: "Platform operations · DG Dashboard" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});
function Page() {
  const { section } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AdminOperationsPage
      section={section}
      onSection={(section) => navigate({ search: { section } })}
    />
  );
}
