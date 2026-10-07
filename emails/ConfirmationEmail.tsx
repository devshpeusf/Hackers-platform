import { Button, Callout, COLORS, EmailShell, Eyebrow, Paragraph, PasteLink, Title } from "./_shared";

/**
 * The confirmation email (PLAT-23) — sent right after a submission is
 * written. Layout, colors and the dark-mode defenses live in _shared.tsx.
 */

export type ConfirmationEmailProps = {
  firstName: string;
  /** Read from the Event record at send time — see actions.ts. */
  organizerHqUrl: string;
};

export default function ConfirmationEmail({ firstName, organizerHqUrl }: ConfirmationEmailProps) {
  return (
    <EmailShell preview="You're on the list — one more step to lock in your spot at HackJam '26.">
      <Eyebrow color={COLORS.teal}>// APPLICATION RECEIVED</Eyebrow>

      <Title>You&apos;re in the pile, {firstName}</Title>

      <Paragraph>
        We&apos;ve got your HackJam &apos;26 application. We&apos;ll be in touch once
        decisions go out — nothing else to do here.
      </Paragraph>

      {/* The one thing this email actually needs someone to act on. Named
          "MLH" throughout, not "OrganizerHQ" — that's the system's internal
          name, not something the link itself says anywhere, and the mismatch
          read as a broken link before it was even clicked. */}
      <Callout accent={COLORS.amber} label="ONE MORE STEP — REQUIRED">
        Applying here does not register you with MLH. Every hacker has to
        register with MLH separately before the event — it only takes a
        minute, and it&apos;s required to attend.
      </Callout>

      <Button href={organizerHqUrl}>REGISTER WITH MLH &rarr;</Button>
      <PasteLink href={organizerHqUrl} />
    </EmailShell>
  );
}

// Fixture for the preview route — a real send always has real values, but
// nothing viewing this in isolation does.
ConfirmationEmail.PreviewProps = {
  firstName: "Mariana",
  organizerHqUrl: "https://events.mlh.com/events/14412-hackjam-26?intent=register",
} satisfies ConfirmationEmailProps;
