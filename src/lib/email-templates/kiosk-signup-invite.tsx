import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  guest_name?: string;
  event_title?: string;
  event_subtitle?: string | null;
  signup_url?: string;
}

const brand = "#0ea5e9";
const main = {
  backgroundColor: "#ffffff",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
};
const container = { maxWidth: "560px", margin: "0 auto", padding: "32px 24px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.6" };
const btn = {
  backgroundColor: brand,
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "10px",
  textDecoration: "none",
  fontWeight: 600,
  display: "inline-block",
};

const KioskSignupInviteEmail = ({
  guest_name = "there",
  event_title = "your event",
  event_subtitle,
  signup_url = "https://dgdashboard.app/auth",
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Create your DG Dashboard account and keep your scores</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={{ fontSize: "22px", color: "#0f172a", margin: "0 0 16px" }}>
          Nice round, {guest_name}
        </Heading>
        <Text style={text}>
          You checked in at <strong>{event_title}</strong>
          {event_subtitle ? ` (${event_subtitle})` : ""} on a DG Dashboard kiosk and asked for a
          sign-up link.
        </Text>
        <Text style={text}>
          Create your account to keep your scorecards, track your rating, follow friends, and check
          in with a QR player pass next time.
        </Text>
        <Button style={btn} href={signup_url}>
          Create my account
        </Button>
        <Text style={{ ...text, fontSize: "13px", color: "#64748b", marginTop: "24px" }}>
          If you didn't ask for this, you can ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default KioskSignupInviteEmail;

export const template: TemplateEntry = {
  component: KioskSignupInviteEmail,
  subject: (data) => `Keep your scores from ${data.event_title ?? "today's round"}`,
  displayName: "Kiosk sign-up invite",
  previewData: {
    guest_name: "Casey",
    event_title: "Thursday Doubles League",
    event_subtitle: "Riverbend DGC",
    signup_url: "https://dgdashboard.app/auth",
  },
};
