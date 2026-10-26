import type { ReactNode } from "react";
import clsx from "@/lib/clsx";

type FieldProps = {
  /** Label rendered above the box, e.g. "First Name". */
  label?: string;
  /** Renders an italic "Optional" suffix next to the label. */
  optional?: boolean;
  /** A filled-in value. Rendered in `tone` color. */
  value?: string;
  /** Shown instead of `value` when there's nothing to display yet; always rendered dim. */
  placeholder?: string;
  /** Text color when a value is present. Profile fields vary between these to match the mockup. */
  tone?: "primary" | "secondary";
  /** Renders as a textarea-shaped box instead of a single line. */
  multiline?: boolean;
  /** Optional trailing icon, e.g. the chevron on the Help page's category field. */
  rightIcon?: ReactNode;
  /**
   * "lg" uses the portal's larger type scale (see .card-text in globals.css).
   * Default "md" keeps the original size for /apply and /admin.
   */
  size?: "md" | "lg";
  className?: string;
};

const toneClass = {
  primary: "text-text-primary",
  secondary: "text-text-secondary",
};

/**
 * The read-only-looking input box used across Profile and Help. It's a
 * plain non-interactive box, matching the mockup exactly (which never
 * used real form controls here either) — this avoids a real input's
 * text-clipping on long values and keeps the "does nothing yet" intent
 * unambiguous. Swap for a real form control when submission lands.
 */
export default function Field({
  label,
  optional,
  value,
  placeholder,
  tone = "primary",
  multiline = false,
  rightIcon,
  size = "md",
  className,
}: FieldProps) {
  const large = size === "lg";
  const boxClasses = clsx(
    "field w-full break-words",
    large ? "px-4 py-3.5 card-text" : "px-[14px] py-3 text-[13px]",
    multiline ? (large ? "h-32 overflow-y-auto" : "h-24 overflow-y-auto") : "flex items-center justify-between",
    value ? toneClass[tone] : "text-text-dim",
  );

  return (
    <div className={className}>
      {label && (
        <div className={clsx("mb-2 text-text-primary", large ? "card-meta" : "text-xs")}>
          {label}
          {optional && <span className="ml-1.5 italic text-text-dim">Optional</span>}
        </div>
      )}
      <div className={boxClasses}>
        {/* min-w-0 matters here: a flex item won't shrink below its own
            unwrapped content width by default, so break-words alone doesn't
            stop a long spaceless value (a URL, a run-on answer with no
            spaces) from overflowing the card — this is what actually lets
            it wrap instead. */}
        <span className="min-w-0 break-words">{value ?? placeholder}</span>
        {rightIcon}
      </div>
    </div>
  );
}
