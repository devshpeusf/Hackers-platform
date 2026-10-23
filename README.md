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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
