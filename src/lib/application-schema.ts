import { z } from "zod";

/**
 * The shape of a submitted application (PLAT-22).
 *
 * ONE schema, used twice: the wizard imports it to gate the NEXT button
 * per step, and the server action re-parses the payload before writing.
 * The server parse is not redundant — a client can post anything, and a
 * server action is a public endpoint like any other.
 *
 * Field names match the Prisma columns so the action can hand the parsed
 * object almost straight to `create`.
 */

/** MLH requires first name, last name, age, email, school, phone, country, level of study. */
export const applicationSchema = z.object({
  // ---- step 1: basics ----
  firstName: z.string({ error: "Required" }).trim().min(1, "Required").max(100),
  lastName: z.string({ error: "Required" }).trim().min(1, "Required").max(100),
  email: z.email("Enter a valid email address").max(255),
  /**
   * Required, because MLH's member-event guidelines list phone number in the
   * baseline every event must collect — and it's how organisers reach someone
   * at the door when Discord isn't open on their laptop.
   *
   * The format rule is deliberately permissive: digits, spaces, dashes,
   * brackets, dots and a leading +, with 7-15 digits (E.164's range), so
   * international applicants aren't rejected by a US-shaped rule.
   */
  phone: z
    .string({ error: "Required" })
    .trim()
    .min(1, "Required")
    .max(40)
    .regex(/^[+()\-.\s\d]+$/, "Enter a valid phone number")
    .refine((v) => {
      const digits = v.match(/\d/g)?.length ?? 0;
      return digits >= 7 && digits <= 15;
    }, "Enter a valid phone number"),

  // ---- step 2: about you ----
  /**
   * Stored rather than a computed age: an age column is wrong within a year,
   * and MLH's 80%-student rule is checked against the event date.
   */
  dateOfBirth: z.iso.date("Enter a valid date"),
  country: z.string({ error: "Required" }).trim().min(1, "Required").max(100),
  levelOfStudy: z.string({ error: "Required" }).trim().min(1, "Required").max(100),
  /** Optional by design — MLH reports on these but nobody is required to answer. */
  gender: z.string().trim().max(100).optional().transform((v) => (v ? v : null)),
  raceEthnicity: z.string().trim().max(100).optional().transform((v) => (v ? v : null)),

  // ---- step 3: school ----
  school: z.string({ error: "Pick your school" }).trim().min(1, "Pick your school").max(255),
  /**
   * Whether the school came off MLH's verified list or was typed by hand.
   * `manual` rows need an organiser to normalise them before we report to
   * MLH — see the note on PLAT-9.
   */
  schoolSource: z.enum(["catalog", "manual"], { error: "Pick your school from the list" }),
  major: z.string({ error: "Required" }).trim().min(1, "Required").max(150),
  /**
   * From <input type="month">, so "2027-05". The previous rule was
   * min(1).max(20), which accepted a half-typed "2008" — a graduation date in
   * the past, stored as valid, with nothing to flag it.
   */
  graduation: z
    .string({ error: "Pick a month and year" })
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month and year")
    .refine((v) => {
      const [y, m] = v.split("-").map(Number);
      const end = new Date(y, m, 0); // last day of that month
      return end >= new Date();
    }, "That date is in the past"),
  shirtSize: z.string({ error: "Required" }).trim().min(1, "Required").max(10),

  // ---- step 4: experience ----
  whyAttend: z.string({ error: "Tell us a little" }).trim().min(1, "Tell us a little").max(5000),
  whatBuild: z.string({ error: "Tell us a little" }).trim().min(1, "Tell us a little").max(5000),
  quirkFact: z.string({ error: "Tell us a little" }).trim().min(1, "Tell us a little").max(5000),
  gitHub: z.string().trim().max(255).optional().transform((v) => (v ? v : null)),
  linkedIn: z.string().trim().max(255).optional().transform((v) => (v ? v : null)),

  // ---- step 5: agreements ----
  /**
   * MLH requires the first two. Refusing at the schema level means the server
   * can never write an application that lacks consent, no matter what the
   * client sends.
   */
  agreedCodeOfConduct: z.literal(true, {
    error: "You must agree to the MLH Code of Conduct",
  }),
  agreedDataSharing: z.literal(true, {
    error: "You must agree to the MLH data sharing terms",
  }),
  /** Genuinely optional — MLH marketing email is opt-in. */
  agreedMarketing: z.boolean(),
});

export type ApplicationInput = z.input<typeof applicationSchema>;
export type ApplicationValues = z.output<typeof applicationSchema>;

/**
 * Which fields belong to which step, so the wizard can validate just the step
 * being left rather than showing someone errors for pages they haven't seen.
 */
export const STEP_FIELDS = {
  1: ["firstName", "lastName", "email", "phone"],
  2: ["dateOfBirth", "country", "levelOfStudy", "gender", "raceEthnicity"],
  3: ["school", "schoolSource", "major", "graduation", "shirtSize"],
  4: ["whyAttend", "whatBuild", "quirkFact", "gitHub", "linkedIn"],
  5: ["agreedCodeOfConduct", "agreedDataSharing", "agreedMarketing"],
} as const satisfies Record<number, readonly (keyof ApplicationInput)[]>;

/** Validates one step. Returns field-keyed messages so the UI can place them. */
export function validateStep(
  step: number,
  values: Partial<ApplicationInput>,
): Record<string, string> {
  const fields = STEP_FIELDS[step as keyof typeof STEP_FIELDS];
  if (!fields) return {};

  const result = applicationSchema.safeParse(values);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]);
    // Only surface problems on this step — the later steps aren't filled yet.
    if ((fields as readonly string[]).includes(key) && !errors[key]) {
      errors[key] = issue.message;
    }
  }
  return errors;
}
