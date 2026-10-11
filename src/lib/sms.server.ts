// Server-only SMS delivery. Direct account credentials take priority.
import { smsProvider } from "./service-providers";

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
  const provider = smsProvider(process.env);
  return provider.keys.every(key => !!process.env[key]?.trim()) &&
    !!(process.env.TWILIO_FROM_NUMBER?.trim() || process.env.TWILIO_MESSAGING_SERVICE_SID?.trim());
}

export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  const provider = smsProvider(process.env);
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const msgService = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (!isSmsConfigured()) {
    return { sent: false, reason: "not_configured" };
  }

  const e164 = normalizeE164(to);
  if (!e164) return { sent: false, reason: "invalid_number" };
  const account = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (provider.id === "twilio" && !/^AC[0-9a-f]{32}$/i.test(account ?? "")) {
    return { sent: false, reason: "not_configured" };
  }

  const params = new URLSearchParams();
  params.set("To", e164);
  if (msgService) params.set("MessagingServiceSid", msgService);
  else params.set("From", from!);
  params.set("Body", body.slice(0, 1500));

  try {
    const endpoint = provider.id === "twilio"
      ? `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`
      : "https://connector-gateway.lovable.dev/twilio/Messages.json";
    const authHeaders: Record<string, string> = provider.id === "twilio"
      ? { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_API_KEY!.trim()}:${process.env.TWILIO_API_SECRET!.trim()}`).toString("base64")}` }
      : { Authorization: `Bearer ${process.env.LOVABLE_API_KEY!.trim()}`, "X-Connection-Api-Key": process.env.TWILIO_API_KEY!.trim() };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(20_000), redirect: "error",
    });
    if (!res.ok) {
      return { sent: false, reason: "provider_error", error: "SMS provider declined the request." };
    }
    const json = (await res.json()) as { sid?: string };
    if (!json.sid) return { sent: false, reason: "provider_error", error: "SMS provider returned no message receipt." };
    return { sent: true, sid: json.sid };
  } catch {
    return { sent: false, reason: "provider_error", error: "SMS delivery could not be confirmed." };
  }
}
