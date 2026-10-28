import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaffRole } from "@/lib/staff";
import { toolsFor, type AdminTool } from "@/lib/admin-tools";
import PixelCard from "@/components/ui/PixelCard";

/**
 * The staff hub: one place to reach every admin tool. Volunteers see only the
 * tools they can use (the door: walk-in, check-in); organizers see everything,
 * plus a few numbers at the top.
 *
 * Linking isn't access: every tool still checks the role itself.
 */
export default async function AdminHubPage() {
  const role = await requireStaffRole();
  const tools = toolsFor(role);

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1180px]">
        <h1 className="mb-2 font-pixel text-xl leading-[1.6] text-text-primary md:text-2xl">STAFF HUB</h1>
        <p className="mb-8 card-text text-text-muted">
          {role === "ORGANIZER" ? "Everything for running HackJam, in one place." : "Your tools for the door."}
        </p>

        {role === "ORGANIZER" && <Numbers />}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard key={tool.href} tool={tool} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: AdminTool }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="card-title" style={{ color: tool.color }}>
          {tool.title}
        </span>
        {tool.soon ? (
          <span className="shrink-0 border border-text-primary/15 px-2 py-1 font-pixel text-[7px] tracking-widest text-text-dim">
            COMING SOON
          </span>
        ) : (
          <span aria-hidden="true" className="card-text text-text-dim">
            &rarr;
          </span>
        )}
      </div>
      <p className="mt-3 card-meta text-text-secondary">{tool.description}</p>
    </>
  );

  if (tool.soon) {
    return (
      <PixelCard className="card-pad opacity-60" borderColor="var(--color-border-default)">
        {body}
      </PixelCard>
    );
  }
  return (
    <Link href={tool.href} className="block focus-visible:outline-2 focus-visible:outline-accent-pink">
      <PixelCard clickable borderColor={tool.color} className="card-pad h-full">
        {body}
      </PixelCard>
    </Link>
  );
}

/** A quick health check for organizers. All on the current event. */
async function Numbers() {
  const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" }, select: { id: true } });
  if (!event) return null;

  const [applications, accepted, confirmed, walkIns, pendingEmails, failedEmails] = await Promise.all([
    prisma.application.count({ where: { eventId: event.id } }),
    prisma.application.count({ where: { eventId: event.id, status: "ACCEPTED" } }),
    prisma.application.count({ where: { eventId: event.id, status: "ACCEPTED", rsvpStatus: "CONFIRMED" } }),
    prisma.application.count({ where: { eventId: event.id, source: "WALK_IN" } }),
    prisma.emailQueue.count({ where: { status: { in: ["PENDING", "SENDING"] } } }),
    prisma.emailQueue.count({ where: { status: "FAILED" } }),
  ]);

  const stats: { label: string; value: number; href: string; alert?: boolean }[] = [
    { label: "APPLICATIONS", value: applications, href: "/admin/applications" },
    { label: "ACCEPTED", value: accepted, href: "/admin/applications?status=accepted" },
    { label: "CONFIRMED", value: confirmed, href: "/admin/applications?status=accepted" },
    { label: "WALK-INS", value: walkIns, href: "/admin/applications" },
    { label: "EMAILS PENDING", value: pendingEmails, href: "/admin/email-queue" },
    { label: "EMAILS FAILED", value: failedEmails, href: "/admin/email-queue", alert: failedEmails > 0 },
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {stats.map((s) => (
        <Link
          key={s.label}
          href={s.href}
          className="field flex flex-col gap-1.5 px-4 py-3.5 transition-colors hover:border-text-primary/30 focus-visible:outline-2 focus-visible:outline-accent-pink"
        >
          <span className={"font-pixel text-xl tabular-nums " + (s.alert ? "text-terminal-red" : "text-text-primary")}>
            {s.value}
          </span>
          <span className="card-label text-text-muted">{s.label}</span>
        </Link>
      ))}
    </div>
  );
}
