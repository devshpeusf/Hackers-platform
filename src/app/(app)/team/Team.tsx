"use client";

import { useActionState, useEffect, useState } from "react";
import PageHeading from "@/components/ui/PageHeading";
import PixelCard from "@/components/ui/PixelCard";
import type { TeamView } from "@/lib/teams";
import { TEAM_MAX, TEAM_NAME_MAX as NAME_MAX } from "@/lib/team-rules";
import {
  createTeamAction,
  joinTeamAction,
  leaveTeamAction,
  renameTeamAction,
  type TeamActionState,
} from "./actions";

const idle: TeamActionState = { status: "idle" };

/**
 * /team — create, join, rename and leave. Informational only: official teams
 * are registered on Devpost, which the page says.
 */
export default function Team({ team }: { team: TeamView | null }) {
  return (
    <div>
      <PageHeading title="TEAM" />
      {team ? <YourTeam team={team} /> : <NoTeam />}
      <p className="mt-5 max-w-[760px] card-meta text-text-faintest">
        Teams of up to {TEAM_MAX}. This helps you find each other here; submit your project as a team on Devpost too.
      </p>
    </div>
  );
}

function NoTeam() {
  const [createState, create, creating] = useActionState(createTeamAction, idle);
  const [joinState, join, joining] = useActionState(joinTeamAction, idle);

  return (
    <div className="grid max-w-[1000px] grid-cols-1 gap-6 md:grid-cols-2">
      <PixelCard borderColor="var(--color-accent-pink)" className="card-pad">
        <span className="card-title text-accent-pink">START A TEAM</span>
        <p className="mt-3 card-text text-text-secondary">Name your team, then share the invite code with your teammates.</p>
        <form action={create} className="mt-5 flex flex-col gap-3">
          <label htmlFor="team-name" className="card-meta text-text-muted">
            Team name
          </label>
          <input
            id="team-name"
            name="name"
            required
            maxLength={NAME_MAX}
            placeholder="Pixel Pioneers"
            className="field px-4 py-3 font-body card-text text-text-primary placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent-pink"
          />
          <button
            type="submit"
            disabled={creating}
            className="pixel-btn-solid mt-1 self-start px-[22px] py-3 font-body text-[12px] font-bold tracking-wide text-surface-bg disabled:opacity-50"
          >
            {creating ? "CREATING…" : "CREATE TEAM"}
          </button>
          <Message state={createState} />
        </form>
      </PixelCard>

      <PixelCard borderColor="var(--color-accent-teal)" className="card-pad">
        <span className="card-title text-accent-teal">JOIN A TEAM</span>
        <p className="mt-3 card-text text-text-secondary">Got a code from a teammate? Enter it here.</p>
        <form action={join} className="mt-5 flex flex-col gap-3">
          <label htmlFor="team-code" className="card-meta text-text-muted">
            Invite code
          </label>
          <input
            id="team-code"
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="HJ-7K3QPX"
            className="field px-4 py-3 font-body card-text uppercase tracking-widest text-text-primary placeholder:normal-case placeholder:tracking-normal placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent-pink"
          />
          <button
            type="submit"
            disabled={joining}
            className="pixel-btn-outline mt-1 self-start bg-surface-bg px-[22px] py-3 font-body text-[12px] font-bold tracking-wide text-text-primary disabled:opacity-50"
          >
            {joining ? "JOINING…" : "JOIN TEAM"}
          </button>
          <Message state={joinState} />
        </form>
      </PixelCard>
    </div>
  );
}

