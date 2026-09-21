import { Resend } from "resend";
import type { ReactElement } from "react";

/**
 * Transactional email (PLAT-23) — confirmation only for now. No MLH
 * reminder, no decision emails, no scheduled sending; see TASKS.md.
 *
 * A single shared client rather than one per call: Resend's client is
 * cheap to reuse and there's no per-request state to isolate.
 */
export const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "HackJam <noreply@mail.hackjam26.com>";

type SendEmailArgs = {
  to: string;
  subject: string;
  react: ReactElement;
};

/**
 * Thin wrapper over resend.emails.send, not a passthrough for its own sake:
 * this is the one place From and replyTo are set, so every email sent from
 * the app looks consistent without every call site repeating them.
 *
 * Callers are expected to handle failures themselves (try/catch) — this
 * throws rather than swallowing errors, since what "failure is fine" means
 * differs by call site (a failed confirmation email shouldn't fail a
 * submission; a future email might need different handling).
 */
export async function sendEmail({ to, subject, react }: SendEmailArgs) {
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    react,
    // Undefined is fine — Resend just omits the header — for whenever this
    // hasn't been set in a given environment yet.
    replyTo: process.env.REPLY_TO_EMAIL,
  });

  if (error) throw error;
  return data;
}
