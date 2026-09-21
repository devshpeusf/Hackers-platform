import { render } from "@react-email/render";
import ConfirmationEmail from "@emails/ConfirmationEmail";

/**
 * Renders the confirmation email to HTML for viewing in a browser — no
 * Resend call, nothing sent. Dev-only: this shows the exact markup/design
 * that would otherwise only be visible inside an inbox, which isn't
 * something to leave reachable once this is deployed.
 *
 * http://localhost:3000/api/preview-email
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const html = await render(<ConfirmationEmail {...ConfirmationEmail.PreviewProps} />);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
