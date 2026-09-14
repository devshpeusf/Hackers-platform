import type { SupabaseClient } from "@supabase/supabase-js";

export type UploadResumeResult =
  | { ok: true; storageKey: string; fileName: string }
  | { ok: false; error: string };

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Client-side pre-check before even attempting an upload — instant feedback
 * instead of a round trip just to get bounced by the bucket's own limits.
 * The bucket (application/pdf, 5MB) is still the real enforcement; this is
 * purely a UX nicety, so it's fine for the two to describe the same rule.
 */
export function validateResumeFile(file: File): string | null {
  if (file.type !== "application/pdf") return "Resume must be a PDF";
  if (file.size > RESUME_MAX_BYTES) return "Resume must be under 5MB";
  return null;
}

/**
 * Uploads a resume to the `resumes` bucket under the caller's own folder.
 *
 * File type and size are enforced by the bucket itself (application/pdf,
 * 5MB) — not re-checked here, since duplicating a check the bucket already
 * guarantees just adds a second place for the two rules to drift apart.
 */
export async function uploadResume(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<UploadResumeResult> {
  const storageKey = `${userId}/${crypto.randomUUID()}-${file.name}`;

  const { error } = await supabase.storage.from("resumes").upload(storageKey, file);

  if (error) {
    console.error("[uploadResume]", error);
    return { ok: false, error: error.message };
  }

  return { ok: true, storageKey, fileName: file.name };
}
