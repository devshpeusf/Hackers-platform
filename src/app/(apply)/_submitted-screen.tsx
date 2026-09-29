import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "@/lib/clsx";
import { STARFIELD } from "./_shared";
import { mlhRegistration } from "@/lib/placeholder-data";

/**
 * "You're in the pile" — the one screen an applicant sees once they're done.
 *
 * Reached three ways, and identical every time:
 *   1. finishing the form
 *   2. signing in again after applying (/apply/applied)
 *   3. a double-submit tripping the unique constraint mid-wizard
 *
 * It used to be two different screens — this one and a "ONE PER HACKER"
 * variant for returning applicants — which meant the same fact was delivered
 * two different ways depending on how you arrived. There's nothing a
 * returning applicant needs to be told that a just-submitted one doesn't.
 */

/** Terminal-window chrome, shared with the applications-closed screen. */
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

export default function SubmittedScreen({ email }: { email: string | null }) {
  return (
    <ResultScreen
      filename="APPLICATION.LOG"
      tag="// SUBMITTED"
      tagColor="var(--color-accent-teal)"
      heading={
        <>
          YOU&apos;RE IN
          <br />
          THE PILE
        </>
      }
    >
      <p className="mb-5 text-[13px] leading-[1.8] text-text-muted">
        We&apos;ll email{" "}
        <span className="text-accent-teal">{email ?? "the address you gave us"}</span> when
        decisions go out. Nothing else to do here &mdash; but you still need to register with MLH.
      </p>

      <div className="mx-auto mb-6 max-w-[320px] text-left text-xs leading-[2.05] text-text-dim">
        <div>
          <span className="text-accent-teal">$</span> application --submit{" "}
          <span className="text-terminal-green">OK</span>
        </div>
        <div>
          <span className="text-accent-teal">$</span> mlh --register{" "}
          <span className="text-terminal-yellow">TODO</span>
        </div>
        <div>
          <span className="text-accent-teal">$</span> review --status{" "}
          <span className="text-terminal-yellow">PENDING</span>
        </div>
      </div>

      <div className="mx-auto mb-6 max-w-[420px] border-l-[3px] border-accent-amber bg-accent-amber/6 px-4 py-3 text-left">
        <div className="mb-1.5 font-pixel text-[8px] tracking-widest text-accent-amber">
          {mlhRegistration.heading}
        </div>
        <p className="text-[11px] leading-[1.7] text-text-muted">{mlhRegistration.body}</p>
        <a
          href={mlhRegistration.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[11px] font-bold text-accent-amber"
        >
          {mlhRegistration.cta} &rarr;
        </a>
      </div>

      <div className="flex flex-wrap justify-center gap-3.5">
        <Link
          href="/apply/status"
          className="pixel-btn-solid px-[22px] py-[11px] font-body text-[11px] font-bold tracking-wide text-surface-bg"
        >
          VIEW MY APPLICATION &rarr;
        </Link>
      </div>
    </ResultScreen>
  );
}
