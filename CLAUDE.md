# CLAUDE.md

This file orients a future session with no memory of how this repo got here.

## What this is

A registration and sponsor-data platform for SHPE USF's hackathons. It's
**multi-event**: each hackathon (HackJam '26 is the first) is a row in a
future database, not a fork of this repo. Don't hardcode "HackJam '26"
into logic — it's fine in this phase's placeholder copy, but design
decisions should assume more events will exist later.

Long-term scope (none of it built yet — see TASKS.md): applications with
resume upload, consent records, QR badge check-in, an organizer
dashboard, a sponsor resume portal. **MLH registration itself happens in
an external system (OrganizerHQ) — this app never owns MLH registration
or MLH check-in.**

This first session scaffolded the project and built **static UI only**:
six pages, hardcoded placeholder data, no backend of any kind. See
"What's NOT here yet" below before assuming any feature works.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4 — theme lives in `src/app/globals.css` via `@theme`,
  there is no `tailwind.config.ts` (v4 doesn't use one by default)
- npm (not pnpm/yarn — this was a deliberate choice, don't switch)
- `next.config.ts` sets `agentRules: false`. Next 16 auto-generates its
  own `CLAUDE.md`/`AGENTS.md` stub on every `dev`/`build` run unless this
  is disabled — it would silently overwrite this file otherwise. Keep it
  disabled, or this file gets clobbered.
- `next.config.ts` also pins `turbopack.root` to the project directory —
  without it, Turbopack walks up looking for a workspace root and warns
  about an unrelated lockfile in the parent of `Documents/`.

Not installed yet, and shouldn't be until a session explicitly takes on
that phase: Prisma, Postgres, Auth.js, Cloudflare R2, any testing
framework.

## Design system

Retro pixel-arcade aesthetic: dark, high-contrast, chunky offset
box-shadow "borders" instead of 1px borders. Source of truth was
`design-reference/Main.dc.html` (a design-tool export — read its
README.md before touching it again; it's a reference, not code to copy).

**Tokens** live in `src/app/globals.css`:
- `@theme` block — every color as a `--color-*` var (`surface-bg`,
  `surface-sidebar`, `surface-card`, `border-default`, `text-primary`
  through `text-faintest`, `accent-pink` through `accent-amber`,
  `terminal-red/yellow/green`), plus `--font-pixel` / `--font-body`.
  These generate Tailwind classes directly: `bg-surface-card`,
  `text-accent-teal`, `border-border-default`, etc. **Always reference
  these classes — never hardcode a hex value in a component.**
- `@layer components` block — the repeated chunky-shadow visual
  patterns that don't translate to a clean utility string:
  `.pixel-card`, `.pixel-chip`, `.pixel-btn-solid`/`.pixel-btn-outline`,
  `.terminal-window`, `.terminal-bar`, `.field`, `.nav-row:hover`,
  `.clickable`. Per-instance accent color is passed via CSS custom
  property (`--pc-border`, `--chip-border`), the same mechanism the
  original mockup used — see any `PixelCard borderColor="..."` call.
- Fonts: Press Start 2P (`font-pixel`, display/pixel text) and Space
  Mono (`font-body`), loaded in `src/app/layout.tsx` via
  `next/font/google`, exposed as the same CSS vars the theme consumes.

**Primitives** in `src/components/ui/`:
| Component | Purpose |
|---|---|
| `PixelCard` | offset-shadow card, `borderColor` + `clickable` props |
| `PixelChip` | small pixel-font label chip, `color` + optional `textColor` |
| `PixelButton` | `variant="solid"\|"outline"`. **Does not default padding/font-size** — the mockup sizes every button instance individually (compare SAVE PROFILE CHANGES vs. LEAVE TEAM), so callers pass sizing via `className`. Check an existing page for the right values before inventing new ones. |
| `Field` | the read-only-looking box used in Profile/Help. Deliberately a styled `<div>`, not a real `<input>` — an early version used a disabled input and it clipped long values instead of wrapping like the mockup. Swap for a real form control when submission lands. |
| `TerminalWindow` | title bar (3 dots + filename) + scanline body overlay |
| `QrPlaceholder` | the fake QR — CSS gradients + nested finder-pattern squares, no real data encoded |
| `PageHeading` | pixel title + 3-dot teal divider, used on every page except Dashboard (which has a custom header) |

**Layout** in `src/components/layout/`: `Sidebar` (owns the mobile
open/closed state and renders both the desktop 240px column and the
mobile top-bar + slide-in drawer) and `SidebarNav` (nav rows, active
state derived from `usePathname()` — not local state like the mockup,
since routes are real here).

`src/lib/clsx.ts` is a ~3-line classnames joiner, written to avoid
pulling in a dependency for something this small. Not a stopgap —
there's no reason to replace it with the `clsx` package unless a real
need for its edge-case handling (arrays, objects) comes up.

## Folder layout

```
src/
  app/
    layout.tsx              # fonts, <html>/<body>
    globals.css             # theme tokens + component-layer CSS (see above)
    page.tsx                 # redirects to /dashboard
    (app)/
      layout.tsx             # sidebar + content shell, shared by all 6 pages
      dashboard/page.tsx
      profile/page.tsx
      team/page.tsx
      guide/page.tsx
      schedule/page.tsx
      help/page.tsx
  components/
    layout/Sidebar.tsx, SidebarNav.tsx
    ui/  (the 7 primitives above)
  lib/
    placeholder-data.ts      # every hardcoded value in the app, typed
    clsx.ts
public/
  hackjam26-words.png, shpe-usf-horiz-ko.png, hackjam-mascot.png
design-reference/             # the original mockup export — read-only reference
```

## Conventions established this session

- **Every hardcoded value lives in `src/lib/placeholder-data.ts`**, typed,
  imported from there — never a literal scattered in a component. This
  file is meant to be deleted wholesale once real data (auth, DB,
  applications) lands; if you're adding a new hardcoded value, put it
  here, not inline, so that deletion stays clean.
- **The `(app)` route group** is the shared shell for the six
  post-acceptance pages. If a future page needs a different shell (e.g.
  an organizer dashboard, or the application form itself, which is
  pre-acceptance and likely shouldn't show this sidebar at all), give it
  its own route group rather than stretching this layout to cover both.
- **Routing drives active nav state**, not component state — a
  deliberate departure from the mockup's fake in-memory router. Don't
  reintroduce a `page` state variable for navigation.
- **Team page's two states are a local `useState` toggle** with zero
  persistence, by design — this is static UI, not a data model. When
  team membership becomes real, this toggle goes away entirely along
  with the placeholder data behind it.
- **The dashboard waiver checklist row is the one other piece of local
  UI state** (mirrors the mockup's toggle) — also throwaway, also gone
  once acceptance status is a real field.
- Tailwind arbitrary spacing values (`p-6.5`, `gap-4.5`, etc.) are used
  throughout to hit exact mockup pixel values (Tailwind v4 computes
  these dynamically — no config entry needed). Where a value doesn't
  map to a fraction of `0.25rem` cleanly, an arbitrary bracket value
  (`w-[78px]`) is used instead. Match this precision if you're adding to
  an existing page — the brief calls for desktop fidelity to the
  mockup.
- Mobile breakpoint is Tailwind's default `md` (768px). Below it, the
  sidebar collapses into a hamburger-triggered drawer (see `Sidebar.tsx`)
  — there was no mobile spec in the mockup, so this was a judgment call,
  not an extracted requirement.

## What's NOT here yet (see TASKS.md for the full breakdown)

No auth, no database, no API routes, no form submission, no file upload,
no tests, no deploy config beyond `create-next-app` defaults. Every input
on Profile/Help renders but does nothing. The QR code is a static visual
placeholder, not a generated code. This is all intentional per the
project brief for this session — don't "complete" any of it without
checking with the project owner first.
