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
