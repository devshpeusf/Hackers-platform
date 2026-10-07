import type { NextRequest } from "next/server";
import type { ReactElement } from "react";
import { render } from "@react-email/render";
import ConfirmationEmail from "@emails/ConfirmationEmail";
import AcceptedEmail from "@emails/AcceptedEmail";
import WaitlistedEmail from "@emails/WaitlistedEmail";
import RejectedEmail from "@emails/RejectedEmail";

/**
 * Renders an email to HTML for viewing in a browser — no Resend call,
 * nothing sent. Dev-only: this shows the exact markup/design that would
 * otherwise only be visible inside an inbox, which isn't something to leave
 * reachable once this is deployed.
 *
 *   http://localhost:3000/api/preview-email                    (confirmation)
 *   http://localhost:3000/api/preview-email?type=accepted
 *   http://localhost:3000/api/preview-email?type=waitlisted
 *   http://localhost:3000/api/preview-email?type=rejected
 */
const PREVIEWS: Record<string, () => ReactElement> = {
  confirmation: () => <ConfirmationEmail {...ConfirmationEmail.PreviewProps} />,
  accepted: () => <AcceptedEmail {...AcceptedEmail.PreviewProps} />,
  waitlisted: () => <WaitlistedEmail {...WaitlistedEmail.PreviewProps} />,
  rejected: () => <RejectedEmail {...RejectedEmail.PreviewProps} />,
};

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const type = request.nextUrl.searchParams.get("type") ?? "confirmation";
  const preview = PREVIEWS[type];
  if (!preview) {
    return new Response(`Unknown email type. Try: ${Object.keys(PREVIEWS).join(", ")}`, { status: 404 });
  }

  const html = await render(preview());
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
