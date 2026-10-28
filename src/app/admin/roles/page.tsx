import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/organizer";
import { listStaff, searchPeople, type PersonRow } from "@/lib/roles";
import PixelCard from "@/components/ui/PixelCard";
import SearchBox from "../applications/search-box";
import RoleControl from "./role-control";

/**
 * Who's staff (/admin/roles): organizers and volunteers at the top, and a
 * search to find anyone else to promote. Organizer-only. Every change is
 * recorded (who, when) and shown under the person's name.
 */
export default async function AdminRolesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const identity = await requireOrganizer();
  const me = await prisma.person.findUnique({ where: { discordId: identity.discordId! }, select: { id: true } });

  const q = ((await searchParams).q ?? "").trim();
  const [staff, results] = await Promise.all([listStaff(), q ? searchPeople(q) : Promise.resolve([])]);

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1180px]">
        <h1 className="mb-2 font-pixel text-xl leading-[1.6] text-text-primary md:text-2xl">ROLES</h1>
        <p className="mb-8 max-w-[720px] card-text text-text-muted">
          Volunteers can use the door tools (walk-in, check-in). Organizers can use everything, including applicant
          data. You can&apos;t change your own role.
        </p>

        <PixelCard className="mb-8 card-pad">
          <span className="card-title text-accent-teal">STAFF · {staff.length}</span>
          <People rows={staff} myId={me?.id ?? null} empty="No staff yet." />
        </PixelCard>

        <PixelCard className="card-pad">
          <span className="card-title text-accent-pink">FIND SOMEONE</span>
          <p className="mt-3 mb-4 card-meta text-text-muted">
            Search by name or email. They need to have signed in with Discord at least once.
          </p>
          <SearchBox initialQuery={q} status={null} />
          {q && <People rows={results} myId={me?.id ?? null} empty={`Nobody matches “${q}”.`} />}
        </PixelCard>
      </div>
    </div>
  );
}

function People({ rows, myId, empty }: { rows: PersonRow[]; myId: string | null; empty: string }) {
  if (!rows.length) return <p className="mt-5 card-meta text-text-dim">{empty}</p>;
  return (
    <ul className="mt-4 flex flex-col">
      {rows.map((p) => (
        <li key={p.id} className="flex flex-col gap-3 border-t border-text-primary/8 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="card-text font-bold text-text-primary">{p.name}</div>
            <div className="card-meta break-all text-text-muted">{p.email}</div>
            {p.roleChangedAt && (
              <div className="card-meta text-text-dim">
                Role set by {p.roleChangedBy ?? "an organizer"} on{" "}
                {p.roleChangedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
          </div>
          <RoleControl personId={p.id} role={p.role} isYou={p.id === myId} />
        </li>
      ))}
    </ul>
  );
}
