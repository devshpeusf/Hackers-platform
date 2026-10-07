import type { ReactNode } from "react";
import { Body, Head, Heading, Hr, Html, Link, Preview, Text } from "@react-email/components";

/**
 * The shell every transactional email shares — the confirmation and the
 * three decision emails. Extracted from ConfirmationEmail.tsx (and verified
 * to render byte-identical HTML for it) so the dark-mode defenses below live
 * in one place instead of being re-pasted, and drifting, per email.
 *
 * Same hex values as src/app/globals.css's @theme block, copied literally
 * rather than referenced — email clients don't support CSS custom
 * properties (or in Outlook's case, most of CSS). Keep the two palettes in
 * sync by hand if the design tokens ever change.
 */
export const COLORS = {
  bg: "#07060d",
  card: "#120f1f",
  border: "#1a1530",
  textPrimary: "#f4f1fb",
  textMuted: "#9a94b0",
  textDim: "#7d7896",
  pink: "#ff2e97",
  teal: "#21e6c1",
  amber: "#ffd9a0",
  purple: "#c58bff",
};

// Space Mono itself won't render in most email clients — custom @font-face
// is unreliable at best and outright stripped in Outlook desktop — so this
// is a system monospace stack that evokes the same feel without depending
// on a web font actually loading.
export const MONO = "'Courier New', Courier, monospace";

/** Page background, the card, and the reply-to footer. Content goes inside the card. */
export function EmailShell({ preview, children }: { preview: string; children: ReactNode }) {
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
      <Preview>{preview}</Preview>
      {/* Body gets an explicit background as well as the cells below: without
          it, anything the table doesn't fully cover falls through to the
          client's own default (a light-grey gap). The <td> backgrounds remain
          the real per-cell defense against dark-mode inversion; this is a
          second layer under them, not a replacement. */}
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
                        {children}

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

/** The small `// LABEL` line above the heading. */
export function Eyebrow({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Text
      style={{
        color,
        fontSize: "11px",
        fontWeight: "bold",
        letterSpacing: "0.1em",
        margin: "0 0 16px",
      }}
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{
        color: COLORS.textPrimary,
        fontSize: "22px",
        lineHeight: 1.4,
        margin: "0 0 20px",
      }}
    >
      {children}
    </Heading>
  );
}

export function Paragraph({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <Text style={{ color: COLORS.textMuted, fontSize: "14px", lineHeight: 1.7, margin: last ? 0 : "0 0 24px" }}>
      {children}
    </Text>
  );
}

/** A boxed step with a coloured left edge — for the thing the reader has to act on. */
export function Callout({ accent, label, children }: { accent: string; label: string; children: ReactNode }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      bgcolor={COLORS.card}
      style={{
        backgroundColor: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <tbody>
        <tr>
          <td bgcolor={COLORS.card} style={{ backgroundColor: COLORS.card, padding: "16px 20px" }}>
            <Text
              style={{
                color: accent,
                fontSize: "11px",
                fontWeight: "bold",
                letterSpacing: "0.08em",
                margin: "0 0 8px",
              }}
            >
              {label}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: "13px", lineHeight: 1.7, margin: 0 }}>{children}</Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Real <table>+<td> button, not a styled <a>: a plain anchor's background can
 * get dropped entirely by a client that strips inline styles it doesn't
 * recognize, leaving invisible text on the card's own background. A table
 * cell's bgcolor is far more consistently honored. The border is the fallback
 * inside that fallback — if a client's dark-mode heuristic still mangles the
 * fill color, the border keeps the button's shape visible.
 */
export function Button({ href, children }: { href: string; children: ReactNode }) {
  return (
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
              href={href}
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
              {children}
            </Link>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Vertical space between blocks. A table cell with an explicit height, not a
 * <div> — Outlook ignores heights and margins on divs.
 */
export function Spacer({ height }: { height: number }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td
            height={height}
            bgcolor={COLORS.card}
            style={{ backgroundColor: COLORS.card, height: `${height}px`, fontSize: 0, lineHeight: 0 }}
          >
            &nbsp;
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * The button's link again as plain text — some clients strip buttons and
 * styled anchors entirely, so anything worth a button is worth this too.
 */
export function PasteLink({ href }: { href: string }) {
  return (
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
      <Link href={href} style={{ color: COLORS.teal }}>
        {href}
      </Link>
    </Text>
  );
}
