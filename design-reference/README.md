# Main — design reference

This is a design mockup created in a visual design tool (an appifact
design canvas), exported as a standalone page. Treat it as a REFERENCE
MOCKUP, not production code: the markup and inline styles carry the
design's precise values — colors, font sizes, spacing, radii, shadows,
layout — which an implementation should replicate faithfully in its own
components and styling system rather than copy wholesale.

## Contents (`Main.dc.html` — the hacker portal)

- `Main.dc.html` — the artboard (a Design Component: an `<x-dc>`
  template + a small logic class). The values to replicate live in its
  inline `style="…"` attributes and the `<helmet><style>` block.
- `hackjam26-words.png` — referenced resource
- `shpe-usf-horiz-ko.png` — referenced resource
- `hackjam-mascot.png` — referenced resource
- `support.js`, `vendor/react*.js` — the runtime that renders the
  component in a browser; not part of the design.

## Viewing

Serve the folder (e.g. `python3 -m http.server`) and open `Main.dc.html`;
some browsers block the scripts over file://.

## `application/` — the application flow (PLAT-35)

A second canvas covering the **pre-acceptance** application flow, authored
for this project rather than imported. Unlike `Main.dc.html`, it is a
design *we* own and may revise.

- `application/Main.dc.html` — clickable 5-step wizard: Discord sign-in →
  Basics → About You → School → Experience → Agreements → confirmation
- `application/FieldStates.dc.html` — form-control states the app doesn't
  have yet (`Field.tsx` is a styled div with no focus/error/disabled state)
- `application/AlreadyApplied.dc.html`, `application/Closed.dc.html` — edge states
- `application/canvas.json` — canvas layout, sticky notes, ticket map

Consent wording is verbatim from `MLH/mlh-policies`; don't paraphrase it.
These files are the source — the published canvas is generated from them,
so edit here and re-publish rather than editing the canvas and diverging.
