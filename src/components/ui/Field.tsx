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
  className,
}: FieldProps) {
  const boxClasses = clsx(
    "field w-full px-[14px] py-3 text-[13px]",
    multiline ? "h-24" : "flex items-center justify-between",
    value ? toneClass[tone] : "text-text-dim",
  );

  return (
    <div className={className}>
      {label && (
        <div className="mb-2 text-xs text-text-primary">
          {label}
          {optional && <span className="ml-1.5 italic text-text-dim">Optional</span>}
        </div>
      )}
      <div className={boxClasses}>
        <span>{value ?? placeholder}</span>
        {rightIcon}
      </div>
    </div>
  );
}
