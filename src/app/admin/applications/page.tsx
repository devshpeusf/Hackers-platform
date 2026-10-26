import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import clsx from "@/lib/clsx";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/organizer";
import PixelChip from "@/components/ui/PixelChip";
import SearchBox from "./search-box";
import type { ApplicationStatus, RsvpStatus } from "@/generated/prisma/client";
import { STATUS_STYLE, STATUSES, parseStatus, RSVP_LABEL } from "./status";
import { DECISIONS, decisionLocked, needsAnnouncement } from "@/lib/decisions";
import { decideApplication } from "./actions";
import { BulkDecideBar, SelectAll } from "./bulk-decide";
import { BULK_FORM_ID } from "./bulk-form";

/**
 * The organizer review queue: every application for the current event, with
 * search and a status filter. Organizer-only, reached by URL like
 * /admin/email-queue.
 *
 * Filtering runs in the query rather than in the browser — at 500 rows that's
 * still cheap, and it means the page never ships every applicant's details to
 * the client just to hide most of them.
 *
 * Built for scanning for long stretches: the retro styling stays in the frame,
 * header and chips; rows are plain, tight and hairline-separated.
 */

/** The full answers are long for a dense column — the detail page shows them in full. */
const SHORT_LEVEL: Record<string, string> = {
  "Undergraduate University (4-year)": "University",
  "Community College (2-year)": "Community College",
  "Graduate University (Masters, Doctoral, etc)": "Graduate",
  "High School": "High School",
  "Code School / Bootcamp": "Bootcamp",
};

/**
 * Mobile keeps Name (with the email tucked under it), Status and Applied —
 * the three things worth scanning on a phone. Email, School and Level come
 * back as their own columns from md up.
 */
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto_3.5rem] md:grid-cols-[1.25rem_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_7.5rem_3.5rem_6.5rem] items-center gap-x-4";

