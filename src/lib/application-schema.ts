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
 *
 * This is a function, not a plain object, because the age check (PLAT-19)
 * needs to know the event's start date — HackJam doesn't admit minors, and
 * "minor" is judged as of the event, not as of whenever someone happens to
 * fill out the form. Both call sites (validateStep, the server action)
 * already have the open event in hand before they validate, so they build
 * the schema with it rather than the schema reaching out for it itself.
 */

/**
 * The fixed option lists behind country/level-of-study/gender/race/shirt-size.
 * Exported so the wizard's <select>s render from the exact same list the
 * schema validates against — one source of truth, so a UI change and the
 * server enum can't quietly drift apart from each other.
 *
 * Values are stored verbatim — no codes — so a row in the database reads the
 * same as what the applicant picked, and MLH reporting doesn't need a lookup
 * table.
 */
export const COUNTRIES = ["United States", "Canada", "Mexico", "India", "Other"] as const;
export const LEVELS_OF_STUDY = [
  "Undergraduate University (3+ year)",
  "Undergraduate University (2 year)",
  "Graduate University (Masters, Doctoral, etc)",
  "High School",
  "Code School / Bootcamp",
  "Other",
] as const;
export const GENDERS = ["Woman", "Man", "Non-binary", "Prefer to self-describe"] as const;
export const RACES = [
  "Asian",
  "Black or African American",
  "Hispanic / Latino / Spanish Origin",
  "Middle Eastern",
  "Native American or Alaskan Native",
  "Native Hawaiian or Other Pacific Islander",
  "White",
  "Other",
] as const;
export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;

/**
 * An optional field constrained to one of `options`, treating an empty
 * string (the <select>'s "Prefer not to answer" / unset state) the same as
 * not having answered at all, rather than as an invalid enum value.
 */
function optionalChoice<T extends readonly [string, ...string[]]>(options: T) {
  return z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(options, { error: "Pick one of the listed options" }).optional(),
  ).transform((v) => v ?? null);
}

/**
 * Parses `value` as a URL, tolerating a missing scheme ("github.com/x" as
 * well as "https://github.com/x"). Null if it isn't a URL at all.
 *
 * Also rejects a bare word like "banana": the URL spec happily accepts a
 * single label as a hostname ("https://banana" is technically valid), which
 * would otherwise slip past this check and land on the wrong error message
 * below ("right idea, wrong site" instead of "that's not a link"). A real
 * link has a dotted domain, so that's what "valid URL" means here.
 */
function parseUrl(value: string): URL | null {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes(".") ? url : null;
  } catch {
    return null;
  }
}

/**
 * An optional profile link, scoped to one platform. Accepts input with or
 * without a scheme ("github.com/x" or "https://github.com/x") but always
 * stores the full URL, since this eventually renders as a clickable link on
 * an organizer's dashboard — a schemeless value wouldn't be one.
 *
 * Two separate refinements on purpose, not one combined check: "banana" and
 * "https://linkedin.com/in/x" (typed into the GitHub field) are both wrong,
 * but for different reasons, and telling them apart is the whole point —
 * one means "this isn't a link", the other means "right idea, wrong site".
 */
function platformLink(platformHost: string, label: string) {
  return z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || parseUrl(v) !== null, "Enter a valid URL")
    .refine((v) => {
      if (!v) return true;
      const url = parseUrl(v);
      if (!url) return true; // already flagged by the refine above
      return url.hostname === platformHost || url.hostname.endsWith(`.${platformHost}`);
    }, `That's a valid link, but not a ${label} one`)
    .transform((v) => {
      if (!v) return null;
      return /^https?:\/\//i.test(v) ? v : `https://${v}`;
    });
}

/** MLH requires first name, last name, age, email, school, phone, country, level of study. */
export function buildApplicationSchema(eventStartDate: Date) {
  return z.object({
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
     * Stored rather than a computed age: an age column is wrong within a year.
     *
     * Also gated at 18+ as of the event's start date (not today, and not just
     * "in the past") — HackJam doesn't admit minors, for liability reasons.
     * "High School" stays a valid answer for levelOfStudy below: an 18-year-old
     * high schooler is a real applicant, just not a 16-year-old one.
     */
    dateOfBirth: z
      .iso.date("Enter a valid date")
      .refine((v) => {
        const dob = new Date(v);
        const cutoff = new Date(eventStartDate);
        cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18);
        return dob <= cutoff;
      }, "You must be 18 by the start of the event"),
    country: z.enum(COUNTRIES, { error: "Required" }),
    levelOfStudy: z.enum(LEVELS_OF_STUDY, { error: "Required" }),
    /** Optional by design — MLH reports on these but nobody is required to answer. */
    gender: optionalChoice(GENDERS),
    raceEthnicity: optionalChoice(RACES),

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
     * From two <select>s, so "2027-05". The previous rule was min(1).max(20),
     * which accepted a half-typed "2008" — a graduation date in the past,
     * stored as valid, with nothing to flag it.
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
    shirtSize: z.enum(SHIRT_SIZES, { error: "Required" }),

    // ---- step 4: experience ----
    // A bare min(1) let a one-character non-answer through. 100 characters is
    // roughly a couple of sentences — enough that a real answer and a
    // placeholder answer stop looking the same to the schema.
    whyAttend: z
      .string({ error: "Tell us a little" })
      .trim()
      .min(100, "Write a bit more — at least 100 characters")
      .max(5000),
    whatBuild: z
      .string({ error: "Tell us a little" })
      .trim()
      .min(100, "Write a bit more — at least 100 characters")
      .max(5000),
    quirkFact: z
      .string({ error: "Tell us a little" })
      .trim()
      .min(100, "Write a bit more — at least 100 characters")
      .max(5000),
    gitHub: platformLink("github.com", "GitHub"),
    linkedIn: platformLink("linkedin.com", "LinkedIn"),

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
}

// Reference instance for type inference only — never parsed against. The
// captured eventStartDate doesn't affect the inferred shape, so any date works.
const schemaShape = buildApplicationSchema(new Date(0));
export type ApplicationInput = z.input<typeof schemaShape>;
export type ApplicationValues = z.output<typeof schemaShape>;

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
  eventStartDate: Date,
): Record<string, string> {
  const fields = STEP_FIELDS[step as keyof typeof STEP_FIELDS];
  if (!fields) return {};

  const result = buildApplicationSchema(eventStartDate).safeParse(values);
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
