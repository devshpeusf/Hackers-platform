import { COLORS, EmailShell, Eyebrow, Paragraph, Title } from "./_shared";

/**
 * Sent when an organizer rejects an application. Short and plain: no "you
 * were so close", no implied second chance at this event — just the
 * decision, thanks, and the next events.
 */

export type RejectedEmailProps = {
  firstName: string;
  eventName: string;
};

export default function RejectedEmail({ firstName, eventName }: RejectedEmailProps) {
  return (
    <EmailShell preview={`An update on your ${eventName} application.`}>
      <Eyebrow color={COLORS.textMuted}>// APPLICATION UPDATE</Eyebrow>

      <Title>Thanks for applying, {firstName}</Title>

      <Paragraph>
        We&apos;re not able to offer you a spot at {eventName}. We got more applications than we
        have room for, and we had to turn down people we would have liked to host.
      </Paragraph>

      <Paragraph last>
        SHPE USF runs more events through the year, and you&apos;re welcome to apply to the next
        one.
      </Paragraph>
    </EmailShell>
  );
}

RejectedEmail.PreviewProps = {
  firstName: "Mariana",
  eventName: "HackJam '26",
} satisfies RejectedEmailProps;
