import { parseEnv } from "node:util";

export function sandboxEnvironment(sourceText, sandboxText, system = process.env) {
  const source = parseEnv(sourceText);
  const draft = parseEnv(sandboxText);
  const required = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ];
  for (const name of required) {
    if (!draft[name]?.trim())
      throw new Error(`Set ${name} in .env.sandbox.local before starting the sandbox.`);
  }
  const origin = (value) => {
    const url = new URL(value);
    if (url.username || url.password || !["http:", "https:"].includes(url.protocol))
      throw new Error("Invalid database URL.");
    return url.origin;
  };
  const target = origin(draft.SUPABASE_URL);
  if (target !== origin(draft.VITE_SUPABASE_URL))
    throw new Error("Sandbox browser and server must use the same Supabase project.");
  if (draft.SUPABASE_PUBLISHABLE_KEY !== draft.VITE_SUPABASE_PUBLISHABLE_KEY)
    throw new Error("Sandbox browser and server publishable keys must match.");
  const liveUrls = [
    source.SUPABASE_URL,
    source.VITE_SUPABASE_URL,
    system.SUPABASE_URL,
    system.VITE_SUPABASE_URL,
    system.DGD_PRODUCTION_SUPABASE_URL,
  ].filter(Boolean);
  if (!liveUrls.length)
    throw new Error(
      "Set the production SUPABASE_URL in .env or DGD_PRODUCTION_SUPABASE_URL so sandbox isolation can be checked.",
    );
  if (liveUrls.some((url) => origin(url) === target))
    throw new Error(
      "Sandbox points to the live Supabase project. Choose a separate sandbox project.",
    );
  // Carry OS/runtime essentials only. App/provider credentials never inherit.
  const env = Object.fromEntries(
    Object.entries(system).filter(([name]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOME|LANG|TERM)$/i.test(
        name,
      ),
    ),
  );
  if (/^(sk|rk)_live_/.test(draft.STRIPE_SECRET_KEY ?? ""))
    throw new Error("Sandbox requires Stripe test credentials, never live payment keys.");
  if (/^sb_secret_/.test(draft.VITE_SUPABASE_PUBLISHABLE_KEY ?? ""))
    throw new Error("A secret key cannot be used as the sandbox browser key.");
  Object.assign(env, draft, {
    NODE_ENV: "development",
    DGD_SANDBOX: "1",
    VITE_DGD_ENVIRONMENT: "sandbox",
    DGD_PRODUCTION_SUPABASE_URL: liveUrls[0],
    PUBLIC_APP_URL: "http://127.0.0.1:5190",
    APP_ORIGIN: "http://127.0.0.1:5190",
    VITE_DGD_STUDIO_ORIGIN: draft.VITE_DGD_STUDIO_ORIGIN || "http://127.0.0.1:5180",
  });
  // Provider-management and production publish credentials have no place in previews.
  for (const name of [
    "SUPABASE_MANAGEMENT_TOKEN",
    "GITHUB_TOKEN",
    "DATABASE_URL",
    "LOVABLE_DB_MIGRATION_URL",
    "BASE44_API_KEY",
    "BASE44_ACCESS_TOKEN",
    "ADMIN_CONNECTIONS_DIRECTORY",
    "ADMIN_CONNECTIONS_ENCRYPTION_KEY",
  ])
    delete env[name];
  return env;
}
