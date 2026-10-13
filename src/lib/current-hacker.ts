import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";

// Extend this list when a future ticket adds another admitted status.
const ADMITTED_STATUSES: readonly string[] = ["ACCEPTED"];

/** Request-local lookup. No caller-supplied IDs and no cross-user cache. */
export const getCurrentHacker = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/apply?signin=required");

  // user_metadata is editable: use the Auth-managed provider identity for
  // ownership, and the existing metadata helper only for display text.
  const discord = user.identities?.find((identity) => identity.provider === "discord");
  const discordId: unknown = discord?.identity_data?.sub;
  if (typeof discordId !== "string" || !discordId.trim()) {
    redirect("/apply?signin=required");
  }

  const person = await prisma.person.findUnique({
    where: { discordId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phoneNum: true,
    },
  });
  if (!person) redirect("/apply/form");

  // Match the existing status page's latest-application convention.
  const application = await prisma.application.findFirst({
    where: { personId: person.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      status: true,
      school: true,
      major: true,
      graduation: true,
      shirtSize: true,
      gender: true,
      diet: true,
    },
  });
  if (!application) redirect("/apply/form");
  if (!ADMITTED_STATUSES.includes(application.status)) redirect("/apply/status");

  return {
    person: {
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      phoneNum: person.phoneNum,
    },
    application,
    fullName: `${person.firstName} ${person.lastName}`.trim(),
    username: toApplicantIdentity(user).username,
  };
});
