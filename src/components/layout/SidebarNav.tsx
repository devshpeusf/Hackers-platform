"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "@/lib/clsx";
import { navItems } from "@/lib/placeholder-data";

type SidebarNavProps = {
  onNavigate?: () => void;
};

/**
 * Nav rows with the active state (teal dot, teal text, tinted row).
 * Active is derived from the current route rather than the mockup's
 * local page state, since routes are real here.
 */
export default function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            className={clsx(
              "nav-row flex items-center gap-2 px-2.5 py-2.5",
              active ? "bg-accent-teal/10" : "bg-transparent",
            )}
          >
            <span className={clsx("h-1.5 w-1.5 shrink-0", active ? "bg-accent-teal" : "bg-transparent")} />
            <span
              className={clsx(
                "text-[11px] font-bold tracking-wide",
                active ? "text-accent-teal" : "text-text-muted",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
