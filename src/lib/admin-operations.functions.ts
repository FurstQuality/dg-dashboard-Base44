import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOperationsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ops = await import("./admin-operations.server");
    await ops.assertOperationsAdmin(context);
    return ops.operationsOverview();
  });
export const getOperationsResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        resource: z.enum([
          "database",
          "users",
          "storage",
          "secrets",
          "jobs",
          "functions",
          "logs",
          "usage",
          "ai",
          "security",
          "backups",
          "git",
        ]),
        page: z.number().int().min(1).max(10000).default(1),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const ops = await import("./admin-operations.server");
    await ops.assertOperationsAdmin(context);
    return data.resource === "git"
      ? ops.readGitStatus()
      : ops.readCloudResource(data.resource, data.page);
  });
export const runOperationsQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(1).max(12000) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const ops = await import("./admin-operations.server");
    await ops.assertOperationsAdmin(context);
    // Enforcement is PostgreSQL read_only, never a regex pretending to validate SQL.
    return ops.result(
      ops.asRows(await ops.readSql(data.query)),
      "Read-only query. Display is limited to 200 rows; include LIMIT in your SQL.",
    );
  });

export const getProjectNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ops = await import("./admin-operations.server");
    await ops.assertOperationsAdmin(context);
    const { data, error } = await context.supabase
      .from("admin_project_settings")
      .select("knowledge,security_notes,revision,updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error)
      throw new Error(
        "Project notes are unavailable. Apply the admin_project_settings migration to the existing project and check permissions.",
      );
    return data ?? { knowledge: "", security_notes: "", revision: 0, updated_at: null };
  });
export const saveProjectNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        knowledge: z.string().max(30000),
        security_notes: z.string().max(30000),
        revision: z.number().int().nonnegative(),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const ops = await import("./admin-operations.server");
    await ops.assertOperationsAdmin(context);
    const { data: revision, error } = await context.supabase.rpc("save_admin_project_notes", {
      _knowledge: data.knowledge,
      _security_notes: data.security_notes,
      _revision: data.revision,
      _reason: data.reason,
    });
    if (error)
      throw new Error(
        "Notes were not saved. Check the migration and permissions, or reload if another admin changed them.",
      );
    return { revision };
  });

export const testOperationsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.enum(["supabase", "management", "google-auth", "github", "stripe"]) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const ops = await import("./admin-operations.server");
    await ops.assertOperationsAdmin(context);
    if (data.id === "github") return ops.readGitStatus();
    if (data.id === "management") {
      await ops.management("/functions");
      return ops.result([{ status: "Verified", scope: "Edge Function list access" }]);
    }
    if (data.id === "supabase") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const response = await supabaseAdmin.from("courses").select("id").limit(1);
      if (response.error) throw new Error("Supabase data access failed.");
      return ops.result([{ status: "Verified", scope: "App database read access" }]);
    }
    if (data.id === "stripe") {
      const { getStripe } = await import("./stripe.server");
      const balance = await getStripe().balance.retrieve();
      return ops.result(
        [{ status: "Stripe balance access verified", live_mode: balance.livemode }],
        "API access verified; this does not verify checkout or webhook delivery.",
      );
    }
    const ref = ops.projectRef();
    if (!ref) throw new Error("Configure the Supabase project URL first.");
    const response = await fetch(`https://${ref}.supabase.co/auth/v1/authorize?provider=google`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const location = response.headers.get("location");
    if (!location || new URL(location).hostname !== "accounts.google.com")
      throw new Error(
        "Google authorization is not ready. Configure the Google provider client ID and secret in Supabase, then recheck.",
      );
    return ops.result(
      [{ status: "Google authorization redirect verified" }],
      "User consent, the callback allow list and a completed sign-in still require a browser test.",
    );
  });
