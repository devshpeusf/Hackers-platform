# TASKS.md

Everything still to build, grouped roughly in the order it'll likely
need to happen. Nothing here is started. See CLAUDE.md for what *is*
here (scaffold, theme, six static pages).

## Not yet designed

- **The application form.** This mockup only covers the *post-acceptance*
  hacker experience (dashboard, profile, team, guide, schedule, help).
  There is no mockup yet for: the public application/registration flow,
  what fields it collects, resume upload UI, consent/waiver collection
  at application time (vs. the dashboard's "complete waiver" checklist
  item, which assumes the waiver exists but doesn't show its content),
  or what an applicant sees between "applied" and "accepted" (a pending
  state, a rejection state, waitlist?). This needs a design pass before
  any of Phase 1 below can start.
- **The organizer dashboard.** No mockup, no page structure decided.
  Needed for reviewing applications, managing check-in, and viewing
  sponsor-facing data.
- **The sponsor resume portal.** Not designed at all yet.
- **QR check-in scanning flow** (the organizer side — scanning a
  hacker's badge). The hacker-facing digital pass exists as static UI;
  the scanning/validation side has no design.
- **Multi-event UI.** Every page here assumes a single hardcoded event.
  Nothing is designed yet for how an organizer picks/switches events, or
  how a hacker's dashboard adapts if they're relevant to more than one.

## Phase 1 — Data layer

- [ ] Design the Prisma schema: events (the multi-event root table),
      applications, hackers/users, teams, waivers/consent records, meal
      preferences, check-ins.
- [ ] Set up Postgres + Prisma, initial migration.
- [ ] Decide how `lib/placeholder-data.ts` maps to real tables — it was
      written to make this mapping obvious; use it as the checklist for
      what queries need to exist, then delete it.

## Phase 2 — Auth

- [ ] Auth.js integration (mentioned in the original brief — likely
      Discord OAuth given "MREYES · DISCORD ACCOUNT" in the sidebar, but
      not confirmed).
- [ ] Session handling, protected routes for the `(app)` route group.
- [ ] Decide how organizer accounts differ from hacker accounts
      (role field? separate auth flow?).

## Phase 3 — Application flow

- [ ] Design the application form (see "Not yet designed" above) before
      building it.
- [ ] Resume upload → Cloudflare R2.
- [ ] Consent/waiver capture at application time.
- [ ] Application status states (submitted / under review / accepted /
      rejected / waitlisted) and what each looks like to the applicant.

## Phase 4 — Wire the six existing pages to real data

- [ ] Dashboard: real acceptance status, real checklist state (waiver
      completion, Discord join, attendance confirmation), real event
      date/venue (replace `[DATE]`, `[VENUE]` placeholders).
- [ ] Profile: load/save real hacker data; wire "SAVE PROFILE CHANGES"
      to an actual mutation.
- [ ] Team: real team creation/join-by-code/leave, replacing the
      `useState` toggle; real invite codes.
- [ ] Guide: real venue/wifi/what-to-bring content per event (replace
      `[VENUE]`, `[WIFI-NAME]`, `[ADDRESS]`, `[LOT NAME]` placeholders).
- [ ] Schedule: real per-event schedule data, replacing the `[T0]`...`[T8]`
      placeholder rows.
- [ ] Help: real form submission, routed to organizers somehow (email?
      a dashboard inbox?).

## Phase 5 — QR badge check-in

- [ ] Generate real QR codes (replace `QrPlaceholder`) encoding
      something an organizer scanner can validate.
- [ ] Organizer-side scanning UI (not designed yet).
- [ ] Check-in state that actually gates "show this at check-in for
      meals & swag."

## Phase 6 — Organizer dashboard + sponsor portal

- [ ] Design pass first (see above).
- [ ] Application review/accept/reject UI.
- [ ] Sponsor-facing resume search/download, with whatever access
      control that needs.

## Phase 7 — Testing & deployment

- [ ] Decide on a testing strategy (none exists yet — this was explicitly
      out of scope for the static-UI session).
- [ ] Real deployment config beyond `create-next-app` defaults (env vars
      for DB connection, R2 credentials, Auth.js secrets, etc.).

## Smaller loose ends

- [ ] The dashboard's waiver checklist item currently toggles local
      component state with no persistence — needs a real "waiver
      completed" field once Phase 1/3 exist.
- [ ] Confirm the mobile sidebar-collapse breakpoint and drawer pattern
      (built this session as a judgment call, no mobile spec existed) —
      worth a real design/product review once actual organizers give
      feedback on using this at the door.
- [ ] Confirm Auth.js is still the intended auth provider before Phase 2
      starts (only mentioned once in the original brief, not deeply
      specified).
