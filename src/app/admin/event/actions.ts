"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { toApplicantIdentity } from "@/lib/supabase/user";
import { isOrganizer } from "@/lib/organizer";
import { parseGuideForm, parseLocationsForm } from "@/lib/event-guide";
import { parseScheduleForm } from "@/lib/event-schedule";
import { parseCheckpointKind, parseCheckpointName } from "@/lib/scan-rules";

export type SaveGuideState =
  | { status: "idle" }
  | { status: "saved"; at: string }
  | { status: "invalid"; errors: Record<string, string> }
  | { status: "denied" | "error" };

/**
 * Saves the hacker guide fields on the current event (/admin/event).
 *
 * A Server Action is a public endpoint, so the organizer check happens here,
 * not just on the page. Which event is edited is decided server-side (the
 * most recent, same as the rest of /admin) — nothing in the form picks it.
 */
export async function saveEventGuide(_previous: SaveGuideState, formData: FormData): Promise<SaveGuideState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isOrganizer(toApplicantIdentity(user).discordId))) return { status: "denied" };

  const parsed = parseGuideForm(formData);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };

  try {
    const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" }, select: { id: true } });
    if (!event) return { status: "error" };

    await prisma.event.update({ where: { id: event.id }, data: parsed.data });
  } catch {
    return { status: "error" };
  }

  // Everywhere the guide shows up.
  revalidatePath("/guide");
  revalidatePath("/dashboard");
  revalidatePath("/admin/event");
  return { status: "saved", at: new Date().toISOString() };
}

export type SaveScheduleState =
  | { status: "idle" }
  | { status: "saved"; count: number }
  | { status: "invalid"; error: string }
  | { status: "denied" | "error" };

/**
 * Saves the run of show on the current event (/admin/event). Same rules as
 * the guide: organizer re-checked here, event chosen server-side. Replaces
 * the whole list, in the order submitted.
 */
export async function saveEventSchedule(_previous: SaveScheduleState, formData: FormData): Promise<SaveScheduleState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isOrganizer(toApplicantIdentity(user).discordId))) return { status: "denied" };

  const parsed = parseScheduleForm(formData);
  if (!parsed.ok) return { status: "invalid", error: parsed.error };

  try {
    const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" }, select: { id: true } });
    if (!event) return { status: "error" };
    await prisma.event.update({ where: { id: event.id }, data: { schedule: parsed.rows } });
  } catch {
    return { status: "error" };
  }

  revalidatePath("/schedule");
  revalidatePath("/admin/event");
  return { status: "saved", count: parsed.rows.length };
}

export type SaveLocationsState =
  | { status: "idle" }
  | { status: "saved"; count: number }
  | { status: "invalid"; error: string }
  | { status: "denied" | "error" };

/**
 * Saves the locations list on the current event (/admin/event). Same rules as
 * the guide and schedule: organizer re-checked here, event chosen server-side.
 */
export async function saveEventLocations(_previous: SaveLocationsState, formData: FormData): Promise<SaveLocationsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isOrganizer(toApplicantIdentity(user).discordId))) return { status: "denied" };

  const parsed = parseLocationsForm(formData);
  if (!parsed.ok) return { status: "invalid", error: parsed.error };

  try {
    const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" }, select: { id: true } });
    if (!event) return { status: "error" };
    await prisma.event.update({ where: { id: event.id }, data: { locations: parsed.rows } });
  } catch {
    return { status: "error" };
  }

  revalidatePath("/guide");
  revalidatePath("/dashboard");
  revalidatePath("/admin/event");
  return { status: "saved", count: parsed.rows.length };
}

/**
 * Meals and workshops the scanner can scan for (/admin/check-in). Organizer
 * re-checked on each call, event chosen server-side, like the rest of this
 * file. Plain form actions: the page reloads with the change.
 */
async function organizerEventId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isOrganizer(toApplicantIdentity(user).discordId))) return null;
  const event = await prisma.event.findFirst({ orderBy: { startDate: "desc" }, select: { id: true } });
  return event?.id ?? null;
}

export async function addCheckpoint(formData: FormData): Promise<void> {
  const eventId = await organizerEventId();
  const name = parseCheckpointName(formData.get("name"));
  const kind = parseCheckpointKind(formData.get("kind"));
  if (!eventId || !name || !kind) return;
  await prisma.checkpoint.create({ data: { eventId, name, kind } });
  revalidatePath("/admin/event");
  revalidatePath("/admin/check-in");
}

export async function renameCheckpoint(formData: FormData): Promise<void> {
  const eventId = await organizerEventId();
  const id = formData.get("id");
  const name = parseCheckpointName(formData.get("name"));
  if (!eventId || typeof id !== "string" || !name) return;
  // Scoped to the current event, so an id from elsewhere changes nothing.
  await prisma.checkpoint.updateMany({ where: { id, eventId }, data: { name } });
  revalidatePath("/admin/event");
  revalidatePath("/admin/check-in");
}

/** Only while nobody has been scanned for it, so counts never vanish. */
export async function deleteCheckpoint(formData: FormData): Promise<void> {
  const eventId = await organizerEventId();
  const id = formData.get("id");
  if (!eventId || typeof id !== "string") return;
  await prisma.checkpoint.deleteMany({ where: { id, eventId, scans: { none: {} } } });
  revalidatePath("/admin/event");
  revalidatePath("/admin/check-in");
}
