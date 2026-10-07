import { Link, Text } from "@react-email/components";
import { Button, Callout, COLORS, EmailShell, Eyebrow, Paragraph, PasteLink, Spacer, Title } from "./_shared";

/**
 * Sent when an organizer accepts an application. Two things to do, in order
 * of importance: RSVP (the one big button), then MLH registration (a plain
 * link — it's the same ask the confirmation email already made, so it's
 * restated here rather than competing with RSVP for attention).
 */

export type AcceptedEmailProps = {
  firstName: string;
  eventName: string;
  /**
   * TODO(rsvp): RSVP isn't built yet. This comes from the RSVP_URL env var at
   * send time (see src/app/api/jobs/send-queued/route.ts) and must point at a
   * real RSVP page before any ACCEPTED email goes out.
   */
  rsvpUrl: string;
  /** Same link the confirmation email uses — Event.organizerHqUrl. */
  organizerHqUrl: string;
};

export default function AcceptedEmail({ firstName, eventName, rsvpUrl, organizerHqUrl }: AcceptedEmailProps) {
  return (
    <EmailShell preview={`You're in. Confirm your spot at ${eventName}.`}>
      <Eyebrow color={COLORS.teal}>// ACCEPTED</Eyebrow>

      <Title>You&apos;re in, {firstName}</Title>

      <Paragraph>
        We&apos;d love to have you at {eventName}. Confirm you&apos;re coming so we can hold your spot.
      </Paragraph>

      <Callout accent={COLORS.pink} label="STEP 1 — CONFIRM YOUR SPOT">
        Let us know you&apos;re coming. It takes a few seconds.
      </Callout>

      <Button href={rsvpUrl}>CONFIRM I&apos;M COMING &rarr;</Button>
      <PasteLink href={rsvpUrl} />

      <Spacer height={28} />

      <Callout accent={COLORS.amber} label="STEP 2 — REGISTER WITH MLH (REQUIRED)">
        Being accepted here does not register you with MLH. Every hacker has to
        register with MLH separately before the event, and it&apos;s required to
        attend. Skip this if you already did it after applying.
      </Callout>

      <Text style={{ color: COLORS.textDim, fontSize: "11px", lineHeight: 1.6, margin: "12px 0 0", wordBreak: "break-all" }}>
        Register here:
        <br />
        <Link href={organizerHqUrl} style={{ color: COLORS.teal }}>
          {organizerHqUrl}
        </Link>
      </Text>
    </EmailShell>
  );
}

AcceptedEmail.PreviewProps = {
  firstName: "Mariana",
  eventName: "HackJam '26",
  // TODO(rsvp): placeholder until the RSVP page exists.
  rsvpUrl: process.env.RSVP_URL || "https://apply.hackjam26.com/rsvp",
  organizerHqUrl: "https://events.mlh.com/events/14412-hackjam-26?intent=register",
} satisfies AcceptedEmailProps;
