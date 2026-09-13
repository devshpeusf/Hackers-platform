import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import clsx from "@/lib/clsx";
import { getApplication } from "@/lib/applications";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import PixelCard from "@/components/ui/PixelCard";
import PixelChip from "@/components/ui/PixelChip";
import Field from "@/components/ui/Field";
import { mlhRegistration, applicationCopy } from "@/lib/placeholder-data";
import { STARFIELD } from "../../_shared";

/**
 * What an applicant sees after submitting (PLAT-24).
 *
 * A Server Component: it only reads, so there's nothing to hydrate and the
 * page is interactive the moment it paints.
 *
 * Lives in (apply) rather than (app) on purpose — CLAUDE.md reserves the
 * portal shell for post-acceptance, and someone waiting on a decision
 * shouldn't be shown Team/Schedule/Guide nav they can't use yet.
 */

/** Per-status copy. The enum is Juan's, in prisma/schema.prisma. */
const STATUS_COPY = {
  SUBMITTED: {
    label: "SUBMITTED",
    color: "var(--color-accent-teal)",
    blurb: "We've got it. Decisions go out before the event — we'll email you either way.",
  },
  ACCEPTED: {
    label: "ACCEPTED",
    color: "var(--color-accent-teal)",
    blurb: "You're in. Check your email for what happens next.",
  },
  WAITLISTED: {
    label: "WAITLISTED",
    color: "var(--color-accent-amber)",
    blurb: "You're on the waitlist. Spots often open up as the date gets closer.",
  },
  REJECTED: {
    label: "NOT THIS TIME",
    color: "var(--color-text-dim)",
    blurb: "We couldn't fit you in this year. Please do apply again — it's not a judgement on you.",
  },
} as const;

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "2027-05" -> "May 2027". Falls back to the raw value if it's an older row. */
function formatGraduation(v: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  if (!m) return v;
  const date = new Date(Number(m[1]), Number(m[2]) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function ApplicationStatusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/apply?signin=required");

  const identity = toApplicantIdentity(user);

  const application = await getApplication(identity.discordId);

  // Signed in but never applied — reachable by typing the URL.
  if (!application) return <NoApplication />;

  const status = STATUS_COPY[application.status] ?? STATUS_COPY.SUBMITTED;

  return (
    <div className={clsx("min-h-screen px-6 py-8 md:px-11 md:py-10", STARFIELD)}>
      <div className="mx-auto max-w-[860px]">
        {/* header */}
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Image
              src="/hackjam26-words.png"
              alt="HackJam '26"
              width={380}
              height={85}
              className="mb-4 h-auto w-[150px] [image-rendering:pixelated]"
            />
            <h1 className="font-pixel text-lg leading-[1.7]">YOUR APPLICATION</h1>
            <p className="mt-3 max-w-[460px] text-[13px] leading-[1.8] text-text-muted">
              {status.blurb}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2.5 sm:items-end">
            <PixelChip color={status.color}>{status.label}</PixelChip>
            <span className="text-[11px] text-text-faintest">
              Submitted {formatDate(application.createdAt)}
            </span>
          </div>
        </div>

        {/* MLH registration — the one thing still outstanding */}
        <PixelCard borderColor="var(--color-accent-amber)" className="mb-6 p-6">
          <span className="font-pixel text-[9px] tracking-widest text-accent-amber">
            // {mlhRegistration.heading}
          </span>
          <p className="mt-3.5 max-w-[560px] text-[13px] leading-[1.8] text-text-secondary">
            {mlhRegistration.body}
          </p>
          <a
            href={mlhRegistration.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pixel-btn-outline mt-5 inline-flex bg-surface-bg px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-text-primary"
          >
            {mlhRegistration.cta} &rarr;
          </a>
        </PixelCard>

        {/* what they told us */}
        <PixelCard className="p-0">
          <Section number="01" title="BASICS">
            <Row label="Name" value={`${application.person.firstName} ${application.person.lastName}`} />
            <Row label="Email" value={application.person.email} />
            <Row label="Phone" value={application.person.phoneNum} />
            <Row label="Discord" value={identity.username} />
          </Section>

          <Divider />

          <Section number="02" title="ABOUT YOU">
            <Row label="Date of Birth" value={formatDate(application.dateOfBirth)} />
            <Row label="Country" value={application.country} />
            <Row label="Level of Study" value={application.levelOfStudy} />
            <Row label="Gender" value={application.gender} optional />
            <Row label="Race / Ethnicity" value={application.raceEthnicity} optional />
          </Section>

          <Divider />

          <Section number="03" title="SCHOOL">
            <Row label="School" value={application.school} />
            <Row label="Major" value={application.major} />
            <Row label="Graduation" value={formatGraduation(application.graduation)} />
            <Row label="Shirt Size" value={application.shirtSize} />
          </Section>

          <Divider />

          <Section number="04" title="EXPERIENCE">
            <Row label={applicationCopy.questions[0]} value={application.whyAttend} multiline />
            <Row label={applicationCopy.questions[1]} value={application.whatBuild} multiline />
            <Row label={applicationCopy.questions[2]} value={application.quirkFact} multiline />
            <Row label="GitHub" value={application.gitHub} optional />
            <Row label="LinkedIn" value={application.linkedIn} optional />
          </Section>
        </PixelCard>

        <p className="mt-5 text-[11px] leading-[1.7] text-text-faintest">
          Need to change something? Message an organiser in{" "}
          <Link href="/help">Discord</Link> — we can update it for you.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-7 px-6.5 py-7 sm:flex-row sm:gap-9">
      <div className="w-full shrink-0 sm:w-[180px]">
        <div className="mb-2 font-pixel text-[9px] text-accent-pink">{number}</div>
        <div className="text-[13px] font-bold tracking-wide">{title}</div>
      </div>
      <div className="flex flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="mx-6.5 h-px bg-text-primary/8" />;
}

/**
 * One answer. Field is the read-only box the design system already has for
 * exactly this — it wraps long values instead of clipping them, which is why
 * it isn't a disabled input.
 */
function Row({
  label,
  value,
  optional,
  multiline,
}: {
  label: string;
  value: string | null;
  optional?: boolean;
  multiline?: boolean;
}) {
  return (
    <Field
      label={label}
      optional={optional}
      value={value ?? undefined}
      placeholder={value ? undefined : "Not given"}
      multiline={multiline}
      tone="secondary"
    />
  );
}

/** Signed in, no application — someone who typed the URL, or withdrew. */
function NoApplication() {
  return (
    <div
      className={clsx(
        "flex min-h-screen flex-col items-center justify-center px-6 text-center",
        STARFIELD,
      )}
    >
      <Image
        src="/hackjam26-words.png"
        alt="HackJam '26"
        width={380}
        height={85}
        className="mb-6 h-auto w-[170px] [image-rendering:pixelated]"
      />
      <h1 className="mb-4 font-pixel text-base leading-[1.7]">NOTHING HERE YET</h1>
      <p className="mb-7 max-w-[380px] text-[13px] leading-[1.8] text-text-muted">
        You haven&apos;t applied to HackJam &#39;26 with this Discord account.
      </p>
      <Link
        href="/apply/form"
        className="pixel-btn-solid inline-flex px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg"
      >
        START AN APPLICATION &rarr;
      </Link>
    </div>
  );
}
