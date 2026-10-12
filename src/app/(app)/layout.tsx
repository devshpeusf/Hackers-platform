import { createClient } from "@/lib/supabase/server"; //client creator imports
import { toApplicantIdentity } from "@/lib/supabase/user";

import type { ReactNode } from "react";
import Sidebar from "@/components/layout/Sidebar";

/**
 * Shared shell for the six hacker-portal pages: sidebar nav + content
 * area. The mockup's 56px desktop padding is kept faithful at md+;
 * mobile gets a smaller inset since the sidebar becomes a top bar.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {

  const supabase = await createClient(); // create client to show real using session's cookies
  const {  // ask supabase client who is currently signed in
    data: { user },
  } = await supabase.auth.getUser();

  const identity = user ? toApplicantIdentity(user) : null; // read discord identity if it exists, leave null o/w
  const accountLabel = identity ?  `${identity.username} · DISCORD ACCOUNT` //show username in sidebar or not signed in o/w
  : "NOT SIGNED IN";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar accountLabel = {accountLabel}/>
      <main className="flex-1 px-5 py-8 md:px-14 md:py-14">{children}</main>
    </div>
  );
}
