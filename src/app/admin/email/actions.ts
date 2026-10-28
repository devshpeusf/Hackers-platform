"use server";

import { revalidatePath } from "next/cache";
import { render } from "@react-email/render";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { sendEmail } from "@/lib/email";
import { createBroadcast, parseAudience } from "@/lib/broadcast";
import { validateMessage } from "@/lib/broadcast-format";
import AnnouncementEmail from "@emails/AnnouncementEmail";

/**
 * /admin/email actions. Each is a public endpoint, so each re-checks that the
 * caller is an organizer, from the verified Discord id. Recipients are never
 * taken from the form — only an audience name, resolved on the server.
 */

export type EmailActionState =
  | { status: "idle" }
  | { status: "preview"; html: string }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

async function organizer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const discordId = user ? toApplicantIdentity(user).discordId : null;
  if (!discordId) return null;
  const person = await prisma.person.findUnique({
    where: { discordId },
    select: { id: true, role: true, firstName: true, email: true },
  });
  return person?.role === "ORGANIZER" ? person : null;
}

async function eventName() {
  const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" }, select: { name: true } });
  return event?.name ?? "HackJam";
}

/** Renders exactly what recipients will get, addressed to you. Sends nothing. */
export async function previewAction(_: EmailActionState, formData: FormData): Promise<EmailActionState> {
  const me = await organizer();
  if (!me) return { status: "error", message: "Only organizers can send announcements." };
  const msg = validateMessage(formData.get("subject"), formData.get("body"));
  if (!msg.ok) return { status: "error", message: msg.error };
  const html = await render(
    AnnouncementEmail({ firstName: me.firstName, eventName: await eventName(), subject: msg.subject, body: msg.body }),
  );
  return { status: "preview", html };
}

/** One real email, to the organizer's own address only. */
export async function sendTestAction(_: EmailActionState, formData: FormData): Promise<EmailActionState> {
  const me = await organizer();
  if (!me) return { status: "error", message: "Only organizers can send announcements." };
  const msg = validateMessage(formData.get("subject"), formData.get("body"));
  if (!msg.ok) return { status: "error", message: msg.error };
  try {
    await sendEmail({
      to: me.email,
      subject: `[TEST] ${msg.subject}`,
      react: AnnouncementEmail({ firstName: me.firstName, eventName: await eventName(), subject: msg.subject, body: msg.body }),
    });
    return { status: "ok", message: `Test sent to ${me.email}.` };
  } catch {
    return { status: "error", message: "Couldn't send the test. Check the email settings, or try again later." };
  }
}

/** Queues the announcement for everyone in the audience. No unsend. */
export async function sendBroadcastAction(_: EmailActionState, formData: FormData): Promise<EmailActionState> {
  const me = await organizer();
  if (!me) return { status: "error", message: "Only organizers can send announcements." };
  const audience = parseAudience(formData.get("audience"));
  if (!audience) return { status: "error", message: "Pick who it goes to." };
  const msg = validateMessage(formData.get("subject"), formData.get("body"));
  if (!msg.ok) return { status: "error", message: msg.error };

  try {
    const result = await createBroadcast({ sentById: me.id, audience, subject: msg.subject, body: msg.body });
    if (!result.ok) return { status: "error", message: result.message };
    revalidatePath("/admin/email");
    revalidatePath("/admin");
    return {
      status: "ok",
      message: `Queued for ${result.recipients} ${result.recipients === 1 ? "person" : "people"}. It goes out over the next scheduler runs.`,
    };
  } catch {
    return { status: "error", message: "Couldn't queue it. Please try again." };
  }
}
