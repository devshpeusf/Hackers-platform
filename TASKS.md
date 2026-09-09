# TASKS.md

Everything still to build, grouped roughly in the order it'll likely need to
happen. See CLAUDE.md for the design system and conventions.

## How this file relates to Jira

Work is tracked in the **`PLAT` project**. This file is the narrative version —
it carries the *reasoning* (why something is blocked, what's undecided, what a
ticket title leaves out) that a one-line summary can't. The board owns status;
this file owns context.

Items are annotated `[PLAT-N]` or `[no ticket]`.

Last synced **2026-09-09**, against merged PRs and the team chat rather than the
board directly.

## Decisions made (don't re-litigate)

- **Auth is Discord OAuth**, and applicants sign in *before* applying. This
  closes the old "confirm Auth.js is the intended provider" question — the
  answer is likely no: Supabase Auth ships a Discord provider, so Auth.js is
  probably an unnecessary dependency.
- **Supabase** is the platform: Postgres via Prisma today, with Auth and
  Storage available for PLAT-12 and PLAT-20/21.
- **Prisma 7 with a driver adapter.** There is no `url` in `schema.prisma` —
  the CLI reads `prisma.config.ts`, the app reads `src/lib/prisma.ts`. A
  Prisma 6 CLI will fail with P1012 against this setup.
- **Manual school entry is allowed and flagged**, overriding PLAT-15's original
  "no typing whatever they want". MLH's list has gaps, and a forced pick
  produces either a wrong school or an abandoned application — both invisible.
- **The plain start screen won.** Planet, terminal and arcade-cabinet variants
  are parked on page 2 of the design canvas. Revisit once it's live.
- **Workflow**: branch → PR → self-review → merge. Peer review isn't required.

## Done

- [x] Project scaffolding `[PLAT-7]`
- [x] MLH school list imported — 13,103 schools, refresh script `[PLAT-14]` #1
- [x] Application flow design canvas `[PLAT-35]` #2
- [x] Postgres + Prisma + Supabase connection `[PLAT-8]` #3
- [x] Site deploying `[PLAT-10]`
- [x] School picker: `/api/schools` + typeahead, manual entry flagged `[PLAT-15]` #5

## In flight

- [ ] **Set up tables in the DB** `[PLAT-9]` — Juan. `schema.prisma` currently
      holds only a `Ping` model. Nearly everything below waits on this.
      **The school field needs two columns**: the name, and a
      `catalog`/`manual` source flag. The frontend already tracks it; adding
      the flag later means backfilling guesses.
- [ ] **Build login** `[PLAT-12]` — in progress. See Phase 2.

## Not yet designed

- **The organizer dashboard.** `[build tickets PLAT-28/29/30, no design ticket]`
  Needed for reviewing applications and managing check-in.
- **The sponsor resume portal.** `[no ticket]` PLAT-30 is *organizers* opening
  resumes — a different surface with different access control.
- **QR check-in scanning** (the organizer side). `[no ticket]`
- **Multi-event UI.** `[no ticket]` Everything assumes one hardcoded event.

## Phase 1 — Data layer

- [x] Postgres + Prisma, initial migration `[PLAT-8]`
- [ ] The actual schema: events, applications, hackers, teams, waivers, meal
      preferences, check-ins `[PLAT-9]`
- [ ] Seed script for fake testing data `[PLAT-13]`
- [ ] Transactional email `[PLAT-11]` — the ticket itself says research is
      needed, and DNS records make it an unbounded wait. Blocks PLAT-23 and
      PLAT-26, so start it before they're urgent.
- [ ] Delete `lib/placeholder-data.ts` once real data lands. It was written to
      make the mapping obvious — use it as the checklist. `[no ticket]`

## Phase 2 — Auth

- [ ] **Discord OAuth login** `[PLAT-12]`
      - Create the Discord application, put its client ID/secret into the
        Supabase dashboard. **Dashboard work in Tommy's project, not code** —
        line this up early, it's the likeliest blocker.
      - `@supabase/supabase-js` + `@supabase/ssr`, with browser/server/
        middleware clients and a root middleware that refreshes the session.
      - Discord OAuth **returns no usable email**. Knight Hacks store a
        synthetic `<discordId>@blade.org` placeholder and ask for a real email
        in the form; ours does the same on step 1.
      - Scope Supabase to auth and storage. Application data stays on Prisma so
        `schema.prisma` remains the single source of truth.
