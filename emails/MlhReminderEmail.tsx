import { Button, Callout, COLORS, EmailShell, Eyebrow, Paragraph, PasteLink, Title } from "./_shared";

/**
 * The week-before nudge to finish MLH registration (PLAT-26).
 *
 * Accepted hackers were told about MLH twice already — once on applying, once
 * on acceptance — but both landed before the event felt real, and MLH
 * registration is what actually gates getting in the door.
 *
 * Written on the assumption that most recipients have already done it, because
 * we have no way of knowing: MLH registration lives in OrganizerHQ and nothing
 * reports back who completed it. So this reads as a last call rather than an
 * accusation, and says outright that it can be ignored if it's done. Getting
 * that wrong would mean telling a few dozen people who did the right thing
 * that they hadn't.
 *
 * "MLH" throughout, never "OrganizerHQ" — same reason as ConfirmationEmail:
 * the destination says MLH nowhere near the name OrganizerHQ, and the mismatch
 * reads as a broken link before it's clicked.
 */

export type MlhReminderEmailProps = {
  firstName: string;
  eventName: string;
  /** Already formatted for reading, e.g. "November 7" — the sender formats it. */
  eventDate: string;
  /** Event.organizerHqUrl, read at send time. */
  organizerHqUrl: string;
};

export default function MlhReminderEmail({
  firstName,
  eventName,
  eventDate,
  organizerHqUrl,
}: MlhReminderEmailProps) {
  return (
    <EmailShell preview={`${eventName} is on ${eventDate} — make sure you're registered with MLH.`}>
      <Eyebrow color={COLORS.amber}>// LAST CALL &mdash; MLH REGISTRATION</Eyebrow>

      <Title>One thing before {eventName}, {firstName}</Title>

      <Paragraph>
        {eventName} is on {eventDate} and your spot is confirmed with us. The
        last thing standing between you and the door is MLH registration.
      </Paragraph>

      <Callout accent={COLORS.amber} label="REQUIRED TO ATTEND">
        Registering with us is not the same as registering with MLH. Every
        hacker has to do it separately, it takes about a minute, and we
        can&apos;t check you in without it.
      </Callout>

      <Button href={organizerHqUrl}>REGISTER WITH MLH &rarr;</Button>
      <PasteLink href={organizerHqUrl} />

      {/* We genuinely cannot tell who has already registered, so this line is
          doing real work — without it, everyone who did it weeks ago reads
          this as being told off. */}
      <Paragraph last>
        Already done it? You&apos;re all set &mdash; nothing to do, see you on{" "}
        {eventDate}.
      </Paragraph>
    </EmailShell>
  );
}

MlhReminderEmail.PreviewProps = {
  firstName: "Mariana",
  eventName: "HackJam '26",
  eventDate: "November 7",
  organizerHqUrl: "https://events.mlh.com/events/14412-hackjam-26?intent=register",
} satisfies MlhReminderEmailProps;
