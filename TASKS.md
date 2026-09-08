# TASKS.md

Everything still to build, grouped roughly in the order it'll likely
need to happen. See CLAUDE.md for what *is* here (scaffold, theme, six
static pages).

## How this file relates to Jira

Work is tracked in the **`PLAT` project** in Jira. This file is the
narrative version — it carries the *reasoning* (why something is
blocked, what's undecided, what a ticket's one-line summary leaves out)
that a ticket title can't. The board is the source of truth for status;
this file is the source of truth for context.

Every item below is annotated:

- `[PLAT-N]` — a ticket exists for this
- `[no ticket]` — real work, nothing filed yet

As of the last sync (2026-09-08): **31 tickets, 1 done, 30 open**, all
sitting in `To Do`. Only PLAT-9 has an assignee. Nothing is in progress.

**The board and this file cover different halves of the product.**
Almost every ticket is about the *pre-acceptance* application flow plus
organizer review. The six pages that actually exist are the
*post-acceptance* hacker portal. Phases 4 and 5 below, and the sponsor
portal in Phase 6, have no ticket coverage at all — that's a real gap,
not an oversight in the annotation.

## Done

- [x] **Initialize project scaffolding** `[PLAT-7]` — commit `92f706c`.
      Next.js + Tailwind design system, six static UI pages.

## Not yet designed

