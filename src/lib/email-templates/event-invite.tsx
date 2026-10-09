import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  inviter_name?: string;
  event_title?: string;
  event_kind_label?: string;
  event_when?: string | null;
  event_where?: string | null;
  personal_message?: string | null;
  rsvp_url?: string;
}

const brand = "#0ea5e9";
const main = {
  backgroundColor: "#ffffff",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
};
const container = { maxWidth: "560px", margin: "0 auto", padding: "32px 24px" };
const card = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "24px",
  background: "#f8fafc",
};
const meta = { fontSize: "14px", color: "#475569", margin: "4px 0" };
const btn = {
  backgroundColor: brand,
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "10px",
  textDecoration: "none",
  fontWeight: 600,
  display: "inline-block",
};

const EventInviteEmail = ({
  inviter_name = "A friend",
  event_title = "a disc golf event",
  event_kind_label = "Event",
  event_when,
  event_where,
  personal_message,
  rsvp_url = "https://dgdashboard.app",
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {inviter_name} invited you to {event_title} on DG Dashboard
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Text
          style={{
            color: brand,
            fontWeight: 700,
            letterSpacing: "0.08em",
            fontSize: "12px",
            textTransform: "uppercase",
          }}
        >
          DG Dashboard · Event invite
        </Text>
        <Heading style={{ margin: "8px 0 16px", fontSize: "22px", color: "#0f172a" }}>
          {inviter_name} invited you to {event_title}
        </Heading>
        <Section style={card}>
          <Text style={{ ...meta, fontWeight: 600, color: "#0f172a" }}>{event_kind_label}</Text>
          <Text style={{ ...meta, fontSize: "16px", color: "#0f172a" }}>{event_title}</Text>
          {event_when ? <Text style={meta}>🗓 {event_when}</Text> : null}
          {event_where ? <Text style={meta}>📍 {event_where}</Text> : null}
        </Section>
        {personal_message ? (
          <>
            <Text
              style={{ marginTop: "20px", color: "#334155", fontSize: "14px", fontStyle: "italic" }}
            >
              "{personal_message}"
            </Text>
            <Text style={{ color: "#94a3b8", fontSize: "12px" }}>— {inviter_name}</Text>
          </>
        ) : null}
        <Section style={{ marginTop: "24px", textAlign: "center" as const }}>
          <Button href={rsvp_url} style={btn}>
            View event & RSVP
          </Button>
        </Section>
        <Text
          style={{
            marginTop: "16px",
            fontSize: "13px",
            color: "#64748b",
            textAlign: "center" as const,
          }}
        >
          Or open this link:{" "}
          <Link href={rsvp_url} style={{ color: brand }}>
            {rsvp_url}
          </Link>
        </Text>
        <Hr style={{ margin: "32px 0 16px", borderColor: "#e5e7eb" }} />
        <Text style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center" as const }}>
          DG Dashboard is the disc golf platform for scoring, stats, events, and your crew.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: EventInviteEmail,
  subject: (d: Record<string, any>) =>
    `${d.inviter_name ?? "A friend"} invited you to ${d.event_title ?? "an event"} on DG Dashboard`,
  displayName: "Event invite",
  previewData: {
    inviter_name: "Alex Furst",
    event_title: "Ledgestone Flex — Maxwell Park",
    event_kind_label: "Tournament",
    event_when: "Mon, Jul 27 at 10:50 am",
    event_where: "Maxwell Park, Peoria IL",
    personal_message: "Would love to have you on the card!",
    rsvp_url: "https://dgdashboard.app/invite/example-token",
  },
} satisfies TemplateEntry;
