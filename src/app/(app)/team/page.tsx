"use client";

import { useState } from "react";
import PageHeading from "@/components/ui/PageHeading";
import PixelCard from "@/components/ui/PixelCard";
import PixelChip from "@/components/ui/PixelChip";
import PixelButton from "@/components/ui/PixelButton";
import { team } from "@/lib/placeholder-data";

export default function TeamPage() {
  // The brief asks for both states visible via a local toggle (no
  // persistence) so both can be reviewed — this mirrors the mockup's
  // own hasTeam/noTeam local state rather than any real membership.
  const [hasTeam, setHasTeam] = useState(false);

  return (
    <div>
      <PageHeading title="TEAM" />

      {!hasTeam ? (
        <PixelCard className="max-w-[560px] p-9 text-center">
          <div className="mb-2.5 text-sm font-bold">You haven&apos;t joined a team yet.</div>
          <div className="mb-6.5 text-xs leading-[1.7] text-text-muted">{team.noTeamCopy}</div>
          <div className="flex justify-center gap-3.5">
            <PixelButton className="px-[22px] py-3 text-[11px]" onClick={() => setHasTeam(true)}>
              CREATE A TEAM
            </PixelButton>
            <PixelButton variant="outline" className="px-[22px] py-3 text-[11px]">
              JOIN WITH CODE
            </PixelButton>
          </div>
        </PixelCard>
      ) : (
        <PixelCard borderColor="var(--color-accent-purple)" className="max-w-[560px] p-8">
          <span className="font-pixel text-[9px] tracking-widest text-accent-purple-light">// YOUR TEAM</span>
          <div className="mt-3.5 mb-5 text-lg font-bold">{team.name}</div>
          {team.members.map((member) => (
            <div
              key={member.name}
              className="flex items-center gap-3 border-t border-text-primary/8 py-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-border-default text-xs font-bold">
                {member.initials}
              </div>
              <div className="text-[13px]">
                {member.name} {member.isYou && <span className="text-xs text-text-dim">(you)</span>}
              </div>
            </div>
          ))}
          <div className="mt-5 flex items-center justify-between border-t border-text-primary/8 pt-5">
            <PixelChip color="var(--color-accent-purple)" textColor="var(--color-accent-purple-light)">
              INVITE {team.inviteCode}
            </PixelChip>
            <PixelButton variant="outline" className="px-4 py-[9px] text-[10px]" onClick={() => setHasTeam(false)}>
              LEAVE TEAM
            </PixelButton>
          </div>
        </PixelCard>
      )}
    </div>
  );
}
