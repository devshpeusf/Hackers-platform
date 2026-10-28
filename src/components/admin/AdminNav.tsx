"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "@/lib/clsx";

type NavItem = { href: string; label: string };

/**
 * The bar across the top of every /admin page: back to the hub, plus each tool
 * the viewer's role can use. Scrolls sideways on a phone instead of wrapping.
 */
export default function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // The most specific match wins, so /admin/applications/send highlights
  // "Send decisions", not "Applications".
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Staff tools" className="sticky top-0 z-20 border-b-2 border-border-default bg-surface-sidebar">
      <div className="mx-auto flex max-w-[1180px] items-center gap-1 overflow-x-auto px-4 md:px-10">
        <Link
          href="/admin"
          aria-current={pathname === "/admin" ? "page" : undefined}
          className={clsx(
            "shrink-0 py-3.5 pr-4 font-pixel text-[10px] tracking-widest",
            pathname === "/admin" ? "text-accent-pink" : "text-text-primary hover:text-accent-pink",
          )}
        >
          STAFF HUB
        </Link>
        <span aria-hidden="true" className="mr-2 h-4 w-px shrink-0 bg-text-primary/15" />
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active === item.href ? "page" : undefined}
            className={clsx(
              "shrink-0 border-b-2 px-3 py-3.5 text-[13px] font-bold whitespace-nowrap transition-colors",
              active === item.href
                ? "border-accent-pink text-text-primary"
                : "border-transparent text-text-muted hover:text-text-primary",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
