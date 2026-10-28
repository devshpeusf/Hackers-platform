import { Link, Text } from "@react-email/components";
import { COLORS, EmailShell, Eyebrow, Title } from "./_shared";
import { parseMessage, type Run } from "../src/lib/broadcast-format";

/**
 * An announcement from /admin/email. The organizer's message arrives as plain
 * text with a little formatting; parseMessage turns it into blocks of runs
 * (never HTML), rendered here with the same shell as every other email.
 */

export type AnnouncementEmailProps = {
  firstName: string;
  eventName: string;
  subject: string;
  body: string;
};

const textStyle = { color: COLORS.textMuted, fontSize: "14px", lineHeight: 1.7, margin: "0 0 16px" };

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((run, i) =>
        run.kind === "bold" ? (
          <strong key={i} style={{ color: COLORS.textPrimary }}>
            {run.text}
          </strong>
        ) : run.kind === "link" ? (
          <Link key={i} href={run.href} style={{ color: COLORS.teal, wordBreak: "break-all" }}>
            {run.href}
          </Link>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  );
}

export default function AnnouncementEmail({ firstName, eventName, subject, body }: AnnouncementEmailProps) {
  const blocks = parseMessage(body);
  return (
    <EmailShell preview={subject}>
      <Eyebrow color={COLORS.pink}>{`// ${eventName.toUpperCase()}`}</Eyebrow>
      <Title>{subject}</Title>
      <Text style={textStyle}>Hi {firstName},</Text>
      {blocks.map((block, i) =>
        block.kind === "paragraph" ? (
          <Text key={i} style={textStyle}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Runs runs={line} />
              </span>
            ))}
          </Text>
        ) : (
          <ul key={i} style={{ ...textStyle, paddingLeft: "20px" }}>
            {block.items.map((item, j) => (
              <li key={j} style={{ margin: "0 0 6px" }}>
                <Runs runs={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </EmailShell>
  );
}

AnnouncementEmail.PreviewProps = {
  firstName: "Mariana",
  eventName: "HackJam '26",
  subject: "Parking is set for Saturday",
  body: "Quick update before the weekend:\n\n- Park in **Lot 18**, it's free after 5pm\n- Check-in opens at **8:30am** in ENB\n\nQuestions? Ask in Discord: https://discord.gg/N9bjk9hmE\n\nSee you there!",
} satisfies AnnouncementEmailProps;
