import type { ReactNode } from "react";
import Sidebar from "@/components/layout/Sidebar";

/**
 * Shared shell for the six hacker-portal pages: sidebar nav + content
 * area. The mockup's 56px desktop padding is kept faithful at md+;
 * mobile gets a smaller inset since the sidebar becomes a top bar.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 px-5 py-8 md:px-14 md:py-14">{children}</main>
    </div>
  );
}
