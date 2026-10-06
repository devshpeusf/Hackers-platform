import type { ApplicationStatus } from "@/generated/prisma/client";

/**
 * Display rules for ApplicationStatus, shared by the list and detail pages so
 * a status can't be one colour in the table and another once you click in.
 */
export const STATUS_STYLE: Record<ApplicationStatus, { label: string; color: string }> = {
  SUBMITTED: { label: "SUBMITTED", color: "var(--color-accent-amber)" },
  ACCEPTED: { label: "ACCEPTED", color: "var(--color-accent-teal)" },
  WAITLISTED: { label: "WAITLISTED", color: "var(--color-accent-purple-light)" },
  REJECTED: { label: "REJECTED", color: "var(--color-terminal-red)" },
};

export const STATUSES = Object.keys(STATUS_STYLE) as ApplicationStatus[];

/** `?status=accepted` -> "ACCEPTED", anything unrecognised -> null (= all). */
export function parseStatus(raw: string | undefined): ApplicationStatus | null {
  const upper = raw?.toUpperCase();
  return STATUSES.find((s) => s === upper) ?? null;
}