function formatApplied(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Single letters, because three full labels per row across 81 rows is a wall. */
const DECIDE_SHORT: Record<(typeof DECISIONS)[number], string> = {
  ACCEPTED: "A",
  WAITLISTED: "W",
  REJECTED: "R",
};

/**
 * Decide without leaving the list.
 *
 * Deliberately absent once an outcome has been emailed: reversing something the
 * applicant has already read deserves the detail page, where the warning names
 * what they were told. Keeping the override off a one-click row control is the
 * point, not an omission.
 *
 * pointer-events are re-enabled here because the wrapper disables them — the
 * row underneath is one big link, and only these controls should intercept it.
 */
function RowDecide({
  id,
  status,
  locked,
  returnTo,
}: {
  id: string;
  status: ApplicationStatus;
  locked: boolean;
  returnTo: string;
}) {
  if (locked) {
    return (
      <Link
        href={`/admin/applications/${id}`}
        className="pointer-events-auto text-[10px] uppercase tracking-wider text-text-faintest hover:text-accent-pink"
        title="Already emailed — change it on the full application"
      >
        emailed
      </Link>
    );
  }

  return (
    <div className="pointer-events-auto flex gap-1">
      {DECISIONS.map((d) => {
        const style = STATUS_STYLE[d];
        const current = d === status;
        return (
          <form key={d} action={decideApplication}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="decision" value={d} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              disabled={current}
              title={current ? `Already ${style.label.toLowerCase()}` : `Mark ${style.label.toLowerCase()}`}
              aria-label={current ? `Already ${style.label.toLowerCase()}` : `Mark ${style.label.toLowerCase()}`}
              className={clsx(
                "h-7 w-7 border font-body text-[11px] font-bold transition-colors",
                current
                  ? "cursor-default border-transparent opacity-100"
                  : "border-text-primary/15 opacity-55 hover:opacity-100",
              )}
              style={{ color: style.color, borderColor: current ? style.color : undefined }}
            >
              {DECIDE_SHORT[d]}
            </button>
          </form>
        );
      })}
    </div>
  );
}

function filterHref(status: string | null, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status.toLowerCase());
  const qs = params.toString();
  return qs ? `/admin/applications?${qs}` : "/admin/applications";
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    bulk?: string;
    changed?: string;
    unchanged?: string;
    skipped?: string;
    ignored?: string;
  }>;
}) {
  await requireOrganizer();

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = parseStatus(params.status);

  // The most recent event, not getOpenEvent(): organizers keep reviewing
  // after applications close, when "open" would return nothing.
  const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" } });

  if (!event) {
    return (
      <Shell eventName={null}>
        <p className="py-16 text-center text-[13px] text-text-muted">No event exists yet, so there&apos;s nothing to review.</p>
      </Shell>
    );
  }

  // Every word has to match somewhere, so "mariana reyes" finds Mariana
  // Reyes without needing a full-name column.
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 5);
  // Deciding from a row comes back to this exact view — same filter, same
  // search — rather than dumping you at the unfiltered top of the list.
  const returnTo = filterHref(status, q);

  const where: Prisma.ApplicationWhereInput = {
    eventId: event.id,
    ...(status && { status }),
    AND: terms.map((term) => ({
      person: {
        OR: [
          { firstName: { contains: term, mode: "insensitive" } },
          { lastName: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
        ],
      },
    })),
  };

  const [counts, rows, decided] = await Promise.all([
    prisma.application.groupBy({
      by: ["status", "rsvpStatus"],
      where: { eventId: event.id },
      _count: { _all: true },
    }),
    prisma.application.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        rsvpStatus: true,
        school: true,
        levelOfStudy: true,
        createdAt: true,
        person: { select: { firstName: true, lastName: true, email: true } },
        // Enough to know whether this row's outcome has already gone out — a
        // decided-and-emailed row sends you to the profile rather than deciding here.
        emailQueue: { select: { emailType: true, status: true, sentAt: true } },
      },
    }),
    // Every decided applicant on the event, not just the filtered page: "how
    // many still haven't been told" is a property of the whole queue, and
    // shouldn't change because someone typed a name in the search box.
    prisma.application.findMany({
      where: { eventId: event.id, status: { not: "SUBMITTED" } },
      select: { status: true, source: true, emailQueue: { select: { emailType: true } } },
    }),
  ]);

  const unannounced = decided.filter((d) => needsAnnouncement(d.status, d.source, d.emailQueue)).length;

  const countByStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<(typeof STATUSES)[number], number>;
  const rsvpCounts: Record<RsvpStatus, number> = { PENDING: 0, CONFIRMED: 0, DECLINED: 0 };
  for (const c of counts) {
    countByStatus[c.status] += c._count._all;
    if (c.status === "ACCEPTED") rsvpCounts[c.rsvpStatus] += c._count._all;
  }
  const total = STATUSES.reduce((sum, s) => sum + countByStatus[s], 0);
  const filtered = Boolean(q || status);

  return (
    <Shell eventName={event.name}>
      {/* Summary first: the total, then each status — which double as filters. */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="field flex min-w-[9.5rem] flex-col justify-center gap-1.5 px-5 py-3">
          <span className="font-pixel text-2xl tabular-nums text-text-primary">{total}</span>
          <span className="font-pixel text-[8px] tracking-widest text-text-muted">APPLICATIONS</span>
        </div>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={filterHref(status === s ? null : s, q)}
            aria-current={status === s ? "true" : undefined}
            className={clsx(
              "field flex min-w-[6.5rem] flex-col justify-center gap-1 px-4 py-2.5 transition-colors hover:border-text-primary/30 focus-visible:outline-2 focus-visible:outline-accent-pink",
              status === s && "!border-accent-pink",
            )}
          >
            <span className="text-[17px] font-bold tabular-nums text-text-primary">{countByStatus[s]}</span>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: STATUS_STYLE[s].color }}>
              {STATUS_STYLE[s].label}
            </span>
          </Link>
        ))}
      </div>

      <section aria-label="Accepted applicant RSVPs" className="mb-5 border-2 border-border-default p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([
            ["Accepted offers", countByStatus.ACCEPTED],
            ["Awaiting RSVP", rsvpCounts.PENDING],
            ["Confirmed", rsvpCounts.CONFIRMED],
            ["Declined", rsvpCounts.DECLINED],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] text-text-muted">{label}</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-text-primary">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] text-text-faintest">Confirmed and declined responses are included in accepted offers.</p>
      </section>

      <BulkResult params={params} />

      {/* Only when there's something to send — once the queue is drained this
          disappears rather than sitting there as a dead control. */}
      {unannounced > 0 && (
        <Link
          href="/admin/applications/send"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 border-2 border-accent-pink bg-accent-pink/6 px-4 py-3 transition-colors hover:bg-accent-pink/12"
        >
          <span className="text-[13px] leading-[1.7] text-text-secondary">
            <strong className="text-text-primary">{unannounced}</strong>{" "}
            {unannounced === 1 ? "decision hasn't" : "decisions haven't"} been emailed yet.
          </span>
          <span className="font-pixel text-[9px] tracking-widest text-accent-pink">SEND DECISIONS &rarr;</span>
        </Link>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchBox initialQuery={q} status={status?.toLowerCase() ?? null} />
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {[null, ...STATUSES].map((s) => {
            const active = status === s;
            return (
              <Link
                key={s ?? "all"}
                href={filterHref(s, q)}
                aria-current={active ? "true" : undefined}
                className={clsx(
                  "border-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-accent-pink",
                  active
                    ? "border-accent-pink text-accent-pink"
                    : "border-border-default text-text-muted hover:text-text-secondary",
                )}
              >
                {s ? STATUS_STYLE[s].label.toLowerCase() : "all"}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="-mx-4 border-y-2 border-border-default md:-mx-6">
        <div
          className={clsx(
            ROW_GRID,
            "sticky top-0 z-10 border-b-2 border-border-default bg-surface-bg px-4 py-3 font-pixel text-[8px] tracking-widest text-text-muted md:px-6",
          )}
        >
          <span className="hidden items-center md:flex">
            <SelectAll />
          </span>
          <span>NAME</span>
          <span className="hidden md:block">EMAIL</span>
          <span className="hidden md:block">SCHOOL</span>
          <span className="hidden md:block">LEVEL</span>
          <span>STATUS</span>
          <span className="text-right">APPLIED</span>
          <span className="hidden text-right md:block">DECIDE</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState filtered={filtered} />
        ) : (
          <ul>
            {rows.map((r) => {
              const name = `${r.person.firstName} ${r.person.lastName}`;
              return (
                <li key={r.id} className="relative border-b border-border-default last:border-b-0">
                  <Link
                    href={`/admin/applications/${r.id}`}
                    className={clsx(
                      ROW_GRID,
                      "group px-4 py-2.5 text-[13px] text-text-secondary transition-colors hover:bg-accent-pink/7 focus-visible:bg-accent-pink/7 focus-visible:shadow-[inset_3px_0_0_var(--color-accent-pink)] focus-visible:outline-none md:px-6",
                    )}
                  >
                    {/* Reserves the checkbox column — the checkbox itself sits
                        outside this <a>, like the DECIDE controls. */}
                    <span className="hidden md:block" />
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-text-primary group-hover:text-accent-pink">
                        {name}
                      </span>
                      <span className="block truncate text-[11px] text-text-dim md:hidden">{r.person.email}</span>
                    </span>
                    <span className="hidden truncate text-text-muted md:block">{r.person.email}</span>
                    <span className="hidden truncate md:block">{r.school}</span>
                    <span className="hidden truncate md:block">{r.levelOfStudy ? SHORT_LEVEL[r.levelOfStudy] ?? r.levelOfStudy : "—"}</span>
                    <span>
                      <PixelChip color={STATUS_STYLE[r.status].color}>{STATUS_STYLE[r.status].label}</PixelChip>
                      {r.status === "ACCEPTED" && (
                        <span className="mt-1 block text-[10px] text-text-muted">{RSVP_LABEL[r.rsvpStatus]}</span>
                      )}
                    </span>
                    <span className="text-right tabular-nums text-text-muted">{formatApplied(r.createdAt)}</span>
                    {/* Reserves the DECIDE column so row text never runs under
                        the controls, which sit outside this <a> — a button
                        can't be nested inside a link. */}
                    <span className="hidden md:block" />
                  </Link>

                  {(() => {
                    const locked = decisionLocked(r.status, r.emailQueue);
                    return (
                      <div className="pointer-events-none absolute inset-y-0 left-6 hidden items-center md:flex">
                        {/* Joined to the bulk form by id, not nested in it.
                            Already-emailed rows can't be selected: bulk never
                            changes those (the server skips them regardless). */}
                        <input
                          type="checkbox"
                          name="ids"
                          value={r.id}
                          form={BULK_FORM_ID}
                          disabled={locked}
                          aria-label={locked ? `${name} — already emailed, change on their page` : `Select ${name}`}
                          title={locked ? "Already emailed — change it on the full application" : undefined}
                          className="pointer-events-auto h-4 w-4 cursor-pointer accent-[var(--color-accent-pink)] disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </div>
                    );
                  })()}

                  <div className="pointer-events-none absolute inset-y-0 right-4 hidden items-center md:flex md:right-6">
                    <RowDecide
                      id={r.id}
                      status={r.status}
                      locked={decisionLocked(r.status, r.emailQueue)}
                      returnTo={returnTo}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BulkDecideBar returnTo={returnTo} />

      <p className="py-4 text-[11px] text-text-faintest md:pb-24">
        {filtered ? (
          <>
            Showing <span className="text-text-secondary">{rows.length}</span> of {total}
          </>
        ) : (
          <>Newest first</>
        )}
      </p>
    </Shell>
  );
}

const BULK_VERB: Record<string, string> = {
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
};

/** What the last bulk decision did, read back from the redirect's query string. */
function BulkResult({ params }: { params: Record<string, string | undefined> }) {
  const verb = params.bulk ? BULK_VERB[params.bulk] : undefined;
  if (!verb) return null;
  const n = (k: string) => Math.max(0, Number(params[k]) || 0);
  const changed = n("changed");
  const unchanged = n("unchanged");
  const skipped = n("skipped");
  const ignored = n("ignored");

  const parts = [`${verb} ${changed}`];
  if (unchanged) parts.push(`${unchanged} already ${verb.toLowerCase()}`);
  if (skipped) parts.push(`${skipped} skipped because they've already been emailed`);
  if (ignored) parts.push(`${ignored} not on this event, ignored`);

  return (
    <p
      role="status"
      className="mb-5 border-l-[3px] border-accent-teal bg-accent-teal/6 px-3.5 py-2.5 text-[12px] leading-[1.7] text-text-secondary"
    >
      {parts.join(" · ")}.{" "}
      {changed > 0 && <span className="text-text-muted">Nobody has been emailed yet.</span>}
    </p>
  );
}

function Shell({ eventName, children }: { eventName: string | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1180px]">
        <div className="pixel-card">
          <div className="terminal-bar flex items-center gap-2.5 px-3.5 py-2.5">
            <span className="h-2.5 w-2.5 bg-terminal-red" />
            <span className="h-2.5 w-2.5 bg-terminal-yellow" />
            <span className="h-2.5 w-2.5 bg-terminal-green" />
            <span className="ml-1.5 font-pixel text-[8px] text-text-secondary">APPLICATIONS.DB</span>
          </div>
          <div className="px-4 pt-6 md:px-6">
            <h1 className="mb-2 font-pixel text-xl leading-[1.6] text-text-primary md:text-2xl">APPLICATIONS</h1>
            <p className="mb-6 flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-text-muted">
              <span>{eventName ? `review queue for ${eventName}` : "review queue"}</span>
              <Link href="/admin/event" className="text-[12px] hover:text-accent-pink">
                Edit hacker guide &rarr;
              </Link>
            </p>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="font-pixel text-[13px] text-text-primary">{filtered ? "NO MATCHES" : "NO APPLICATIONS YET"}</div>
      <p className="max-w-[340px] text-[12px] leading-[1.7] text-text-muted">
        {filtered
          ? "Nobody fits that search and status. Try a different name or email, or switch the filter back to all."
          : "Applications show up here as soon as someone submits."}
      </p>
      {filtered && (
        <Link
          href="/admin/applications"
          className="pixel-btn-solid mt-2 px-4 py-2 font-body text-[11px] font-bold tracking-wide text-surface-bg"
        >
          CLEAR SEARCH &amp; FILTER
        </Link>
      )}
    </div>
  );
}
