import type { ReactNode } from "react";
import clsx from "@/lib/clsx";

type PixelButtonProps = {
  children: ReactNode;
  variant?: "solid" | "outline";
  className?: string;
  onClick?: () => void;
};

/**
 * Chunky offset-shadow button. Non-functional by design this phase —
 * these render but don't submit/navigate/persist anything.
 *
 * Padding and font-size aren't defaulted here: the mockup sets them
 * per-instance (11px/22px on most buttons, 9px/16px + smaller text on
 * "LEAVE TEAM") rather than sharing one size, so callers pass those
 * via `className` — see usages for the exact values to match.
 */
export default function PixelButton({ children, variant = "solid", className, onClick }: PixelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-body font-bold tracking-wide transition-transform duration-200",
        variant === "solid" && "pixel-btn-solid text-surface-bg",
        variant === "outline" && "pixel-btn-outline bg-surface-bg text-text-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}
