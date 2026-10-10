/** Shared configuration metadata only. Never return credential values to the UI. */
type ProviderEnvironment = Record<string, string | undefined>;

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
