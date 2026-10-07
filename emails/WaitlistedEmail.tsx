import { COLORS, EmailShell, Eyebrow, Paragraph, Title } from "./_shared";

/**
 * Sent when an organizer waitlists an application. Deliberately no button:
 * there's nothing for them to do, and a call to action would imply there is.
 */

export type WaitlistedEmailProps = {
  firstName: string;
  eventName: string;
};

export default function WaitlistedEmail({ firstName, eventName }: WaitlistedEmailProps) {
  return (
    <EmailShell preview={`You're on the waitlist for ${eventName}.`}>
      <Eyebrow color={COLORS.purple}>// WAITLISTED</Eyebrow>

      <Title>You&apos;re on the waitlist, {firstName}</Title>

      <Paragraph>
        We got more applications for {eventName} than we have room for, so we&apos;ve put you on
        the waitlist. It&apos;s a real one: if a spot opens up, we&apos;ll email you.
      </Paragraph>

      <Paragraph last>
        We can&apos;t promise a spot will open, so don&apos;t hold off on other plans for it. There&apos;s
        nothing you need to do right now.
      </Paragraph>
    </EmailShell>
  );
}

WaitlistedEmail.PreviewProps = {
  firstName: "Mariana",
  eventName: "HackJam '26",
} satisfies WaitlistedEmailProps;
