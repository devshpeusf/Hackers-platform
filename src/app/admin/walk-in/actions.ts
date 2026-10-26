"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { isVolunteerOrAbove } from "@/lib/volunteer";
import { ensureBadgeToken } from "@/lib/badge";
import { classifyWalkIn, newWalkInDiscordId, normaliseEmail } from "@/lib/walk-ins";

/**
 * Registering someone at the door (PLAT-56).
 *
 * Volunteer-or-above. A Server Action is a public endpoint reachable by anyone
 * who can craft the POST, whatever gates the page in front of it, so the role
 * is re-checked here — same reasoning as decideApplication, just a wider gate,
 * because volunteers run the door.
 */

/** The staff member's own Person row, or null if they aren't staff. */
async function currentStaff(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { discordId } = toApplicantIdentity(user);
  if (!(await isVolunteerOrAbove(discordId))) return null;
  if (!discordId) return null;

  const person = await prisma.person.findUnique({
    where: { discordId },
    select: { id: true },
  });
  return person ?? null;
}

type Fields = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNum: string;
  school: string;
  isMinor: boolean;
  agreedCodeOfConduct: boolean;
  agreedDataSharing: boolean;
  agreedMarketing: boolean;
};

/**
 * Validated by hand rather than with the application's Zod schema: that schema
 * requires the full 16-field application, which is exactly what a door form
 * doesn't have. The rules it does share are the ones that matter — consent must
 * be ticked, not defaulted.
 */
function readFields(formData: FormData): Fields | null {
  const text = (name: string, max: number): string | null => {
    const raw = formData.get(name);
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > max) return null;
    return trimmed;
  };

  const firstName = text("firstName", 100);
  const lastName = text("lastName", 100);
  const email = text("email", 255);
  const phoneNum = text("phoneNum", 50);
  const school = text("school", 255);

  if (!firstName || !lastName || !email || !phoneNum || !school) return null;
  // Good enough at a check-in desk: the point is catching a typo'd address,
  // not validating deliverability, and the person is standing right there.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;

  // MLH requires both, and a box that wasn't ticked is not consent. Writing
  // `true` here for someone who never saw the Code of Conduct would be a
  // fabricated consent record, so this refuses instead.
  if (formData.get("agreedCodeOfConduct") !== "on") return null;
  if (formData.get("agreedDataSharing") !== "on") return null;

  const minor = formData.get("isMinor");
  if (minor !== "yes" && minor !== "no") return null;

  return {
    firstName,
    lastName,
    email: normaliseEmail(email),
    phoneNum,
    school,
    isMinor: minor === "yes",
    agreedCodeOfConduct: true,
    agreedDataSharing: true,
    agreedMarketing: formData.get("agreedMarketing") === "on",
  };
}

function back(params: Record<string, string>): never {
  redirect(`/admin/walk-in?${new URLSearchParams(params)}`);
}

export async function registerWalkIn(formData: FormData) {
  const staff = await currentStaff();
  if (!staff) return;

  const fields = readFields(formData);
  if (!fields) back({ error: "invalid" });

  const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" } });
  if (!event) back({ error: "no-event" });

  const person = await prisma.person.findUnique({
    where: { email: fields.email },
    select: { id: true, applications: { select: { id: true, eventId: true } } },
  });

  const situation = classifyWalkIn(person, event.id);

  // Already has an application for this event: create nothing. The form shows
  // what they have and offers to admit them, which is a decision on the
  // existing row — see admitExisting below.
  if (situation.kind === "existing") {
    back({ found: situation.applicationId });
  }

  const applicationId = await prisma.$transaction(async (tx) => {
    const personId =
      situation.kind === "new-person"
        ? (
            await tx.person.create({
              data: {
                discordId: newWalkInDiscordId(),
                firstName: fields.firstName,
                lastName: fields.lastName,
                email: fields.email,
                phoneNum: fields.phoneNum,
              },
              select: { id: true },
            })
          ).id
        : situation.personId;

    const application = await tx.application.create({
      data: {
        personId,
        eventId: event.id,
        source: "WALK_IN",
        // Admitted on the spot — that's what registering at the door means.
        // decidedBy/decidedAt are PLAT-39's columns and answer "who let this
        // person in" without needing a second concept.
        status: "ACCEPTED",
        decidedById: staff.id,
        decidedAt: new Date(),
        school: fields.school,
        isMinor: fields.isMinor,
        agreedCodeOfConduct: fields.agreedCodeOfConduct,
        agreedDataSharing: fields.agreedDataSharing,
        agreedMarketing: fields.agreedMarketing,
        agreementsAt: new Date(),
      },
      select: { id: true },
    });

    // Inside the transaction: a walk-in with no badge is useless at the door,
    // so a failure here has to take the whole registration with it rather than
    // leave an admitted hacker who can't be scanned.
    await ensureBadgeToken(application.id, tx);

    return application.id;
  });

  revalidatePath("/admin/applications");
  revalidatePath("/admin/walk-in");

  back({ registered: applicationId });
}

/**
 * Admit someone who already had an application — the rejected-but-showed-up
 * case, or anyone whose badge wouldn't scan.
 *
 * Deliberately separate from registerWalkIn: this changes an existing
 * admission decision, which is a different act from creating a record, and it
 * should be a second deliberate click rather than something the first form
 * does silently.
 */
export async function admitExisting(formData: FormData) {
  const staff = await currentStaff();
  if (!staff) return;

  const id = formData.get("applicationId");
  if (typeof id !== "string" || !id) return;

  await prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!application) return;

    if (application.status !== "ACCEPTED") {
      await tx.application.update({
        where: { id },
        data: { status: "ACCEPTED", decidedById: staff.id, decidedAt: new Date() },
      });
    }
    await ensureBadgeToken(id, tx);
  });

  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin/walk-in");

  back({ admitted: id });
}
