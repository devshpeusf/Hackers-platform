import { Body, Head, Heading, Hr, Html, Link, Preview, Text } from "@react-email/components";

/**
 * The confirmation email (PLAT-23) — sent right after a submission is
 * written. Nothing else yet: no MLH reminder, no decision emails, no
 * scheduled sending — see TASKS.md.
 *
 * Same hex values as src/app/globals.css's @theme block, copied literally
 * rather than referenced — email clients don't support CSS custom
 * properties (or in Outlook's case, most of CSS). Keep the two palettes in
 * sync by hand if the design tokens ever change.
 */
const COLORS = {
  bg: "#07060d",
  card: "#120f1f",
  border: "#1a1530",
  textPrimary: "#f4f1fb",
  textMuted: "#9a94b0",
  textDim: "#7d7896",
  pink: "#ff2e97",
  teal: "#21e6c1",
  amber: "#ffd9a0",
};

// Space Mono itself won't render in most email clients — custom @font-face
// is unreliable at best and outright stripped in Outlook desktop — so this
// is a system monospace stack that evokes the same feel without depending
// on a web font actually loading.
const MONO = "'Courier New', Courier, monospace";

export type ConfirmationEmailProps = {
  firstName: string;
  /** Read from the Event record at send time — see actions.ts. */
  organizerHqUrl: string;
};

