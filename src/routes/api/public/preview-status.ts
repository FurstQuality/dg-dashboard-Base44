import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/preview-status")({
  server: {
    handlers: {
      GET: async () => {
        if (process.env.DGD_SANDBOX !== "1") return new Response("not_found", { status: 404 });
        const { sandboxRuntimeStatus } = await import("@/lib/sandbox-runtime");
        const status = sandboxRuntimeStatus(process.env);
        return Response.json(status, {
          status: status.isolated ? 200 : 503,
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
