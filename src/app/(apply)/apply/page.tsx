import Image from "next/image";
import Link from "next/link";
import clsx from "@/lib/clsx";
import DiscordIcon from "@/components/ui/DiscordIcon";
import { applicationCopy } from "@/lib/placeholder-data";
import { STARFIELD, Dots } from "../_shared";

/**
 * The landing screen someone reaches from "Register Now" on hackjam26.com.
 *
 * A SERVER COMPONENT on purpose. This screen has exactly one action, and a
 * <Link> performs it with no JavaScript at all — so the button is live the
 * instant the page paints. Previously this lived inside the client wizard,
 * which meant ~491KB of step components, fields and the school picker had to
 * download and hydrate before one button would respond.
 *
 * It's also closer to where this is heading: when PLAT-12 lands, "Sign in with
 * Discord" becomes a real OAuth redirect — a navigation, not a state change.
 * Swapping this Link's href for the auth route is then the whole change.
 */
export default function ApplyLandingPage() {
  return (
    <div className={clsx("flex min-h-screen flex-col px-6 py-6 md:px-11 md:py-9", STARFIELD)}>
      <div className="flex items-center gap-2.5 border-b border-text-primary/7 pb-4 text-[11px] text-text-faintest">
        <span>{applicationCopy.from}</span>
        <span className="text-text-dim">&rarr;</span>
        <span className="text-accent-teal">apply</span>
        <div className="flex-1" />
        <Image
          src="/shpe-usf-horiz-ko.png"
          alt="SHPE USF"
          width={380}
          height={69}
          className="h-auto w-[124px] opacity-70"
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Image
          src="/logo-levitate.webp"
          alt="HackJam '26"
          width={966}
          height={552}
          unoptimized
          priority
          className="mb-6 h-auto w-[264px] max-w-full [image-rendering:pixelated] drop-shadow-[0_0_40px_rgba(255,46,151,0.3)]"
        />

        <h1 className="mb-5 font-pixel text-[25px] leading-[1.7]">
          LET&apos;S GET YOU
          <br />
          SIGNED UP
        </h1>

        <div className="mb-5">
          <Dots />
        </div>

        <p className="mb-7 max-w-[430px] text-[13px] leading-[1.85] text-text-muted">
          {applicationCopy.intro}
        </p>

        <Link
          href="/apply/form"
          className="pixel-btn-solid inline-flex items-center justify-center gap-2.5 px-7 py-[15px] font-body text-xs font-bold tracking-wide text-surface-bg"
        >
          <DiscordIcon size={18} />
          SIGN IN WITH DISCORD
        </Link>

        <p className="mt-[18px] text-[11px] text-text-faintest">{applicationCopy.finePrint}</p>
      </div>
    </div>
  );
}
