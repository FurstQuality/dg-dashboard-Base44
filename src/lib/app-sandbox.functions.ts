import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getSandboxSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperationsAdmin } = await import("./admin-operations.server");
    await assertOperationsAdmin(context);
    const { readStudioSettings } = await import("./app-studio.server");
    return readStudioSettings();
  });

export const saveSandboxSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        previewOrigin: z.string().max(500),
        liveOrigin: z.string().max(500),
        base44AppUrl: z.string().max(500),
        previewDatabaseOrigin: z.string().max(500),
        productionDatabaseOrigin: z.string().max(500),
        base44Workspace: z.string().trim().min(1).max(100),
        revision: z.number().int().nonnegative(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { assertOperationsAdmin } = await import("./admin-operations.server");
    await assertOperationsAdmin(context);
    const { saveStudioConfiguration } = await import("./app-studio.server");
    await saveStudioConfiguration(data);
    return { ok: true };
  });

export const checkSandboxPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperationsAdmin } = await import("./admin-operations.server");
    await assertOperationsAdmin(context);
    const { checkStudioPreview } = await import("./app-studio.server");
    return checkStudioPreview();
  });