- **The application form.** `[PLAT-35 — "create design for application
  page"]` This mockup only covers the *post-acceptance* hacker
  experience (dashboard, profile, team, guide, schedule, help). There is
  no mockup yet for: the public application/registration flow, what
  fields it collects, resume upload UI, consent/waiver collection at
  application time (vs. the dashboard's "complete waiver" checklist
  item, which assumes the waiver exists but doesn't show its content),
  or what an applicant sees between "applied" and "accepted" (a pending
  state, a rejection state, waitlist?). This needs a design pass before
  any of Phase 3 below can start.
  **Sequencing risk:** PLAT-35 was the last ticket created but it blocks
  PLAT-16/17/18. It should be pulled to the front of the queue.
- **The organizer dashboard.** `[no design ticket; build tickets are
  PLAT-28/29/30]` No mockup, no page structure decided. Needed for
  reviewing applications, managing check-in, and viewing sponsor-facing
  data. The build tickets exist without a design ticket in front of
  them — same shape of problem as PLAT-35, one step behind it.
- **The sponsor resume portal.** `[no ticket]` Not designed at all yet.
  Note PLAT-30 is *organizers* opening resumes, which is a different
  surface with different access control.
- **QR check-in scanning flow** (the organizer side — scanning a
  hacker's badge). `[no ticket]` The hacker-facing digital pass exists as
  static UI; the scanning/validation side has no design.
- **Multi-event UI.** `[no ticket]` Every page here assumes a single
  hardcoded event. Nothing is designed yet for how an organizer
  picks/switches events, or how a hacker's dashboard adapts if they're
  relevant to more than one.

## Phase 1 — Data layer

- [ ] Design the Prisma schema: events (the multi-event root table),
      applications, hackers/users, teams, waivers/consent records, meal
      preferences, check-ins. `[no ticket — implied by PLAT-8/9, but the
      schema-design step isn't filed separately]`
- [ ] Set up Postgres + Prisma, initial migration. `[PLAT-8 "Create the
      database", PLAT-9 "Set up table in DB"]`
- [ ] Seed script for fake testing data. `[PLAT-13]`
- [ ] Set up transactional email sending. `[PLAT-11]` Infrastructure
      dependency for PLAT-23 (confirmation email) and PLAT-26 (MLH
      reminder) — worth doing early since both later tickets block on it.
- [ ] Decide how `lib/placeholder-data.ts` maps to real tables — it was
      written to make this mapping obvious; use it as the checklist for
      what queries need to exist, then delete it. `[no ticket]`

## Phase 2 — Auth

- [ ] Build login. `[PLAT-12]` **Provider still unconfirmed** — Auth.js
      was mentioned once in the original brief and never specified;
      Discord OAuth is the likely intent given "MREYES · DISCORD
      ACCOUNT" in the sidebar placeholder. This decision gates both
      PLAT-12 and PLAT-27.
- [ ] Session handling, protected routes for the `(app)` route group.
      `[no ticket]`
- [ ] Roles — how organizer accounts differ from hacker accounts.
      `[PLAT-27 "Add roles"]`

## Phase 3 — Application flow

Design first (PLAT-35), then:

- [ ] Load school list. `[PLAT-14]`
- [ ] Create school picker. `[PLAT-15]`
- [ ] Build form layout. `[PLAT-16]`
- [ ] Add questions to form. `[PLAT-17]`
- [ ] Short answers and consent. `[PLAT-18]` This is where
      consent/waiver capture at application time lands.
- [ ] Check form answers (validation). `[PLAT-19]`
- [ ] Set up file storage. `[PLAT-20]` Cloudflare R2 per the original
      brief, though the ticket doesn't name a provider.
- [ ] Build resume upload. `[PLAT-21]`
- [ ] Save the application. `[PLAT-22]`
- [ ] Send confirmation email. `[PLAT-23]` — blocked on PLAT-11.
- [ ] Build "you're done" page. `[PLAT-24]`
- [ ] Handle someone who already applied. `[PLAT-25]`
- [ ] Application status states (submitted / under review / accepted /
      rejected / waitlisted) and what each looks like to the applicant.
      `[no ticket]` — the board covers submission but not the states
      *after* it.

## Phase 4 — Wire the six existing pages to real data

**No tickets exist for any of this.** Every page below renders
placeholders from `src/lib/placeholder-data.ts` today.

- [ ] Dashboard: real acceptance status, real checklist state (waiver
      completion, Discord join, attendance confirmation), real event
      date/venue (replace `[DATE]`, `[VENUE]` placeholders). `[no ticket]`
- [ ] Profile: load/save real hacker data; wire "SAVE PROFILE CHANGES"
      to an actual mutation. `[no ticket]`
- [ ] Team: real team creation/join-by-code/leave, replacing the
      `useState` toggle; real invite codes. `[no ticket]`
- [ ] Guide: real venue/wifi/what-to-bring content per event (replace
      `[VENUE]`, `[WIFI-NAME]`, `[ADDRESS]`, `[LOT NAME]` placeholders).
      `[no ticket]`
- [ ] Schedule: real per-event schedule data, replacing the `[T0]`...`[T8]`
      placeholder rows. `[no ticket]`
- [ ] Help: real form submission, routed to organizers somehow (email?
      a dashboard inbox?). `[no ticket]`

## Phase 5 — QR badge check-in

**No tickets exist for any of this.**

- [ ] Generate real QR codes (replace `QrPlaceholder`) encoding
      something an organizer scanner can validate. `[no ticket]`
- [ ] Organizer-side scanning UI (not designed yet). `[no ticket]`
- [ ] Check-in state that actually gates "show this at check-in for
      meals & swag." `[no ticket]`

## Phase 6 — Organizer dashboard + sponsor portal

- [ ] Design pass first (see "Not yet designed" above). `[no ticket]`
- [ ] Build application list. `[PLAT-28]`
- [ ] Organizers open resumes. `[PLAT-30]`
- [ ] Download as spreadsheet button. `[PLAT-29]`
- [ ] Application review — accept/reject/waitlist actions. `[no ticket]`
      PLAT-28 lists applications; nothing files the *decision* actions.
- [ ] Sponsor-facing resume search/download, with whatever access
      control that needs. `[no ticket]`

## Phase 7 — Testing, launch readiness & deployment

- [ ] Get site deploying. `[PLAT-10]`
- [ ] Decide on a testing strategy (none exists yet — this was explicitly
      out of scope for the static-UI session). `[no ticket]`
- [ ] Fill with 50 applications (load/realism check). `[PLAT-31]`
- [ ] Test on phones. `[PLAT-32]` Overlaps the mobile-breakpoint loose
      end below.
- [ ] Check emails arrive. `[PLAT-33]`
- [ ] Real deployment config beyond `create-next-app` defaults (env vars
      for DB connection, R2 credentials, Auth.js secrets, etc.).
      `[no ticket — PLAT-10 may absorb this]`

## Content & compliance

- [ ] Privacy page. `[PLAT-34]`
- [ ] Send reminder for MLH registration a week before the event.
      `[PLAT-26]` — blocked on PLAT-11. Note this is a *reminder to go
      register elsewhere*: MLH registration happens in OrganizerHQ, and
      this app never owns it (see CLAUDE.md).

## Smaller loose ends

- [ ] The dashboard's waiver checklist item currently toggles local
      component state with no persistence — needs a real "waiver
      completed" field once Phase 1/3 exist. `[no ticket]`
- [ ] Dashboard has two hardcoded strings that bypass
      `placeholder-data.ts`: the `YOU'RE ACCEPTED / TO HACKJAM '26`
      heading and `NOT FORMED · FIND TEAMMATES`, even though
      `dashboardStatus.eventName`/`.headline` exist. Minor now, but the
      "delete placeholder-data.ts cleanly" plan depends on catching
      these. `[no ticket]`
- [ ] Confirm the mobile sidebar-collapse breakpoint and drawer pattern
      (built as a judgment call, no mobile spec existed) — worth a real
      design/product review once actual organizers give feedback on
      using this at the door. Related: PLAT-32.
- [ ] Package manager drift: `pnpm-lock.yaml` and a pnpm-shaped
      `node_modules` appeared alongside the npm setup. Repo is npm by
      convention (CLAUDE.md) but nothing enforces it — consider a
      `packageManager` field in `package.json`. `[no ticket]`
- [ ] **Board hygiene:** PLAT-4 ("Delegate this work item to Claude") and
      PLAT-5 ("Implement this work item from your IDE or terminal") are
      Jira's default onboarding sample subtasks, not real work. Delete
      them.
