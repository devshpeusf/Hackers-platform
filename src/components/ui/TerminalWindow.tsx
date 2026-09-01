import type { ReactNode } from "react";
import clsx from "@/lib/clsx";

type TerminalWindowProps = {
  /** Shown next to the three dots, e.g. "CONTACT.LOG". */
  filename: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/** Title bar with three dots + a filename label, and a scanline overlay on the body. */
export default function TerminalWindow({ filename, children, className, bodyClassName }: TerminalWindowProps) {
  return (
    <div className={clsx("terminal-window", className)}>
      <div className="terminal-bar flex items-center gap-2.5 px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 bg-terminal-red" />
        <span className="h-2.5 w-2.5 bg-terminal-yellow" />
        <span className="h-2.5 w-2.5 bg-terminal-green" />
        <span className="ml-1.5 font-pixel text-[8px] text-text-secondary">{filename}</span>
      </div>
      <div className={clsx("relative", bodyClassName)}>{children}</div>
    </div>
  );
}
