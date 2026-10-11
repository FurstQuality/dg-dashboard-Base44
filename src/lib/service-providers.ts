/** Shared configuration metadata only. Never return credential values to the UI. */
type ProviderEnvironment = Record<string, string | undefined>;

export function firecrawlProvider(env: ProviderEnvironment) {
  const legacy = !!env.FIRECRAWL_API_KEY?.trim().startsWith("lovc_");
  return {
    id: legacy ? "lovable" as const : "firecrawl" as const,
    mode: legacy ? "Lovable gateway · Legacy" : "Firecrawl · Direct",
    keys: legacy ? ["LOVABLE_API_KEY", "FIRECRAWL_API_KEY"] : ["FIRECRAWL_API_KEY"],
    endpoint: legacy ? "https://connector-gateway.lovable.dev/firecrawl/v2" : "https://api.firecrawl.dev/v2",
    setup: "https://www.firecrawl.dev/app",
  };
}

export function smsProvider(env: ProviderEnvironment) {
  const direct = !!env.TWILIO_ACCOUNT_SID?.trim() || !!env.TWILIO_API_SECRET?.trim() || !env.LOVABLE_API_KEY?.trim();
  return {
    id: direct ? "twilio" as const : "lovable" as const,
    mode: direct ? "Twilio · Direct" : "Lovable gateway · Legacy",
    keys: direct ? ["TWILIO_ACCOUNT_SID", "TWILIO_API_KEY", "TWILIO_API_SECRET"] : ["LOVABLE_API_KEY", "TWILIO_API_KEY"],
    setup: "https://console.twilio.com",
  };
}

export function calendarProvider(env: ProviderEnvironment) {
  const direct = !!env.GOOGLE_CLIENT_ID?.trim() || !!env.GOOGLE_CLIENT_SECRET?.trim() || !env.GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY?.trim();
  return {
    id: direct ? "google" as const : "lovable" as const,
    mode: direct ? "Google Calendar · Direct" : "Lovable gateway · Legacy",
    keys: direct ? ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "APP_USER_CONNECTION_KEY_SECRET"] : ["LOVABLE_API_KEY", "GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY", "APP_USER_CONNECTION_KEY_SECRET"],
    setup: "https://console.cloud.google.com/apis/credentials",
  };
}

export function aceProvider(env: ProviderEnvironment) {
  // Direct credentials take precedence. A failed direct request must never send
  // the same private conversation to a second provider as an automatic fallback.
  const direct = !!env.OPENAI_API_KEY?.trim() || !env.LOVABLE_API_KEY?.trim();
  return direct
    ? {
        id: "openai" as const,
        mode: "OpenAI · Direct",
        key: "OPENAI_API_KEY",
        model: env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
        endpoint: "https://api.openai.com/v1/chat/completions",
        setup: "https://platform.openai.com/api-keys",
      }
    : {
        id: "lovable" as const,
        mode: "Lovable gateway · Legacy",
        key: "LOVABLE_API_KEY",
        model: "google/gemini-2.5-flash",
        endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
        setup: "https://docs.lovable.dev/integrations/ai",
      };
}

export function transactionalEmailProvider(env: ProviderEnvironment) {
  const direct = !!env.RESEND_API_KEY?.trim() || !env.LOVABLE_API_KEY?.trim();
  return direct
    ? {
        id: "resend" as const,
        mode: "Resend · Direct",
        keys: ["RESEND_API_KEY", "EMAIL_FROM"],
        setup: "https://resend.com/domains",
      }
    : {
        id: "lovable" as const,
        mode: "Lovable gateway · Legacy",
        keys: ["LOVABLE_API_KEY"],
        setup: "https://docs.lovable.dev/integrations/introduction",
      };
}
