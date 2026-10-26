import "server-only";

import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { canEnterPortal } from "@/lib/portal-access";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The check-in badge: a random opaque token per admitted hacker, rendered as
 * a QR code on their own dashboard.
 *
 * Own badge only. Nothing here takes a token or an id from a request: the
 * dashboard calls getBadgeSvg() with the application id it resolved from the
 * signed-in session (getCurrentHacker), and only the finished SVG reaches the
 * browser. There is no route that renders a badge for an arbitrary token, so
 * there is nothing to swap to load someone else's.
 */

/** 32 random bytes, base64url: 43 characters, nothing derived from who they are. */
function newToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Issue a badge inside the decision transaction, after changing admission to
 * ACCEPTED. The caller must already hold the application's row lock. Reuse
 * any existing credential, including one from a previous acceptance cycle.
 *
 * A uniqueness or assignment failure aborts the whole decision transaction.
 * No retry is needed for 256-bit randomness; never swallow the failure or
 * include Prisma's potentially credential-bearing error in logs/errors.
 */
export async function ensureBadgeToken(applicationId: string, tx: Prisma.TransactionClient): Promise<void> {
  try {
    const application = await tx.application.findUnique({
      where: { id: applicationId },
      select: { status: true, badgeToken: true },
    });
    if (!application || application.status !== "ACCEPTED") throw new Error("Badge unavailable");
    if (application.badgeToken) return;

    const updated = await tx.application.updateMany({
      where: { id: applicationId, status: "ACCEPTED", badgeToken: null },
      data: { badgeToken: newToken() },
    });
    if (updated.count !== 1) throw new Error("Badge was not saved");
  } catch {
    throw new Error("Badge issuance failed. Acceptance was not saved.");
  }
}

/** The theme's deep navy — dark enough against white for any scanner (~19:1). */
const INK = "#120f1f";
const PAPER = "#ffffff";
/** Blank border, in modules. Scanners need it to find the code's edges. */
const QUIET = 4;

/**
 * The badge as an inline SVG string, drawn by hand from the QR matrix rather
 * than with the library's square-block renderer, for softer edges and
 * rounded corner markers.
 *
 * Neighbouring dark modules are drawn joined, and only corners with nothing
 * beside them are rounded. Scanners read a QR by measuring runs of dark and
 * light, so separate rounded dots (tried first) broke those runs into dotted
 * lines and failed to decode; joined shapes keep every run solid.
 *
 * Stays dark-on-light: many phone cameras fail on an inverted code even
 * though it would match the dark theme better.
 */
export async function getBadgeSvg(applicationId: string): Promise<string | null> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { status: true, rsvpStatus: true, badgeToken: true },
  });
  if (!application || !canEnterPortal(application)) throw new Error("Badge unavailable");
  // Missing issuance shows an organizer-contact message, never a dashboard write.
  return application.badgeToken ? renderBadgeSvg(application.badgeToken) : null;
}

export function renderBadgeSvg(token: string): string {
  const { modules } = QRCode.create(token, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const full = n + QUIET * 2;
  const dark = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && Boolean(modules.get(r, c));

  // The three 7x7 corner markers get their own rounded shapes below.
  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  // A corner is rounded only when neither module touching that corner's two
  // sides is dark — so joined runs stay square where they meet.
  const R = 0.45;
  const cells: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark(r, c) || inFinder(r, c)) continue;
      const up = dark(r - 1, c);
      const down = dark(r + 1, c);
      const left = dark(r, c - 1);
      const right = dark(r, c + 1);
      cells.push(
        roundedCell(c + QUIET, r + QUIET, [
          !up && !left ? R : 0,
          !up && !right ? R : 0,
          !down && !right ? R : 0,
          !down && !left ? R : 0,
        ]),
      );
    }
  }

  const finder = (row: number, col: number) => {
    const x = col + QUIET;
    const y = row + QUIET;
    // Outer ring drawn as one path with an even-odd hole, so the gap between
    // ring and centre is real white rather than white paint over ink.
    return (
      `<path fill-rule="evenodd" d="${roundedRect(x, y, 7, 7, 1.8)} ${roundedRect(x + 1, y + 1, 5, 5, 1.1)}"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.8"/>`
    );
  };

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="geometricPrecision">` +
    `<rect width="${full}" height="${full}" fill="${PAPER}"/>` +
    `<g fill="${INK}">${finder(0, 0)}${finder(0, n - 7)}${finder(n - 7, 0)}` +
    `<path d="${cells.join("")}"/></g>` +
    `</svg>`
  );
}

/** One 1x1 module as a closed subpath, each corner [tl, tr, br, bl] rounded or square. */
function roundedCell(x: number, y: number, [tl, tr, br, bl]: number[]) {
  return (
    `M${x + tl} ${y}H${x + 1 - tr}` +
    (tr ? `A${tr} ${tr} 0 0 1 ${x + 1} ${y + tr}` : "") +
    `V${y + 1 - br}` +
    (br ? `A${br} ${br} 0 0 1 ${x + 1 - br} ${y + 1}` : "") +
    `H${x + bl}` +
    (bl ? `A${bl} ${bl} 0 0 1 ${x} ${y + 1 - bl}` : "") +
    `V${y + tl}` +
    (tl ? `A${tl} ${tl} 0 0 1 ${x + tl} ${y}` : "") +
    "Z"
  );
}

/** A closed rounded-rectangle subpath. */
function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
    `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}
