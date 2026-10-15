import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isOrganizer } from "@/lib/organizer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toApplicantIdentity } from "@/lib/supabase/user";

/**
 * An applicant's resume, for an organizer (PLAT-30).
 *
 * Redirects to a short-lived signed URL rather than streaming the PDF through
 * the app: Supabase serves the bytes, so a page showing a resume inline costs
 * one redirect instead of pulling a 5MB file into a serverless function and
 * back out again.
 *
 * 60 seconds is long enough for the browser to follow the redirect and for the
 * PDF viewer to load, and short enough that a URL copied out of devtools or a
 * history entry is dead by the time anyone tries it. The page re-mints on every
 * load, so nothing user-visible depends on the lifetime.
 *
 * A 404 — not a 403 — for a non-organizer, matching requireOrganizer: the
 * response shouldn't confirm that an application by this id exists, or that
 * resumes live behind this path, to someone guessing at URLs. (requireOrganizer
 * itself isn't used here; it calls notFound(), which is for pages.)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const notFound = () => new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return notFound();

  const identity = toApplicantIdentity(user);
  if (!(await isOrganizer(identity.discordId))) return notFound();

  const { id } = await params;

  const application = await prisma.application.findUnique({
    where: { id },
    select: { person: { select: { resume: { select: { storageKey: true, fileName: true } } } } },
  });

  const resume = application?.person.resume;
  if (!resume) return notFound();

  // ?download=1 makes the browser save it instead of rendering it inline,
  // which is what the download link on the review page wants.
  const download = new URL(request.url).searchParams.get("download") === "1";

  // A missing service-role key is a deployment problem, not a request
  // problem, and this response is what renders inside the preview frame on
  // the review page — so it says what's wrong in words rather than throwing
  // a stack trace into an iframe.
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("[resume]", e);
    return new NextResponse(
      "Resumes aren't configured on this deployment: SUPABASE_SERVICE_ROLE_KEY is missing.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const { data, error } = await admin
    .storage.from("resumes")
    .createSignedUrl(resume.storageKey, 60, download ? { download: resume.fileName } : undefined);

  if (error || !data) {
    console.error("[resume]", id, error);
    return new NextResponse("Could not open that resume.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // The signed URL outlives this response by under a minute; caching the
  // redirect anywhere would hand out a link that's already expired.
  return NextResponse.redirect(data.signedUrl, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
