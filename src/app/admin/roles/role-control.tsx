"use client";

import { useActionState, useState } from "react";
import clsx from "@/lib/clsx";
import { changeRoleAction, type RoleActionState } from "./actions";

type Role = "APPLICANT" | "VOLUNTEER" | "ORGANIZER";

const LABEL: Record<Role, string> = { APPLICANT: "Applicant", VOLUNTEER: "Volunteer", ORGANIZER: "Organizer" };

/**
 * Three buttons, one per role, with the current one marked. Making someone an
 * organizer asks first: it opens every applicant's data and resume to them.
 * Your own row is read-only (the server refuses self-changes too).
 */
export default function RoleControl({ personId, role, isYou }: { personId: string; role: Role; isYou: boolean }) {
  const [state, action, pending] = useActionState<RoleActionState, FormData>(changeRoleAction, { status: "idle" });
  const [confirmOrganizer, setConfirmOrganizer] = useState(false);

  if (isYou) return <span className="card-meta text-text-dim">That&apos;s you. Ask another organizer to change it.</span>;

  return (
    <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
      <input type="hidden" name="personId" value={personId} />
      {confirmOrganizer ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="card-meta text-accent-amber">Organizers see all applicant data and resumes.</span>
          <button
            type="submit"
            name="role"
            value="ORGANIZER"
            disabled={pending}
            className="pixel-btn-solid px-3.5 py-2 font-body text-[11px] font-bold tracking-wide text-surface-bg disabled:opacity-50"
          >
            CONFIRM
          </button>
          <button type="button" onClick={() => setConfirmOrganizer(false)} className="card-meta text-text-muted hover:text-text-primary">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5" role="group" aria-label="Role">
          {(["APPLICANT", "VOLUNTEER", "ORGANIZER"] as const).map((r) => {
            const current = r === role;
            return (
              <button
                key={r}
                type={r === "ORGANIZER" ? "button" : "submit"}
                name={r === "ORGANIZER" ? undefined : "role"}
                value={r === "ORGANIZER" ? undefined : r}
                disabled={current || pending}
                aria-pressed={current}
                onClick={r === "ORGANIZER" && !current ? () => setConfirmOrganizer(true) : undefined}
                className={clsx(
                  "border px-3 py-1.5 text-[12px] font-bold transition-colors",
                  current
                    ? "cursor-default border-accent-pink text-accent-pink"
                    : "border-text-primary/15 text-text-muted hover:border-text-primary/40 hover:text-text-primary disabled:opacity-50",
                )}
              >
                {LABEL[r]}
              </button>
            );
          })}
        </div>
      )}
      {state.status !== "idle" && (
        <span role={state.status === "error" ? "alert" : "status"} className={clsx("card-meta", state.status === "error" ? "text-terminal-red" : "text-accent-teal")}>
          {state.message}
        </span>
      )}
    </form>
  );
}
