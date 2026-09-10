"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { getOpenEvent } from "@/lib/events";
import { applicationSchema, type ApplicationInput } from "@/lib/application-schema";

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "closed" | "duplicate" | "unknown" }
  | { ok: false; error: "validation"; fields: Record<string, string> };

/**
 * Writes a submitted application (PLAT-22).
 *
 * A server action is a public endpoint — anything reachable from a browser can
 * post to it. So this re-derives the identity from the session cookie and
 * re-parses the payload, and never trusts either from the client.
 *
 * Returns a discriminated result rather than throwing: the wizard has a
 * designed screen for each failure (already-applied, applications-closed), and
 * a thrown error would just surface as a generic boundary.
 */
export async function submitApplication(input: ApplicationInput): Promise<SubmitResult> {
  // 1. Who is this? From the cookie, never from the payload — otherwise anyone
  //    could submit an application in someone else's name.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const identity = toApplicantIdentity(user);

  // 2. Re-validate. The client gates each step, but that's a UX affordance,
  //    not a guarantee.
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fields[key]) fields[key] = issue.message;
    }
    return { ok: false, error: "validation", fields };
  }
  const v = parsed.data;

  // 3. Which event are they applying to?
  const event = await getOpenEvent();
  if (!event) return { ok: false, error: "closed" };

  try {
    // 4. Person and Application together — a Person with no Application is a
    //    half-finished record nobody would ever clean up.
    await prisma.$transaction(async (tx) => {
      const person = await tx.person.upsert({
        where: { discordId: identity.discordId },
        // Returning applicants get their details refreshed rather than
        // duplicated; the Discord id is what makes them the same person.
        update: {
          firstName: v.firstName,
          lastName: v.lastName,
          email: v.email,
          phoneNum: v.phone,
        },
        create: {
          discordId: identity.discordId,
          firstName: v.firstName,
          lastName: v.lastName,
          email: v.email,
          phoneNum: v.phone,
        },
      });

      await tx.application.create({
        data: {
          personId: person.id,
          eventId: event.id,

          school: v.school,
          schoolSource: v.schoolSource,
          major: v.major,
          graduation: v.graduation,
          levelOfStudy: v.levelOfStudy,
          shirtSize: v.shirtSize,

          country: v.country,
          dateOfBirth: new Date(v.dateOfBirth),
          gender: v.gender,
          raceEthnicity: v.raceEthnicity,

          whyAttend: v.whyAttend,
          whatBuild: v.whatBuild,
          gitHub: v.gitHub,
          linkedIn: v.linkedIn,

          agreedCodeOfConduct: v.agreedCodeOfConduct,
          agreedDataSharing: v.agreedDataSharing,
          agreedMarketing: v.agreedMarketing,
          agreementsAt: new Date(),
        },
      });
    });

    return { ok: true };
  } catch (e) {
    // @@unique([personId, eventId]) does the duplicate check for us — cheaper
    // and race-free compared to reading first and then writing (PLAT-25).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "duplicate" };
    }
    console.error("[submitApplication]", e);
    return { ok: false, error: "unknown" };
  }
}
