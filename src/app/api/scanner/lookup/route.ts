import { prisma } from "@/lib/prisma";
import { canEnterPortal } from "@/lib/portal-access";
import { getScannerAccess } from "@/lib/scanner-access";
import { getScannerEvent } from "@/lib/scanner-event";
import { getSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const BODY_LIMIT = 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function respond(body: { name: string } | { error: string }, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

type TokenBody = { token: string } | { status: 400 | 413 | 415 };

/** Bound bytes before decoding/parsing, including chunked bodies and false Content-Length. */
async function readToken(request: Request): Promise<TokenBody> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return { status: 415 };
  }
  if (!request.body) return { status: 400 };

  const reader = request.body.getReader();
  const bytes = new Uint8Array(BODY_LIMIT);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > BODY_LIMIT) {
        await reader.cancel();
        return { status: 413 };
      }
      bytes.set(value, length);
      length += value.byteLength;
    }

    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1) {
      return { status: 400 };
    }
    if (!("token" in body) || typeof body.token !== "string" || body.token.length !== 43 || !TOKEN_PATTERN.test(body.token)) {
      return { status: 400 };
    }
    return { token: body.token };
  } catch {
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}

/** Read-only staff lookup. A badge token never authenticates the caller. */
export async function POST(request: Request) {
  try {
    const access = await getScannerAccess();
    if (access === "UNAUTHENTICATED") return respond({ error: "UNAUTHORIZED" }, 401);
    if (access === "FORBIDDEN") return respond({ error: "FORBIDDEN" }, 403);
    if (access !== "ALLOWED") return respond({ error: "UNAVAILABLE" }, 503);

    // Browser POSTs must originate on our configured/proxied public origin.
    if (request.headers.get("origin") !== new URL(getSiteOrigin(request)).origin) {
      return respond({ error: "FORBIDDEN" }, 403);
    }

    const input = await readToken(request);
    if ("status" in input) return respond({ error: "BADGE_NOT_FOUND" }, input.status);

    const event = await getScannerEvent();
    if (!event) return respond({ error: "BADGE_NOT_FOUND" }, 404);

    const application = await prisma.application.findUnique({
      where: { badgeToken: input.token, eventId: event.id },
      select: {
        status: true,
        rsvpStatus: true,
        person: { select: { firstName: true, lastName: true } },
      },
    });
    if (!application || !canEnterPortal(application)) return respond({ error: "BADGE_NOT_FOUND" }, 404);

    return respond({ name: `${application.person.firstName} ${application.person.lastName}`.trim() }, 200);
  } catch {
    // Prisma errors can embed the supplied credential: no logging or serialization.
    return respond({ error: "UNAVAILABLE" }, 503);
  }
}
