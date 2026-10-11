import { secrets } from "base44:runtime";
import publicConfig from "../deployment/base44/public-config.json";

// Base44's Worker bindings stay on the server. Only the explicitly public
// Supabase URL/key are also compiled into the browser by vite.base44.config.ts.
const serverSettings = [
  "APP_ORIGIN", "PUBLIC_APP_URL",
  "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "IAP_WEBHOOK_SECRET",
  "OPENAI_API_KEY", "OPENAI_MODEL", "RESEND_API_KEY", "EMAIL_FROM", "FIRECRAWL_API_KEY",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI",
  "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
  "GITHUB_TOKEN", "GITHUB_REPOSITORY", "GITHUB_BRANCH", "SUPABASE_MANAGEMENT_TOKEN",
] as const;

export default {
  async fetch(request: Request, env: unknown, context: unknown) {
    process.env.SUPABASE_URL = publicConfig.url;
    process.env.SUPABASE_PUBLISHABLE_KEY = publicConfig.publishableKey;
    process.env.PREVIEW_FRAME_ORIGINS = "https://app.base44.com";
    // A Worker filesystem is not a persistent credential vault.
    process.env.DGD_HOSTED_RUNTIME = "base44";
    for (const name of serverSettings) {
      const value = secrets.get(name);
      if (value) process.env[name] = value;
      else delete process.env[name];
    }
    const { default: server } = await import("./server");
    return server.fetch(request, env, context);
  },
};
