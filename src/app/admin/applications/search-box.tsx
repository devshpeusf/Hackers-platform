"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "@/lib/clsx";

/**
 * Searches as you type rather than on Enter — the filtering itself happens on
 * the server (the page reads ?q=), this just keeps the URL in step with the
 * box after a short pause. Living in the URL means a refresh, the back
 * button, or a link pasted to another organizer all land on the same view.
 */
export default function SearchBox({ initialQuery, status }: { initialQuery: string; status: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (value.trim() === initialQuery) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      if (status) params.set("status", status);
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
    }, 250);
    return () => clearTimeout(timer);
  }, [value, initialQuery, status, pathname, router]);

  return (
    <input
      id="admin-applications-search"
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="search by name or email"
      autoComplete="off"
      aria-label="Search applications by name or email"
      className={clsx(
        "field min-w-0 flex-1 basis-60 px-3.5 py-2.5 font-body text-[13px] text-text-primary placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent-pink",
        pending && "opacity-70",
      )}
    />
  );
}
