import * as React from "react";
import { render } from "@react-email/render";
import { deliverTransactionalEmail, type EmailDeliveryResult } from "./delivery.server";
import { TEMPLATES } from "./registry";

// Server-only. Provider credentials must never be imported by client components.
export type SendTemplateEmailResult = EmailDeliveryResult;

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>;
  /** Dedupes retries of the same logical send; defaults to a random UUID (no dedupe). */
  idempotencyKey?: string;
  replyTo?: string;
}

/**
 * Renders a registered template and uses direct Resend delivery when configured.
 * Existing Lovable installations retain their provider until migrated. A sent
 * result means provider acceptance; delivery/bounce status stays with the provider.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {},
): Promise<SendTemplateEmailResult> {
  const template = TEMPLATES[templateName];
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(", ")}`,
    );
  }

  // Template-level `to` takes precedence — notification templates always
  // send to their fixed address.
  const recipient = template.to || to;
  if (!recipient) {
    throw new Error("Recipient is required (the template defines no fixed recipient)");
  }

  const templateData = options.templateData ?? {};
  const element = React.createElement(template.component, templateData);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject =
    typeof template.subject === "function" ? template.subject(templateData) : template.subject;

  return deliverTransactionalEmail({
    to: recipient,
    subject,
    html,
    text,
    label: templateName,
    idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
    replyTo: options.replyTo,
  });
}