export default function ConfirmationEmail({ firstName, organizerHqUrl }: ConfirmationEmailProps) {
  return (
    <Html>
      <Head>
        {/*
          Some clients (Outlook.com, some Android/Gmail builds) auto-invert
          colors they infer as "light on dark" when the user's device is in
          dark mode — inverting per-element rather than understanding this
          is already an intentionally dark design. These two tags tell a
          client that supports them "this design already handles both
          schemes, don't touch it." They don't help clients that ignore them
          entirely, which is why every background below is still set
          explicitly on the table cell itself rather than assumed.
        */}
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>You&apos;re on the list — one more step to lock in your spot at HackJam &apos;26.</Preview>
      {/* Body still gets an explicit background — the earlier version
          dropped this on the theory that relying on it was the risk, but
          "relying on it alone" and "having it at all" aren't the same
          thing. Without it, anything the table below doesn't fully cover
          (in whatever a given client's viewport actually is) falls through
          to that client's own default, which is exactly the light-grey gap
          that showed up. The <td> backgrounds below remain the real
          per-cell defense against dark-mode inversion; this is a second,
          independent layer under them, not a replacement for them. */}
      <Body style={{ margin: 0, padding: 0, backgroundColor: COLORS.bg, fontFamily: MONO }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          bgcolor={COLORS.bg}
          style={{ backgroundColor: COLORS.bg, width: "100%" }}
        >
          <tbody>
            <tr>
              <td align="center" bgcolor={COLORS.bg} style={{ backgroundColor: COLORS.bg, padding: "32px 16px" }}>
                {/* The card. bgcolor + inline style both set on the <td>
                    itself, not just the wrapping <table> — a client that
                    only reads one of the two still gets the right color. */}
                <table
                  role="presentation"
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  bgcolor={COLORS.card}
                  style={{ backgroundColor: COLORS.card, maxWidth: "480px", border: `4px solid ${COLORS.border}` }}
                >
                  <tbody>
                    <tr>
                      <td bgcolor={COLORS.card} style={{ backgroundColor: COLORS.card, padding: "32px" }}>
                        <Text
                          style={{
                            color: COLORS.teal,
                            fontSize: "11px",
                            fontWeight: "bold",
                            letterSpacing: "0.1em",
                            margin: "0 0 16px",
                          }}
                        >
                          // APPLICATION RECEIVED
                        </Text>

                        <Heading
                          as="h1"
                          style={{
                            color: COLORS.textPrimary,
                            fontSize: "22px",
                            lineHeight: 1.4,
                            margin: "0 0 20px",
                          }}
                        >
                          You&apos;re in the pile, {firstName}
                        </Heading>

                        <Text style={{ color: COLORS.textMuted, fontSize: "14px", lineHeight: 1.7, margin: "0 0 24px" }}>
                          We&apos;ve got your HackJam &apos;26 application. We&apos;ll be in touch once
                          decisions go out — nothing else to do here.
                        </Text>

                        {/* The one thing this email actually needs someone
                            to act on. Named "MLH" throughout, not
                            "OrganizerHQ" — that's the system's internal
                            name, not something the link itself says
                            anywhere, and the mismatch read as a broken
                            link before it was even clicked. */}
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          bgcolor={COLORS.card}
                          style={{
                            backgroundColor: COLORS.card,
                            border: `1px solid ${COLORS.border}`,
                            borderLeft: `3px solid ${COLORS.amber}`,
                          }}
                        >
                          <tbody>
                            <tr>
                              <td bgcolor={COLORS.card} style={{ backgroundColor: COLORS.card, padding: "16px 20px" }}>
                                <Text
                                  style={{
                                    color: COLORS.amber,
                                    fontSize: "11px",
                                    fontWeight: "bold",
                                    letterSpacing: "0.08em",
                                    margin: "0 0 8px",
                                  }}
                                >
                                  ONE MORE STEP — REQUIRED
                                </Text>
                                <Text style={{ color: COLORS.textMuted, fontSize: "13px", lineHeight: 1.7, margin: 0 }}>
                                  Applying here does not register you with MLH. Every hacker has to
                                  register with MLH separately before the event — it only takes a
                                  minute, and it&apos;s required to attend.
                                </Text>
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        {/* Real <table>+<td> button, not a styled <a>: a
                            plain anchor's background can get dropped
                            entirely by a client that strips inline styles
                            it doesn't recognize, leaving invisible text on
                            the card's own background. A table cell's
                            bgcolor is far more consistently honored. The
                            border is the fallback inside that fallback — if
                            a client's dark-mode heuristic still mangles the
                            fill color, the border keeps the button's shape
                            and edge visible so it doesn't just vanish. */}
                        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "24px 0 0" }}>
                          <tbody>
                            <tr>
                              <td
                                align="center"
                                bgcolor={COLORS.pink}
                                style={{
                                  backgroundColor: COLORS.pink,
                                  border: `2px solid ${COLORS.textPrimary}`,
                                }}
                              >
                                <Link
                                  href={organizerHqUrl}
                                  style={{
                                    display: "block",
                                    color: COLORS.bg,
                                    fontSize: "13px",
                                    fontWeight: "bold",
                                    letterSpacing: "0.05em",
                                    padding: "14px 28px",
                                    textDecoration: "none",
                                  }}
                                >
                                  REGISTER WITH MLH &rarr;
                                </Link>
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        {/* Same link as plain text — some clients strip
                            buttons/styled anchors entirely, and this is the
                            one link in the email that genuinely matters. */}
                        <Text
                          style={{
                            color: COLORS.textDim,
                            fontSize: "11px",
                            lineHeight: 1.6,
                            margin: "16px 0 0",
                            wordBreak: "break-all",
                          }}
                        >
                          Or paste this into your browser:
                          <br />
                          <Link href={organizerHqUrl} style={{ color: COLORS.teal }}>
                            {organizerHqUrl}
                          </Link>
                        </Text>

                        <Hr style={{ borderColor: COLORS.border, margin: "28px 0" }} />

                        <Text style={{ color: COLORS.textDim, fontSize: "11px", lineHeight: 1.7, margin: 0 }}>
                          Questions? Reply to this email.
                        </Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

// Fixture for the preview route/script — a real send always has real
// values, but nothing viewing this in isolation does.
ConfirmationEmail.PreviewProps = {
  firstName: "Mariana",
  organizerHqUrl: "https://events.mlh.com/events/14412-hackjam-26?intent=register",
} satisfies ConfirmationEmailProps;
