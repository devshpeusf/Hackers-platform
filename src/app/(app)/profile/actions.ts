"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentHacker } from "@/lib/current-hacker";
import { parseProfileForm, type ProfileField } from "@/lib/profile";

export type SaveProfileState =
  | { status: "idle" }
  | { status: "saved"; at: string }
  | { status: "invalid"; errors: Partial<Record<ProfileField, string>> }
  | { status: "error" };

/**
 * Saves the signed-in hacker's own profile (/profile).
 *
 * Whose profile is decided only by the session (getCurrentHacker, which also
 * enforces portal access): nothing in the form names a person or an
 * application, so there's nothing to swap to edit someone else's. Email and
 * school aren't accepted at all (see src/lib/profile.ts).
 */
export async function saveProfile(_previous: SaveProfileState, formData: FormData): Promise<SaveProfileState> {
  const { application } = await getCurrentHacker();

  const parsed = parseProfileForm(formData, application.graduation);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };
  const { firstName, lastName, phone, gender, major, graduation, shirtSize } = parsed.data;

  try {
    // One write: the application's fields and, through it, the person's.
    await prisma.application.update({
      where: { id: application.id },
      data: {
        gender,
        major,
        graduation,
        shirtSize,
        person: { update: { firstName, lastName, phoneNum: phone } },
      },
    });
  } catch (e) {
    console.error("[profile] save failed:", e instanceof Error ? e.message : String(e));
    return { status: "error" };
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { status: "saved", at: new Date().toISOString() };
}
