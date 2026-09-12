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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
