import type { ReactNode } from "react";
import AdminNav from "@/components/admin/AdminNav";
import { getStaffRole } from "@/lib/staff";
import { toolsFor } from "@/lib/admin-tools";

/**
 * The staff nav bar on every /admin page. It only decides which links to
 * show — each page still runs its own role check, and anyone without a staff
 * role sees no bar (the page itself then 404s or sends them to sign in).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const role = await getStaffRole();
  const items = role
    ? toolsFor(role)
        .filter((t) => !t.soon)
        .map(({ href, label }) => ({ href, label }))
    : [];

  return (
    <>
      {role && <AdminNav items={items} />}
      {children}
    </>
  );
}
