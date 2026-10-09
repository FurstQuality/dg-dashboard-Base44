import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { MockDataPanel } from "@/components/admin/mock-data-panel";
import { AppSandboxPanel } from "@/components/admin/app-sandbox-panel";

export const Route = createFileRoute("/_authenticated/admin/sandbox")({
  component: AdminSandboxPage,
  head: () => ({
    meta: [
      { title: "App sandbox · Admin · DG Dashboard" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Review draft app changes in a separate preview before publishing.",
      },
      { property: "og:title", content: "App sandbox · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Review draft app changes in a separate preview before publishing.",
      },
    ],
  }),
});

function AdminSandboxPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin"
        title="App sandbox"
        description="Edit, preview and review changes before publishing them to the live app."
      />
      <AppSandboxPanel />
      <details className="mt-6 rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Demo-data tools</summary>
        <p className="my-3 text-sm text-muted-foreground">These tools create and remove demo records in the current app's database. They do not create an isolated preview environment.</p>
        <MockDataPanel />
      </details>
    </PageShell>
  );
}
