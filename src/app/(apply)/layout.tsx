import type { ReactNode } from "react";

/**
 * Shell for the pre-acceptance application flow.
 *
 * Deliberately NOT the `(app)` group: CLAUDE.md calls this out — the
 * application form is pre-acceptance and must not render the hacker-portal
 * sidebar, since the applicant isn't a hacker yet. This layout is bare on
 * purpose; each screen owns its own full-bleed composition.
 */
export default function ApplyLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
