import { Resend } from "resend";
import type { ReactElement } from "react";

/**
 * Transactional email (PLAT-23) — confirmation and the three decision
 * emails. Nothing is sent from here directly: callers queue an EmailQueue
 * row and the send route drains it.
 *
 * A single shared client rather than one per call: Resend's client is cheap
 * to reuse and there's no per-request state to isolate. Built on first use
 * rather than at import, though — `new Resend(undefined)` throws, so a
 * module-scope client meant merely importing this file crashed any
 * environment without the key. That took out `npm run build` on a fresh
 * clone and in CI, neither of which sends email.
 */
let client: Resend | null = null;

function getResend(): Resend {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set — no email can be sent");
  client = new Resend(key);
  return client;
}

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
  const { data, error } = await getResend().emails.send({
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
