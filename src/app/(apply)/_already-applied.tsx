import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "@/lib/clsx";
import { STARFIELD } from "./_shared";
import { mlhRegistration } from "@/lib/placeholder-data";

/**
 * The "you've already applied" screen.
 *
 * Shared because it's reachable two ways: the normal path, where someone signs
 * in again and `/apply/form` sends them here, and the race, where two tabs or a
 * double-submit trips the unique constraint inside the wizard. Both should look
 * identical — a returning applicant shouldn't be able to tell which happened.
 *
 * Presentational only, so the server route and the client wizard can both
 * render it.
 */

/** Terminal-window chrome, matching the confirmation screen. */
export function ResultScreen({
  filename,
  tag,
  tagColor,
  heading,
  children,
}: {
  filename: string;
  tag: string;
  tagColor: string;
  heading: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={clsx("flex min-h-screen items-center justify-center px-6 py-10", STARFIELD)}>
      <div className="terminal-window w-full max-w-[620px]">
        <div className="terminal-bar flex items-center gap-2.5 px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 bg-terminal-red" />
          <span className="h-2.5 w-2.5 bg-terminal-yellow" />
          <span className="h-2.5 w-2.5 bg-terminal-green" />
          <span className="ml-1.5 font-pixel text-[8px] text-text-secondary">{filename}</span>
        </div>
        <div className="relative px-7 pb-7 pt-8 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-5 [background:repeating-linear-gradient(to_bottom,#f4f1fb_0_1px,transparent_1px_3px)]" />
          <div className="mb-4 font-pixel text-[9px] tracking-widest" style={{ color: tagColor }}>
            {tag}
          </div>
          <h2 className="mb-4 font-pixel text-lg leading-[1.7]">{heading}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AlreadyApplied({ username }: { username: string }) {
  return (
    <ResultScreen
      filename="APPLICATION.LOG"
      tag="// ALREADY APPLIED"
      tagColor="var(--color-accent-amber)"
      heading="ONE PER HACKER"
    >
      <p className="mb-6 text-[13px] leading-[1.8] text-text-muted">
        You&apos;ve already applied as{" "}
        <span className="text-accent-purple-light">{username}</span>. We only take one
        application per Discord account &mdash; nothing else to fill in.
      </p>

      <div className="flex flex-col items-stretch justify-center gap-3.5 sm:flex-row sm:items-center">
        <Link
          href="/apply/status"
          className="pixel-btn-solid inline-flex items-center justify-center px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg"
        >
          VIEW MY APPLICATION &rarr;
        </Link>
        {/*
          Sits beside the primary action rather than below it: MLH registration
          is the one thing a returning applicant might still owe us, and it's
          easy to miss if it's buried further down.
        */}
        <a
          href={mlhRegistration.url}
          target="_blank"
          rel="noopener noreferrer"
          className="pixel-btn-outline inline-flex items-center justify-center bg-surface-bg px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-text-primary"
        >
          {mlhRegistration.cta} &rarr;
        </a>
      </div>

      <p className="mt-5 text-[11px] leading-[1.7] text-text-faintest">
        Applying here doesn&apos;t register you with MLH &mdash; that&apos;s a separate step every
        hacker has to do.
      </p>
    </ResultScreen>
  );
}
