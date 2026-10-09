import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseConnectionInput } from "./admin-connections";

export const getAdminConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperationsAdmin } = await import("./admin-operations.server");
    await assertOperationsAdmin(context);
    const { readConnectionSettings } = await import("./admin-connections.server");
    return readConnectionSettings();
  });

export const saveAdminConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseConnectionInput)
  .handler(async ({ context, data }) => {
    const { assertOperationsAdmin } = await import("./admin-operations.server");
    await assertOperationsAdmin(context);
    const { saveConnectionSettings } = await import("./admin-connections.server");
    return saveConnectionSettings(data, context.userId);
  });

export const testAdminConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        provider: z.enum(["github", "supabase"]),
        revision: z.number().int().nonnegative(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { assertOperationsAdmin } = await import("./admin-operations.server");
    await assertOperationsAdmin(context);
    const { testSavedConnection } = await import("./admin-connections.server");
    return testSavedConnection(data.provider, data.revision);
  });
