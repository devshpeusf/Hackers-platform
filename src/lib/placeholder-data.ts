/**
 * All hardcoded placeholder data for the static UI phase lives here.
 * Every literal a component displays should be imported from this
 * file, not typed inline — when real data (auth, DB, applications)
 * lands, this file gets deleted and its imports point at real data
 * sources instead. Types here are a preview of the eventual shape,
 * not a schema — the real schema comes later with Prisma.
 */

export type NavItem = {
  id: string;
  label: string;
  href: string;
};

export const navItems: NavItem[] = [
  { id: "dashboard", label: "DASHBOARD", href: "/dashboard" },
  { id: "profile", label: "PROFILE", href: "/profile" },
  { id: "team", label: "TEAM", href: "/team" },
  { id: "guide", label: "GUIDE", href: "/guide" },
  { id: "schedule", label: "SCHEDULE", href: "/schedule" },
  { id: "help", label: "HELP", href: "/help" },
];

export const sidebarUser = {
  handle: "MREYES · DISCORD ACCOUNT",
};

export const hacker = {
  firstName: "Mariana",
  lastName: "Reyes",
  fullName: "Mariana Reyes",
  greetingName: "Mariana Reyes",
  email: "mariana@example.com",
  phone: "[PHONE]",
  gender: "Woman",
  shirtSize: "M",
  school: "University of South Florida",
  major: "Computer Engineering",
  graduationDate: "[DATE]",
  mealPreference: "Vegetarian",
  passId: "HJ26-0482",
};

export const dashboardStatus = {
  eventName: "HACKJAM '26",
  headline: "ACCEPTED",
  dateVenue: "[DATE] at [VENUE]",
  checklist: [
    { label: "Confirm attendance", done: true },
    { label: "Join Discord", done: true },
    // Waiver is intentionally not in this static list — the dashboard
    // page renders it separately since it's the one interactive
    // (useState) checklist row in this mockup.
  ],
};

export const contactLog = [
  { command: "discord --join", target: "#hackjam-general", action: "JOIN" },
  { command: "mail --to", target: "hackjam@shpeusf.org", action: "SEND" },
];

export const team = {
  noTeamCopy: "Teams of 1–3 hackers. Solo hacking is welcome too.",
  name: "PIXEL PIONEERS",
  inviteCode: "HJ26-7F3K",
  members: [{ initials: "MR", name: "Mariana Reyes", isYou: true }],
};

export const guideCards = {
  venue: {
    title: "VENUE & PARKING",
    lines: ["[VENUE], University of South Florida", "[ADDRESS]", "Free parking in [LOT NAME]."],
  },
  wifi: {
    title: "WIFI",
    network: "[WIFI-NAME]",
    password: "[WIFI-PASSWORD]",
  },
  whatToBring: {
    title: "WHAT TO BRING",
    items: ["Laptop & charger", "Student ID", "Valid photo ID", "Refillable water bottle"],
  },
  codeOfConduct: {
    title: "CODE OF CONDUCT",
    // Per project brief: HackJam is applying to MLH's Hack Days program,
    // not Member Event status — this replaces the mockup's "MLH Member
    // Event" wording. Everything else on this card matches the mockup.
    body: "HackJam is an MLH Hack Day. All hackers agree to the",
    linkLabel: "MLH Code of Conduct",
  },
};

export type ScheduleRow = {
  time: string;
  label: string;
  highlighted: boolean;
};

export const scheduleItems: ScheduleRow[] = [
  { time: "[T0]", label: "Check-in & breakfast", highlighted: false },
  { time: "[T1]", label: "Opening ceremony", highlighted: false },
  { time: "[T2]", label: "Hacking begins", highlighted: true },
  { time: "[T3]", label: "Workshop block", highlighted: false },
  { time: "[T4]", label: "Lunch", highlighted: false },
  { time: "[T5]", label: "Dinner", highlighted: false },
  { time: "[T6]", label: "Submission deadline", highlighted: false },
  { time: "[T7]", label: "Judging", highlighted: false },
  { time: "[T8]", label: "Closing ceremony & awards", highlighted: false },
];

/* ------------------------------------------------------------------ *
 * Application flow (PLAT-35 design, built cosmetically for PLAT-16).
 * Nothing here submits anywhere — the wizard is client state only.
 * ------------------------------------------------------------------ */

export type ApplicationStep = {
  /** "01".."05", shown in the rail and the section header. */
  number: string;
  /** Rail label. */
  label: string;
  /** Headline above the card. */
  heading: string;
  /** Left-column blurb inside the card. */
  blurb: string;
  /** Accent token for this step, matching the design's per-step colour. */
  accent: string;
  /**
   * Altitude readout. Mirrors AltitudeHUD on the HackJam marketing site:
   * applying is a descent from orbit to the surface.
   */
  zone: string;
  altitude: string;
  /** Earth diameter in the rail, px — the planet grows as you descend. */
  earthPx: number;
};

