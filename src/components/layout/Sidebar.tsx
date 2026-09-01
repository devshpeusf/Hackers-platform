"use client";

import { useState } from "react";
import Image from "next/image";
import clsx from "@/lib/clsx";
import SidebarNav from "./SidebarNav";
import { sidebarUser } from "@/lib/placeholder-data";

/**
 * The sidebar shell: logo, nav, SHPE USF logo, account line. Desktop
 * rendering matches the mockup's fixed 240px column. Below md it
 * collapses into a slide-in drawer behind a hamburger button, since
 * organizers will use this on phones at the door.
 */
export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b-4 border-border-default bg-surface-sidebar px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 flex-col items-center justify-center gap-[5px]"
        >
          <span className="h-[2px] w-5 bg-text-primary" />
          <span className="h-[2px] w-5 bg-text-primary" />
          <span className="h-[2px] w-5 bg-text-primary" />
        </button>
        <Image src="/hackjam26-words.png" alt="HackJam" width={130} height={29} className="h-6 w-auto [image-rendering:pixelated]" />
        <div className="w-8" />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col gap-1 border-r-4 border-border-default bg-surface-sidebar px-[18px] py-7 transition-transform duration-200 ease-out",
          "md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Image
          src="/hackjam26-words.png"
          alt="HackJam"
          width={130}
          height={29}
          className="mb-6 ml-1 w-[130px] h-auto [image-rendering:pixelated]"
        />

        <SidebarNav onNavigate={() => setOpen(false)} />

        <div className="flex-1" />

        <Image
          src="/shpe-usf-horiz-ko.png"
          alt="SHPE USF"
          width={150}
          height={27}
          className="mb-5 w-[150px] h-auto opacity-[0.82]"
        />
        <div className="text-[10px] tracking-wide text-text-faintest">{sidebarUser.handle}</div>
      </aside>
    </>
  );
}
