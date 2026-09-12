import type { SupabaseClient } from "@supabase/supabase-js";

export type UploadResumeResult =
  | { ok: true; storageKey: string; fileName: string }
  | { ok: false; error: string };

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
