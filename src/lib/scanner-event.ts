import "server-only";

import { prisma } from "@/lib/prisma";

/** Scanner scope matches /admin: latest start date, even after the event ends. */
export async function getScannerEvent() {
  return prisma.event.findFirst({
    orderBy: { startDate: "desc" },
    select: { id: true },
  });
}
