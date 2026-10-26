This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

This project uses npm (not yarn/pnpm/bun — see CLAUDE.md).

Install dependencies, then run the development server:

```bash
npm i
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result — it redirects to `/dashboard`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to load Press Start 2P and Space Mono (see `src/app/layout.tsx`).

See `CLAUDE.md` for the design system, folder layout, and conventions, and `TASKS.md` for what's still to build.

## Database (Prisma + Supabase) & Auth (Supabase)

The app uses [Prisma 7](https://www.prisma.io/docs) against a shared Supabase
Postgres database, and Supabase Auth for sign-in. Prisma 7 has no
schema-level connection URL — the CLI and the app's runtime client are
configured separately (see `prisma.config.ts` and `src/lib/prisma.ts` if you
want the details).

**1. Create your env file.** Copy `.env.example` to `.env` and fill in real
values — one file covers both the Next.js app and the Prisma CLI (Prisma 7's
CLI only reads `.env`, and Next.js reads it too, so there's no need for a
separate `.env.local`). Gitignored, never commit it.

**2. Get the connection strings and Supabase keys.** Ask a teammate, or grab
them yourself from the Supabase dashboard:

- `DATABASE_URL` / `DIRECT_URL` — **Project Settings → Database → Connection
  string** (transaction pooler = port `6543` for `DATABASE_URL`, session
  pooler = port `5432` for `DIRECT_URL`).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` —
  **Project Settings → API**.

If your database password contains special characters (`!`, `@`, `#`, `%`,
`/`, `:`, `?`, etc.), they must be percent-encoded in the URL (`!` → `%21`,
`@` → `%40`, and so on) — Supabase's dashboard connection strings already come
pre-encoded, so copying from there avoids this entirely.

**3. Generate the client and apply migrations:**

```bash
npx prisma generate
npx prisma migrate dev
```

