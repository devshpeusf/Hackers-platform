import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import clsx from "@/lib/clsx";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/organizer";
import PixelChip from "@/components/ui/PixelChip";
import SearchBox from "./search-box";
import { STATUS_STYLE, STATUSES, parseStatus } from "./status";

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
  "grid grid-cols-[minmax(0,1fr)_auto_3.5rem] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_7.5rem_3.5rem] items-center gap-x-4";

function formatApplied(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  searchParams: Promise<{ q?: string; status?: string }>;
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

  const [counts, rows] = await Promise.all([
    prisma.application.groupBy({
      by: ["status"],
      where: { eventId: event.id },
      _count: { _all: true },
    }),
    prisma.application.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        school: true,
        levelOfStudy: true,
        createdAt: true,
        person: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
  ]);

  const countByStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<(typeof STATUSES)[number], number>;
  for (const c of counts) countByStatus[c.status] = c._count._all;
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
          <span>NAME</span>
          <span className="hidden md:block">EMAIL</span>
          <span className="hidden md:block">SCHOOL</span>
          <span className="hidden md:block">LEVEL</span>
          <span>STATUS</span>
          <span className="text-right">APPLIED</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState filtered={filtered} />
        ) : (
          <ul>
            {rows.map((r) => {
              const name = `${r.person.firstName} ${r.person.lastName}`;
              return (
                <li key={r.id} className="border-b border-border-default last:border-b-0">
                  <Link
                    href={`/admin/applications/${r.id}`}
                    className={clsx(
                      ROW_GRID,
                      "group px-4 py-2.5 text-[13px] text-text-secondary transition-colors hover:bg-accent-pink/7 focus-visible:bg-accent-pink/7 focus-visible:shadow-[inset_3px_0_0_var(--color-accent-pink)] focus-visible:outline-none md:px-6",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-text-primary group-hover:text-accent-pink">
                        {name}
                      </span>
                      <span className="block truncate text-[11px] text-text-dim md:hidden">{r.person.email}</span>
                    </span>
                    <span className="hidden truncate text-text-muted md:block">{r.person.email}</span>
                    <span className="hidden truncate md:block">{r.school}</span>
                    <span className="hidden truncate md:block">{SHORT_LEVEL[r.levelOfStudy] ?? r.levelOfStudy}</span>
                    <span>
                      <PixelChip color={STATUS_STYLE[r.status].color}>{STATUS_STYLE[r.status].label}</PixelChip>
                    </span>
                    <span className="text-right tabular-nums text-text-muted">{formatApplied(r.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="py-4 text-[11px] text-text-faintest">
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
            <p className="mb-6 text-[13px] text-text-muted">
              {eventName ? `review queue for ${eventName}` : "review queue"}
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