function YourTeam({ team }: { team: TeamView }) {
  const [renaming, setRenaming] = useState(false);
  const [renameState, rename, savingName] = useActionState(renameTeamAction, idle);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveState, leave, leaving] = useActionState(leaveTeamAction, idle);

  // Close the rename box once it saves.
  useEffect(() => {
    if (renameState.status === "ok") setRenaming(false);
  }, [renameState]);

  return (
    <PixelCard borderColor="var(--color-accent-purple)" className="max-w-[760px] card-pad">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="card-title text-accent-purple-light">// YOUR TEAM</span>
        <span className="card-meta text-text-muted">
          {team.members.length} of {TEAM_MAX} members
        </span>
      </div>

      {renaming ? (
        <form action={rename} className="mt-4 flex flex-wrap items-center gap-3">
          <input
            id="team-rename"
            name="name"
            required
            maxLength={NAME_MAX}
            defaultValue={team.name}
            aria-label="Team name"
            className="field min-w-0 flex-1 basis-56 px-4 py-2.5 font-body card-text text-text-primary focus-visible:outline-2 focus-visible:outline-accent-pink"
          />
          <button
            type="submit"
            disabled={savingName}
            className="pixel-btn-solid px-4 py-2.5 font-body text-[12px] font-bold tracking-wide text-surface-bg disabled:opacity-50"
          >
            {savingName ? "SAVING…" : "SAVE"}
          </button>
          <button type="button" onClick={() => setRenaming(false)} className="card-meta text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <div className="basis-full">
            <Message state={renameState} />
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-text-primary">{team.name}</h2>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="card-meta text-text-muted underline-offset-4 hover:text-text-primary hover:underline"
          >
            Rename
          </button>
        </div>
      )}

      <ul className="mt-6 flex flex-col">
        {team.members.map((m, i) => (
          <li key={`${i}-${m.name}`} className="flex items-center gap-3.5 border-t border-text-primary/8 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-border-default card-meta font-bold">
              {initials(m.name)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="card-text font-bold text-text-primary">
                {m.name} {m.isYou && <span className="card-meta font-normal text-text-dim">(you)</span>}
              </span>
              <span className="card-meta text-text-muted">{m.discordUsername ? `@${m.discordUsername}` : "Discord handle not shared yet"}</span>
            </span>
          </li>
        ))}
        {Array.from({ length: Math.max(0, TEAM_MAX - team.members.length) }, (_, i) => (
          <li key={`open-${i}`} className="flex items-center gap-3.5 border-t border-dashed border-text-primary/10 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-dashed border-text-primary/20 card-meta text-text-dim">
              +
            </span>
            <span className="card-meta text-text-dim">Open spot. Share your invite code.</span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-4 border-t border-text-primary/8 pt-5">
        <div className="flex flex-col gap-1.5">
          <span className="card-label text-text-muted">INVITE CODE</span>
          {team.full ? (
            <span className="card-meta text-text-dim">Your team is full.</span>
          ) : (
            <CopyCode code={team.inviteCode} />
          )}
        </div>

        {confirmLeave ? (
          <form action={leave} className="flex flex-wrap items-center gap-3">
            <span className="card-meta text-text-secondary">
              {team.members.length === 1 ? "You're the last member, so the team will be deleted." : "Leave this team?"}
            </span>
            <button
              type="submit"
              disabled={leaving}
              className="pixel-btn-outline bg-surface-bg px-4 py-2.5 font-body text-[12px] font-bold tracking-wide text-terminal-red disabled:opacity-50"
            >
              {leaving ? "LEAVING…" : "YES, LEAVE"}
            </button>
            <button type="button" onClick={() => setConfirmLeave(false)} className="card-meta font-bold text-accent-teal hover:underline">
              Stay
            </button>
            <div className="basis-full">
              <Message state={leaveState} />
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            className="pixel-btn-outline bg-surface-bg px-4 py-2.5 font-body text-[12px] font-bold tracking-wide text-text-primary"
          >
            LEAVE TEAM
          </button>
        )}
      </div>
    </PixelCard>
  );
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <span className="select-all font-pixel text-[13px] tracking-widest text-accent-purple-light">{code}</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard refused: the code is select-all, so it can still be copied by hand.
          }
        }}
        className="pixel-btn-outline bg-surface-bg px-3 py-1.5 font-body text-[11px] font-bold tracking-wide text-text-primary"
      >
        {copied ? "COPIED ✓" : "COPY"}
      </button>
    </div>
  );
}

function Message({ state }: { state: TeamActionState }) {
  if (state.status !== "error") return null;
  return (
    <p role="alert" className="card-meta text-terminal-red">
      {state.message}
    </p>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => Array.from(part)[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
