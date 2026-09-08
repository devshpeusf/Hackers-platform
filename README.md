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

## Database (Prisma + Supabase)

The app uses [Prisma 7](https://www.prisma.io/docs) against a shared Supabase
Postgres database. Prisma 7 has no schema-level connection URL — the CLI and
the app's runtime client are configured separately (see `prisma.config.ts` and
`src/lib/prisma.ts` if you want the details).

**1. Get the connection strings.** Ask a teammate for the two Supabase pooler
URLs, or grab them yourself from the Supabase dashboard under **Project
Settings → Database → Connection string** (transaction pooler = port `6543`
for `DATABASE_URL`, session pooler = port `5432` for `DIRECT_URL`).

If your database password contains special characters (`!`, `@`, `#`, `%`,
`/`, `:`, `?`, etc.), they must be percent-encoded in the URL (`!` → `%21`,
`@` → `%40`, and so on) — Supabase's dashboard connection strings already come
pre-encoded, so copying from there avoids this entirely.

**2. Create two env files with the same values** — yes, two; this is a real
gotcha, not a typo:

- **`.env.local`** — read by the Next.js app at runtime. Copy `.env.example`
  to `.env.local` and fill in `DATABASE_URL` / `DIRECT_URL`. Gitignored.
- **`.env`** — read by the Prisma CLI (`migrate`, `generate`, `studio`).
  Prisma 7's CLI does **not** read `.env.local` at all, only `.env`, so copy
  the exact same two lines into a `.env` file too. Also gitignored — never
  commit either file.

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