- [ ] Protected routes for the `(apply)` and `(app)` groups `[no ticket]`
- [ ] Roles — how organizers differ from hackers `[PLAT-27]`

## Phase 3 — Application flow

The screens exist and are clickable at `/apply` and `/apply/form`, but they are
**cosmetic**: nothing authenticates, validates or submits. Inputs are
uncontrolled so typing feels real; nothing reads them.

- [x] School list + picker `[PLAT-14, PLAT-15]`
- [ ] Form layout `[PLAT-16]`, questions `[PLAT-17]`, short answers and consent
      `[PLAT-18]` — the *design* of all three is built; what's missing is real
      state, validation and submission.
- [ ] Validate answers `[PLAT-19]` — no validation exists at all.
- [ ] File storage `[PLAT-20]` and resume upload `[PLAT-21]` — Supabase Storage
      is the obvious fit now, rather than standing up R2 separately.
- [ ] Save the application `[PLAT-22]` — blocked on PLAT-9.
- [ ] Confirmation email `[PLAT-23]` — blocked on PLAT-11.
- [ ] "You're done" page `[PLAT-24]` — designed and built cosmetically.
- [ ] Handle someone who already applied `[PLAT-25]` — a uniqueness check on
      (Discord user, event) once auth and tables exist.
- [ ] Application states: submitted / under review / accepted / rejected /
      waitlisted, and what each looks like to the applicant `[no ticket]`
- [ ] **Real copy for the two short-answer questions** — currently Knight
      Hacks' wording, marked `[PLACEHOLDER]` in the UI. A content decision.

## Phase 4 — Wire the six portal pages to real data

**No tickets exist for any of this.** Dashboard, Profile, Team, Guide, Schedule
and Help all still render from `placeholder-data.ts`. Replace `[DATE]`,
`[VENUE]`, `[WIFI-NAME]`, `[T0]`…`[T8]` and wire the Profile save and Help
submit.

## Phase 5 — QR badge check-in

**No tickets exist.** `QrPlaceholder` encodes nothing; the organizer-side
scanner isn't designed.

## Phase 6 — Organizer dashboard + sponsor portal

- [ ] Design pass first `[no ticket]`
- [ ] Application list `[PLAT-28]`, open resumes `[PLAT-30]`, spreadsheet
      export `[PLAT-29]`
- [ ] Accept/reject/waitlist actions `[no ticket]` — PLAT-28 lists
      applications; nothing files the *decisions*.
- [ ] Sponsor-facing resume access `[no ticket]`

## Phase 7 — Testing & launch readiness

- [x] Site deploying `[PLAT-10]`
- [ ] Testing strategy — still none `[no ticket]`
- [ ] Fill with 50 applications `[PLAT-31]`, test on phones `[PLAT-32]`, check
      emails arrive `[PLAT-33]`

## Content & compliance

- [ ] Privacy page `[PLAT-34]` (labelled `maybe`)
- [ ] MLH registration reminder a week out `[PLAT-26]` — blocked on PLAT-11.
      Note this is a reminder to register *elsewhere*: MLH registration lives
      in OrganizerHQ and this app never owns it.

## Smaller loose ends

- [ ] **A fresh clone doesn't build.** It needs a local `.env` *and*
      `npx prisma generate` — `prisma.config.ts` reads `DIRECT_URL` and
      `src/lib/prisma.ts` imports the generated client. Vercel has the env
      vars so the deploy is fine; nobody cloning gets a working build. Two
      lines in the README would fix it. `[no ticket]`
- [ ] The dashboard waiver checklist toggles local state with no persistence.
- [ ] Dashboard hardcodes `YOU'RE ACCEPTED / TO HACKJAM '26` and
      `NOT FORMED · FIND TEAMMATES` in JSX instead of `placeholder-data.ts`.
- [ ] Confirm the mobile sidebar breakpoint with real organizers `[PLAT-32]`
- [ ] **Board hygiene:** PLAT-4 and PLAT-5 are Jira's default sample subtasks.
      Delete them.
