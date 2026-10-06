import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/organizer";
import { applicationCopy } from "@/lib/placeholder-data";
import PixelCard from "@/components/ui/PixelCard";
import PixelChip from "@/components/ui/PixelChip";
import Field from "@/components/ui/Field";
import { STATUS_STYLE } from "../status";

/**
 * One application in full, for an organizer. Read-only for now — accepting,
 * waitlisting and rejecting from here is the obvious next step, but changing
 * someone's status should be its own deliberate piece of work.
 */

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "2027-05" -> "May 2027". Falls back to the raw value for older rows. */
function formatGraduation(v: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  if (!m) return v;
  return new Date(Number(m[1]), Number(m[2]) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function AdminApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrganizer();
  const { id } = await params;

  const a = await prisma.application.findUnique({
    where: { id },
    include: { person: { include: { resume: true } }, event: true },
  });
  if (!a) notFound();

  const status = STATUS_STYLE[a.status];

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[860px]">
        <Link
          href="/admin/applications"
          className="mb-6 inline-block text-[12px] text-text-muted hover:text-accent-pink"
        >
          &larr; All applications
        </Link>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="mb-2 break-words font-pixel text-lg leading-[1.7] text-text-primary">
              {a.person.firstName} {a.person.lastName}
            </h1>
            <p className="break-words text-[13px] text-text-muted">{a.person.email}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <PixelChip color={status.color}>{status.label}</PixelChip>
            <span className="text-[11px] text-text-faintest">
              Applied {formatDate(a.createdAt)} · {a.event.name}
            </span>
          </div>
        </div>

        <PixelCard className="p-0">
          <Section number="01" title="BASICS">
            <Field label="Phone" value={a.person.phoneNum} tone="secondary" />
            <Field label="Date of Birth" value={formatDate(a.dateOfBirth)} tone="secondary" />
            <Field label="Minor at event" value={a.isMinor ? "Yes — needs MLH minor consent" : "No"} tone="secondary" />
            <Field label="Country" value={a.country} tone="secondary" />
            <Field label="Gender" optional value={a.gender ?? undefined} placeholder="Not given" tone="secondary" />
            <Field label="Race / Ethnicity" optional value={a.raceEthnicity ?? undefined} placeholder="Not given" tone="secondary" />
          </Section>

          <Divider />

          <Section number="02" title="SCHOOL">
            <Field label="School" value={a.school} tone="secondary" />
            <Field label="Level of Study" value={a.levelOfStudy} tone="secondary" />
            <Field label="Major" value={a.major} tone="secondary" />
            <Field label="Graduation" value={formatGraduation(a.graduation)} tone="secondary" />
            <Field label="Shirt Size" value={a.shirtSize} tone="secondary" />
            <Field label="Dietary Restriction" value={a.diet} tone="secondary" />
          </Section>

          <Divider />

          <Section number="03" title="EXPERIENCE">
            <Field label={applicationCopy.questions[0]} value={a.whyAttend} multiline tone="secondary" />
            <Field label={applicationCopy.questions[1]} value={a.whatBuild} multiline tone="secondary" />
            <Field label={applicationCopy.questions[2]} value={a.quirkFact} multiline tone="secondary" />
            <Field label="GitHub" optional value={a.gitHub ?? undefined} placeholder="Not given" tone="secondary" />
            <Field label="LinkedIn" optional value={a.linkedIn ?? undefined} placeholder="Not given" tone="secondary" />
            <Field label="Resume" value={a.person.resume?.fileName} placeholder="None on file" tone="secondary" />
          </Section>

          <Divider />

          <Section number="04" title="CONSENT">
            <Field label="MLH Code of Conduct" value={a.agreedCodeOfConduct ? "Agreed" : "Not agreed"} tone="secondary" />
            <Field label="MLH data sharing" value={a.agreedDataSharing ? "Agreed" : "Not agreed"} tone="secondary" />
            <Field label="MLH marketing" value={a.agreedMarketing ? "Opted in" : "Opted out"} tone="secondary" />
            <Field label="Agreed on" value={formatDate(a.agreementsAt)} tone="secondary" />
          </Section>
        </PixelCard>
      </div>
    </div>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 px-6 py-7 sm:flex-row sm:gap-9">
      <div className="w-full shrink-0 sm:w-[160px]">
        <div className="mb-2 font-pixel text-[9px] text-accent-pink">{number}</div>
        <div className="text-[13px] font-bold tracking-wide text-text-primary">{title}</div>
      </div>
      {/* min-w-0: without it a long unbroken answer widens this flex column
          past the card — same fix as /apply/status. */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="mx-6 h-px bg-text-primary/8" />;
}
