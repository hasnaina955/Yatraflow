# Approved mockup image sources

**Date:** 2026-10-08

**Type:** Asset reference.

**Decision:** [ADR 0004](adr/0004-mockup-visual-direction-and-image-reuse.md)

The user confirmed permission to reuse these mockup images.
This is the user's permission statement, not an independent licence review.
The source folder remains read-only.
The app serves copied files from `public/img/mockup-adopted/`.
It has no build dependency on the source folder.
The adjacent `sources.json` supplies a machine-readable file list.

| Source file in `yatraflow-mockup/assets` | Product purpose |
|---|---|
| `hero-banner.jpg` | Decorative My Trips page banner |
| `ch-hero.jpg` | Decorative Explore hero |
| `kerala-backwaters.jpg` | Context-matched Kerala route fallback |
| `goa-panjim.jpg` | Context-matched Goa route fallback |
| `rajasthan-forts.jpg` | Context-matched Rajasthan route fallback |
| `spit-valley.jpg` | Context-matched Spiti route fallback |
| `himalayan-loop.jpg` | Context-matched Himachal route fallback |

Route photos do not change the saved-cover verdict.
Unknown routes keep a neutral fallback.
Do not present these images as user uploads.