`prisma generate` writes the typed client to `src/generated/prisma` (also
gitignored — every teammate generates their own copy, it's never committed).
`prisma migrate dev` applies any migrations already in `prisma/migrations/`
that aren't in your database yet.

## Acceptance email RSVP links

`RSVP_URL` is a trusted base URL such as `https://apply.hackjam26.com/rsvp`,
with no applicant credential, query string, fragment, or username/password.
Trailing slashes are normalized. HTTPS is required except for loopback HTTP
development URLs such as `http://localhost:3000/rsvp`. The worker does not
derive email links from request headers. No environment files are changed by
this integration; configure the base in the deployment environment.

Only a claimed ACCEPTED email send issues a credential. Its SHA-256 hash is
committed before sending, and the template receives the final `/rsvp/<token>`
URL. Queueing decisions and rendering previews never issue credentials.
Previews use an intentionally nonfunctional `example.invalid` URL.

Retries issue fresh credentials without invalidating earlier links, since a
provider/network failure may follow successful delivery. Rate/quota responses
are only known after the provider call; that attempt's token remains stored,
and the existing queue retry policy leaves its attempt counter unchanged.
Other failures retain the existing three-failure retry limit.

The worker rechecks ACCEPTED before issuance and immediately before dispatch.
A stale or missing application moves its acceptance queue row to FAILED for
organizer review, without incrementing attempts or marking it sent. The
existing RETRY action can retry it after its decision is reviewed. No network
request runs inside the token transaction. An explicit organizer override
after dispatch begins cannot recall an email already handed to the provider;
the RSVP resolver still checks the application's current admission status.

Withdrawing acceptance revokes active RSVP credentials in the same transaction
as the decision, for both individual and bulk changes. An unsent PENDING
acceptance email is parked in FAILED for review. The previous RSVP response
and timestamp remain until a non-ACCEPTED application becomes ACCEPTED again;
that transition resets them to PENDING and null. An ACCEPTED-to-ACCEPTED no-op
does not reset the response. There is no separate archive of prior responses.

After re-acceptance, an organizer can explicitly queue a new RSVP invitation
from the application detail page, reusing its existing acceptance email row.
The decision itself does not queue a new email. Old links remain revoked,
and the worker checks the acceptance cycle and token again before dispatch.

Organizer RSVP counts cover only the latest event's accepted offers. Pending,
confirmed, and declined are subsets of that total. Portal access requires
ACCEPTED with PENDING or CONFIRMED attendance; declined applicants go to their
own application status page.

## Badge credentials (PLAT-51)

Individual and bulk acceptance issue a badge in the same transaction as the
decision, using 32 cryptographically random bytes encoded as base64url. The
existing unique database constraint remains authoritative. An issuance failure
rolls back the decision (the entire batch for bulk acceptance).

Each application's badge survives withdrawal and re-acceptance. RSVP credentials
remain separate. The authenticated owner's dashboard only reads the issued
badge and renders its QR; it never creates a token. A missing badge shows a
message to contact an organizer. There is no public badge lookup or scanner
cached-list delivery.

Before deploying this lifecycle to an existing database, count ACCEPTED rows
with null badgeToken in a read-only query. Any missing credentials require a
separately approved backfill; dashboard visits do not repair them.

## Scanner authorization and lookup (PLAT-52 Phase 2)

`/scanner` is a staff-only page, outside the hacker portal. Discord
sign-in returns scanner staff to `/scanner`; ordinary applicant sign-in still
lands at `/apply/form`. OAuth return paths are limited to those two destinations.

`POST /api/scanner/lookup` independently verifies the session and the current
Person role on every request. Only VOLUNTEER and ORGANIZER can use it; no hacker
application is required for staff access. Send same-origin JSON `{ "token": "..." }`
with no extra fields. The body is limited to 1024 bytes and tokens must be exactly
43 base64url characters. The token belongs only in the POST body, never a URL.

Lookup scope is the latest event by start date, matching `/admin`; that policy
lives in `src/lib/scanner-event.ts`. Eligible badges are ACCEPTED with PENDING
or CONFIRMED RSVP. Success returns exactly `{ "name": "First Last" }`. Unknown,
older-event and ineligible badges all return 404 with `BADGE_NOT_FOUND`. Invalid
input uses the same generic message with 400 (format/JSON), 413 (body limit), or
415 (content type). Auth failures use 401/403; internal failures use a sanitized
503. All lookup responses are private and no-store.

Lookup only reads existing data: no scan records or schema changes. Scanner and
OAuth tests use mocked Auth/Prisma:
`node --test tests/scanner.test.cjs tests/auth-return.test.cjs`.

## Camera scanning (PLAT-52 Phase 3)

Press START CAMERA to request video only, preferring the rear camera. Native
BarcodeDetector is used only when it advertises QR support; otherwise the lazy
`barcode-detector@3.2.3` ponyfill uses the same camera and decode loop. Native
initialization/detection failures also switch to the fallback. The WASM reader
is served from our own `/scanner-assets/` directory, never a runtime CDN.
Dev/build/postinstall prepare the exact dependency's binary and verify its
upstream SHA-256. Source/version/license details are in
`public/scanner-assets/README.md`; no additional manual asset download is needed.

Scanning runs at up to five attempts per second, with no overlapping decodes.
Each result pauses scanning. SCAN NEXT waits one second before rearming, then
suppresses the immediately previous badge until a different badge is shown or
the previous one has been absent for 600 ms. Network failures offer TRY AGAIN;
invalid badges share the generic BADGE NOT FOUND message. Only the attendee's
name is shown on success. Tokens exist only in transient session memory and
the lookup POST body; camera frames stay on-device.

STOP CAMERA, leaving the page, or hiding the tab stops every stream track,
cancels timers/lookup, and discards stale async results. Returning to the page
requires START CAMERA again. Camera denial, missing/busy devices and decoder
load failures provide explicit retry controls without automatic permission loops.

Real-phone testing requires HTTPS. Desktop localhost is a secure development
context; opening `http://192.168.x.x:3000` from a phone generally is not. Use an
HTTPS development endpoint/certificate and test both iOS Safari and Android
Chrome. No insecure-browser bypass, service worker, offline cache, scan history,
or check-in write is included.

`node --test tests/*.test.cjs` includes deterministic camera/timing tests, actual
rounded-badge decoding through the WASM reader, and a local headless Edge video
test when Edge and Node's WebSocket API are available (otherwise it is skipped).
Browser tests use generated video and a fake lookup server, never a physical
camera or shared applicant data. Real iOS/Android camera testing is still required.

## Scanner installation (PLAT-52 Phase 4)

Open the deployed HTTPS `/scanner` link, sign in, and use the browser's native
Add to Home Screen / Install app menu. The page includes collapsed instructions
for iPhone and Android. Installation guidance hides in standalone display mode.
The scanner manifest, Apple metadata and title are scoped to `/scanner`; the
hacker portal keeps its existing metadata and launch behavior. The installed
app launches `/scanner`, even if a fresh sign-in is needed first.

`public/scanner.webmanifest` specifies a stable `/scanner` ID, start URL and scope,
standalone display, 192/512 normal and maskable icons, and the existing dark theme.
The icons derive from the approved HackJam mascot; regenerate them with
`node scripts/generate-scanner-icons.mjs`. Commit the PNGs and their source script.
The manifest/icons and generated decoder are public static assets; staff page and
lookup authorization remain independent. No service worker or offline data is used.

After `npm run build`, opt into built-server checks in PowerShell:
`$env:SCANNER_RUNTIME_TEST='1'; node --test tests/scanner-runtime.test.cjs`.
This tests static asset delivery, actual Next.js scanner metadata, anonymous page
and lookup denial, and the OAuth/PKCE return destination without contacting Discord
or exchanging a real session. Runtime checks use dummy database connection URLs.

Real-phone QA (use existing authorized badges; do not edit applicant records):

- iPhone Safari: sign in as staff, allow camera, verify a real dashboard QR/name
  and an unrelated QR/error; add to Home Screen, launch, and repeat sign-in/camera.
- Android Chrome: repeat access/scanning and native/fallback checks, install from
  the browser menu, verify standalone launch at `/scanner`, then stop/background
  the app and confirm the camera indicator turns off.
- Confirm an applicant is denied. Disconnect the network and confirm scanning
  reports unable to verify; reconnect and retry. No badge is accepted offline.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
