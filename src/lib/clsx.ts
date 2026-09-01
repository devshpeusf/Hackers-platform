/**
 * Minimal classnames joiner — avoids pulling in a dependency for
 * something this small. Falsy values are skipped.
 */
export default function clsx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
