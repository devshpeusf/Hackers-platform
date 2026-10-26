# Scanner app icons

These committed PNGs are deterministic derivatives of the existing approved
`public/hackjam-mascot.png`, centered on the site's dark background. Nearest-
neighbor scaling preserves the source pixel art without stretching its proportions.

- `icon-192.png` and `icon-512.png`: normal install icons.
- `maskable-192.png` and `maskable-512.png`: separate maskable icons whose whole
  subject fits within the central 80%-diameter safe circle.
- `apple-touch-icon.png`: 180×180 iOS home-screen icon.

Regenerate with `node scripts/generate-scanner-icons.mjs` using Sharp, already
provided by Next.js. Commit the script and all five PNGs; no new dependency or
build-time icon generation is required.
