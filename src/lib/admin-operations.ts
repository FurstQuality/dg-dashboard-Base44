import { aceProvider, transactionalEmailProvider } from "./service-providers";

export const OPERATION_SECTIONS = [
  "overview",
  "connections",
  "connectors",
  "database",
  "users",
  "storage",
  "emails",
  "secrets",
  "jobs",
  "functions",
  "sql",
  "logs",
  "usage",
  "ai",
  "agents",
  "payments",
  "security",
  "seo",
  "knowledge",
  "domains",
  "git",
] as const;
export type OperationSection = (typeof OPERATION_SECTIONS)[number];
export const OPERATION_LABELS: Record<OperationSection, string> = {
  overview: "Overview",
  connections: "Connections",
  connectors: "Connectors",
  database: "Database",
  users: "Users",
  storage: "Storage",
  emails: "Emails",
  secrets: "Secrets",
  jobs: "Jobs",
  functions: "Edge functions",
  sql: "SQL editor",
  logs: "Logs",
  usage: "Usage",
  ai: "AI activity",
  agents: "Agent integrations",
  payments: "Payments",
  security: "Security",
  seo: "SEO & AI search",
  knowledge: "Project knowledge",
  domains: "Domains",
  git: "Git",
};
export const CONNECTOR_CATALOG = [
  {id: "gemini", name: "Gemini map detection", category: "AI", mode: "Direct", keys: ["GEMINI_API_KEY"], setup: "https://aistudio.google.com/apikey", description: "Detect tee pads and baskets in course map images. Review candidates before importing."},
  {
    id: "supabase",
    name: "Supabase",
    category: "Cloud",
    mode: "Direct",
    keys: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    setup: "https://supabase.com/dashboard",
    description: "Database, authentication, storage and app data.",
  },
  {
    id: "management",
    name: "Supabase management",
    category: "Cloud",
    mode: "Direct",
    keys: ["SUPABASE_MANAGEMENT_TOKEN"],
    setup: "https://supabase.com/dashboard/account/tokens",
    description: "Database tools, backups, Edge secrets, functions and security advisors.",
  },
  {
    id: "google-auth",
    name: "Google sign-in",
    category: "Identity",
    mode: "Direct",
    keys: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"],
    setup: "https://console.cloud.google.com/apis/credentials",
    description: "Google OAuth through Supabase. Provider activation must be verified separately.",
  },
  {
    id: "calendar",
    name: "Google Calendar",
    category: "Connectors",
    mode: "Lovable gateway",
    keys: [
      "LOVABLE_API_KEY",
      "GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY",
      "APP_USER_CONNECTION_KEY_SECRET",
    ],
    setup: "https://docs.lovable.dev/integrations/introduction",
    description:
      "Existing per-user calendar connector. Direct Google Calendar OAuth is still required to remove this gateway dependency.",
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    category: "Connectors",
    mode: "Lovable gateway",
    keys: ["LOVABLE_API_KEY", "FIRECRAWL_API_KEY"],
    setup: "https://www.firecrawl.dev/app",
    description: "Course and event source imports currently use Lovable connection keys.",
  },
  {
    id: "search-console",
    name: "Google Search Console",
    category: "Search",
    mode: "Setup required",
    keys: [],
    setup: "https://search.google.com/search-console",
    description:
      "Verify the domain and grant access in Google. A direct OAuth integration has not been installed.",
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    mode: "Direct",
    keys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    setup: "https://dashboard.stripe.com",
    description: "Subscriptions, checkout and billing webhook processing.",
  },
  {
    id: "ai",
    name: "Ace AI",
    category: "AI",
    mode: "OpenAI · Direct",
    keys: ["OPENAI_API_KEY"],
    setup: "https://platform.openai.com/api-keys",
    description: "Ace chat and guest scorecard guidance use OpenAI when configured. Existing installations can retain their legacy provider until migration.",
  },
  {
    id: "email",
    name: "Transactional email",
    category: "Messaging",
    mode: "Resend · Direct",
    keys: ["RESEND_API_KEY", "EMAIL_FROM"],
    setup: "https://resend.com/domains",
    description: "Event invitations and kiosk signup emails use Resend when configured. Supabase sign-in and password reset emails need separate Auth SMTP settings.",
  },
  {
    id: "push",
    name: "Web push",
    category: "Messaging",
    mode: "Direct",
    keys: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    setup: "https://developer.mozilla.org/en-US/docs/Web/API/Push_API",
    description: "Browser push notifications using your VAPID key pair.",
  },
  {
    id: "sms",
    name: "Twilio",
    category: "Messaging",
    mode: "Lovable gateway",
    keys: [
      "LOVABLE_API_KEY",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_API_KEY",
      "TWILIO_API_SECRET",
      "TWILIO_FROM_NUMBER",
    ],
    setup: "https://console.twilio.com",
    description: "SMS delivery currently goes through the connector gateway.",
  },
  {
    id: "github",
    name: "GitHub",
    category: "Development",
    mode: "Direct",
    keys: ["GITHUB_REPOSITORY", "GITHUB_TOKEN"],
    setup: "https://github.com/settings/personal-access-tokens",
    description: "Read repository, branch and deployment commit status with a scoped token.",
  },
] as const;

export type OperationsOverview = {
  checkedAt: string;
  projectRef: string | null;
  publicUrl: string | null;
  connectors: {
    id: string;
    configured: boolean;
    missing: string[];
    state: "configured" | "missing" | "setup";
    mode: string;
    setup: string;
  }[];
  runtime: { name: string; configured: boolean }[];
};
export type OperationValue =
  string | number | boolean | null | OperationValue[] | { [key: string]: OperationValue };
export type OperationResult = {
  checkedAt: string;
  rows: Record<string, OperationValue>[];
  note?: string;
  more?: boolean;
};

/** Never call mere environment presence a verified connection. */
export function connectorReadiness(
  env: Record<string, string | undefined>,
): OperationsOverview["connectors"] {
  return CONNECTOR_CATALOG.map((c) => {
    const provider = c.id === "ai" ? aceProvider(env)
      : c.id === "email" ? transactionalEmailProvider(env) : null;
    const keys: readonly string[] = provider
      ? ("keys" in provider ? provider.keys : [provider.key]) : c.keys;
    const missing = keys.filter((key) => !env[key]?.trim());
    return {
      id: c.id,
      configured: keys.length > 0 && missing.length === 0,
      missing,
      state: keys.length === 0 ? "setup" : missing.length ? "missing" : "configured",
      mode: provider?.mode ?? c.mode,
      setup: provider?.setup ?? c.setup,
    };
  });
}
