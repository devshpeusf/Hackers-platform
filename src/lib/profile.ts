import { z } from "zod";
import { applicationFields } from "@/lib/application-schema";

/**
 * What a hacker can change on /profile, validated with the application's own
 * rules (src/lib/application-schema.ts), so the two can't disagree.
 *
 * Email and school are deliberately not here: every event email goes to the
 * address on file and it has to stay unique, and school is reported to MLH.
 * Changing either goes through an organizer.
 *
 * No server-only imports: the form uses the option lists too.
 */

export const PROFILE_FIELDS = ["firstName", "lastName", "phone", "gender", "major", "graduation", "shirtSize"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

const shape = applicationFields.shape;

/** Same rules as the application, except graduation (see parseProfileForm). */
const profileSchema = z.object({
  firstName: shape.firstName,
  lastName: shape.lastName,
  phone: shape.phone,
  gender: shape.gender,
  major: shape.major,
  graduation: z.string({ error: "Pick a month and year" }).trim(),
  shirtSize: shape.shirtSize,
});

export type ProfileValues = z.output<typeof profileSchema>;

/**
 * Parses the /profile form. `currentGraduation` is what's on file: an
 * unchanged graduation date is accepted even once it's in the past (someone
 * who applied for a May graduation shouldn't be stuck unable to save their
 * phone number in June). A changed one has to pass the application's rule.
 */
export function parseProfileForm(
  formData: FormData,
  currentGraduation: string | null,
): { ok: true; data: ProfileValues } | { ok: false; errors: Partial<Record<ProfileField, string>> } {
  const raw = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, formData.get(f) ?? undefined]));
  const errors: Partial<Record<ProfileField, string>> = {};

  const result = profileSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0]) as ProfileField;
      errors[key] ??= issue.message;
    }
  }

  const graduation = typeof raw.graduation === "string" ? raw.graduation.trim() : "";
  if (!errors.graduation && graduation !== currentGraduation) {
    const check = shape.graduation.safeParse(graduation);
    if (!check.success) errors.graduation = check.error.issues[0]?.message ?? "Pick a month and year";
  }

  if (!result.success || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: result.data };
}
