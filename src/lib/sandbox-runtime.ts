import { appOrigin } from "./app-sandbox";

export function sandboxRuntimeStatus(env: Record<string, string | undefined>) {
  const databaseOrigin = appOrigin(env.SUPABASE_URL);
  const browserOrigin = appOrigin(env.VITE_SUPABASE_URL);
  const production = appOrigin(env.DGD_PRODUCTION_SUPABASE_URL);
  return {
    kind: "dgd-sandbox" as const,
    databaseOrigin,
    isolated:
      env.DGD_SANDBOX === "1" &&
      !!databaseOrigin &&
      databaseOrigin === browserOrigin &&
      !!production &&
      databaseOrigin !== production,
  };
}