export const applicationSteps: ApplicationStep[] = [
  { number: "01", label: "BASICS", heading: "THE BASICS", accent: "var(--color-accent-teal)", zone: "LOW ORBIT", altitude: "402", earthPx: 46,
    blurb: "Your name and how we reach you. Discord doesn't hand over an email, so we need one here." },
  { number: "02", label: "ABOUT YOU", heading: "ABOUT YOU", accent: "var(--color-accent-purple-light)", zone: "NEBULA FIELD", altitude: "318", earthPx: 60,
    blurb: "MLH requires date of birth, country, and level of study. Demographics are yours to skip." },
  { number: "03", label: "SCHOOL", heading: "YOUR SCHOOL", accent: "var(--color-accent-pink-light)", zone: "UPPER ATMOSPHERE", altitude: "210", earthPx: 76,
    blurb: "Searches the MLH-verified list \u2014 13,103 schools. Acronyms work: type \u201cusf\u201d." },
  { number: "04", label: "EXPERIENCE", heading: "YOUR EXPERIENCE", accent: "var(--color-accent-pink)", zone: "SUNSET BAND", altitude: "096", earthPx: 96,
    blurb: "Two short answers. Links and resume are optional \u2014 first-time hackers are welcome." },
  { number: "05", label: "AGREEMENTS", heading: "THE FINE PRINT", accent: "var(--color-accent-amber)", zone: "SURFACE", altitude: "012", earthPx: 118,
    blurb: "Exact MLH wording \u2014 don't paraphrase it. First two required, third opt-in." },
];

/**
 * Verbatim MLH policy text from github.com/MLH/mlh-policies. Do not reword:
 * MLH requires these exact sentences on an event registration.
 */
export const applicationConsent = [
  { id: "coc", required: true, text: "I have read and agree to the MLH Code of Conduct." },
  { id: "share", required: true, text: "I authorize you to share my application/registration information with Major League Hacking for event administration, ranking, and MLH administration in-line with the MLH Privacy Policy. I further agree to the terms of both the MLH Contest Terms and Conditions and the MLH Privacy Policy." },
  { id: "emails", required: false, text: "I authorize MLH to send me occasional emails about relevant events, career opportunities, and community announcements." },
];

/** Shown next to the consent boxes while the MLH application is pending. */
export const mlhPendingNotice =
  "We have applied to be an MLH Hack Day. These checkboxes only apply if our application is accepted \u2014 your information will not be shared if we do not become an MLH event.";

/**
 * Schools whose applicants we expect most, surfaced above equally-ranked
 * matches in the typeahead. ORDER MATTERS — the host school is first.
 *
 * This only reorders ties, so it can never surface a wrong school; it fixes
 * cases like "usf", a valid acronym for six institutions, where the one an
 * applicant at a USF event means was ranking sixth.
 *
 * Every name is verified against src/data/schools.json — a string MLH spells
 * differently silently does nothing. Note Florida A&M is listed under its
 * full legal name.
 *
 * Event data, not app data: this becomes a column on the events table when
 * Phase 1 lands (see CLAUDE.md on staying multi-event). A hackathon at
 * another school would ship a different list.
 */
export const boostedSchools = [
  // host
  "University of South Florida",
  // the rest of the state's big CS programs, roughly by expected volume
  "University of Central Florida",
  "University of Florida",
  "Florida International University",
  "Florida State University",
  "Florida Atlantic University",
  "University of Miami",
  "Florida Institute of Technology",
  "Embry-Riddle Aeronautical University",
  "Nova Southeastern University",
  "Florida Gulf Coast University",
  "University of North Florida",
  "University of West Florida",
  "Florida Agricultural and Mechanical University",
  "Florida Polytechnic University",
  "University of Tampa",
  "Stetson University",
  "Rollins College",
] as const;

export const applicationCopy = {
  from: "hackjam26.com",
  heading: "LET'S GET YOU\nSIGNED UP",
  intro:
    "Five short steps, about four minutes. Sign in with Discord \u2014 it's how we reach you about your application and how you get into the server.",
  finePrint: "Applications close [DATE] \u00b7 we only read your username and ID.",
  footerHint: "Answers save as you go \u00b7 you can finish later",
  /** Placeholder questions \u2014 real copy is still a content decision. */
  questions: [
    "Why do you want to attend HackJam '26?",
    "What do you hope to build or learn?",
  ],
};
