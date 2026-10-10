import { transactionalEmailProvider } from "../service-providers";

export type EmailDelivery = {
  to: string;
  subject: string;
  html: string;
  text: string;
  label: string;
  idempotencyKey: string;
  replyTo?: string;
};
export type EmailDeliveryResult = { sent: true } | { sent: false; reason: "recipient_suppressed" };

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** No failover or automatic retries: preserve one recipient and one send identity. */
export async function deliverTransactionalEmail(mail: EmailDelivery): Promise<EmailDeliveryResult> {
  const provider = transactionalEmailProvider(process.env);
  const missing = provider.keys.filter((key) => !process.env[key]?.trim());
  if (missing.length)
    throw new EmailDeliveryError(
      `Email is not configured. Set ${missing.join(" and ")} on the app server.`,
    );
  if (!/^[\x21-\x7e]{1,256}$/.test(mail.idempotencyKey))
    throw new EmailDeliveryError(
      "Email idempotency key must contain 1–256 printable characters without spaces.",
    );

  if (provider.id === "lovable") {
    const { EmailAPIError, sendLovableEmail } = await import("@lovable.dev/email-js");
    try {
      await sendLovableEmail(
        {
          to: mail.to,
          from: "dgdashboard <noreply@notify.dgdashboard.app>",
          sender_domain: "notify.dgdashboard.app",
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          purpose: "transactional",
          label: mail.label,
          idempotency_key: mail.idempotencyKey,
          reply_to: mail.replyTo,
        },
        { apiKey: process.env.LOVABLE_API_KEY!.trim(), sendUrl: process.env.LOVABLE_SEND_URL },
      );
    } catch (error) {
      if (error instanceof EmailAPIError && error.code === "recipient_suppressed")
        return { sent: false, reason: "recipient_suppressed" };
      throw new EmailDeliveryError("Email delivery failed. Check the legacy email provider.");
    }
    return { sent: true };
  }

  // Must be an address/domain verified in the user's Resend account. Do not
  // silently reuse the sender that was previously delegated to Lovable.
  const from = process.env.EMAIL_FROM!.trim();
  if (/[\r\n]/.test(from) || !from.includes("@"))
    throw new EmailDeliveryError("EMAIL_FROM must be a sender address verified in Resend.");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": mail.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    });
    if (!response.ok)
      throw new EmailDeliveryError(
        `Email provider returned HTTP ${response.status}. Check the API key, verified sender and sending limits.`,
        response.status,
      );
    const result = await response.json();
    if (typeof result?.id !== "string" || !result.id.trim())
      throw new EmailDeliveryError(
        "Email provider did not confirm acceptance. Check its delivery log before retrying.",
      );
    return { sent: true };
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    // A timeout can follow an accepted request. Reuse the same idempotency key.
    throw new EmailDeliveryError(
      "Email delivery could not be confirmed. Check the provider log and reuse the same send identifier when retrying.",
    );
  }
}
