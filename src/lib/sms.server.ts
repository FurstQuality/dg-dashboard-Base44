// Server-only SMS helper. Uses the Lovable Twilio connector gateway when a
// Twilio connection is linked to this project (managed auth via
// TWILIO_API_KEY + LOVABLE_API_KEY). Falls back to no-op with a clear reason
// so the app keeps working when SMS isn't configured yet.

export type SendSmsResult =
  | { sent: true; sid: string }
  | { sent: false; reason: "not_configured" | "invalid_number" | "provider_error"; error?: string };

function normalizeE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D+/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.LOVABLE_API_KEY &&
    process.env.TWILIO_API_KEY &&
    (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID),
  );
}

export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  const from = process.env.TWILIO_FROM_NUMBER;
  const msgService = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!lovableKey || !twilioKey || (!from && !msgService)) {
    return { sent: false, reason: "not_configured" };
  }

  const e164 = normalizeE164(to);
  if (!e164) return { sent: false, reason: "invalid_number" };

  const params = new URLSearchParams();
  params.set("To", e164);
  if (msgService) params.set("MessagingServiceSid", msgService);
  else params.set("From", from!);
  params.set("Body", body.slice(0, 1500));

  try {
    // Gateway automatically prepends /2010-04-01/Accounts/{AccountSid}
    const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": twilioKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[sms] Twilio gateway ${res.status}: ${text}`);
      return { sent: false, reason: "provider_error", error: text.slice(0, 300) };
    }
    const json = (await res.json()) as { sid?: string };
    return { sent: true, sid: json.sid ?? "" };
  } catch (err: any) {
    return { sent: false, reason: "provider_error", error: err?.message?.slice(0, 300) };
  }
}
