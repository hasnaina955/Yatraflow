# 0004. Mockup visual direction and image reuse

**Status:** Accepted direction and image permission. Written specification review remains open.  
**Date:** 2026-10-08  
**Supersedes:** [0002](0002-mockup-palette-not-adopted.md) and [0003](0003-mockup-palette-hero-and-shell-adopted.md) for this redesign.

## Context

The user rejected the rendered app's appearance as far below the mockup quality.
The goal is equal or better visual quality, not feature copying alone.
A canvas-colour change and a larger hero did not resolve that goal.

The later audit rendered all four reference files at desktop and phone widths.
It identified gaps in composition, type, photography, density, and surfaces.
`index.html` shows My Trips within a design board.
`hub.html` shows public discovery, despite its Creator hub title.
`creator-hub.html` shows publication states rather than a complete owner dashboard.
`trip.html` shows the trip workspace overview.

The user reviewed a portable comparison with My Trips and Explore studies.
The user approved both studies as the direction for a written specification.
The user also confirmed permission to reuse the mockup images.
These approvals do not establish rendered-product visual acceptance.

## Decision

Use close visual reconstruction with purposeful product adaptation.
Start with My Trips and Explore.
Keep publication polish and workspace-shell integration as separate design decisions.

Use Plus Jakarta Sans for these pages' interface text.
Use Playfair Display for Explore's editorial hero heading.
Use the reference canvas, sand, mint, teal, and navy as the light-theme direction.
Keep semantic app tokens, status meaning, both-theme contrast, and motion rules.
Do not retain the old palette freeze as a barrier to this approved work.

My Trips must use a panoramic page banner and an image-to-paper title transition.
Its featured journey must use a balanced desktop photo/content split and a phone stack.
Explore must use a compact desktop discovery shell and a photographic editorial hero.
Its creators and itinerary cards must use suitable public-route imagery.

The user authorises selected mockup images for the app.
This record does not claim independent licence verification.
Generated-image metadata alone does not establish that reuse is forbidden.
You must keep the mockup folder read-only and outside build dependencies.
Copy selected assets into the isolated project only after specification approval.

Keep real counts, routes, permissions, filters, actions, and the complete Explore catalog.
Do not copy invented follower, rating, earning, or community claims.
Do not treat absent study controls as permission to remove working features.
MR12's mobile bottom bar stays parked.
Do not integrate the separate sidebar branch without an explicit decision.

The detailed contract is the [visual-quality specification](../superpowers/specs/2026-10-08-mockup-visual-quality-design.md).
That document awaits user review before detailed implementation planning.

## Consequences

ADR 0002 and ADR 0003 remain unchanged historical records.
Their asset bans and conflicting visual directions no longer govern this redesign.
ADR 0003's broad shell adoption does not authorise workspace integration.
Its earlier full-width featured hero is not the approved My Trips target.
Its unsupported comparison and emergency-clause claims are not evidence for this decision.

The older Calm Travel Intelligence document remains useful for unchanged product principles.
This decision controls conflicting type, palette, image, and page-composition guidance for these two pages.
Any shared token change must include checks on other consumers.
No new database schema or live seeding is part of this work.

Automated gates and interaction checks remain necessary.
They cannot prove visual quality alone.
The user must review rendered reference/app comparisons before this batch claims visual completion.
The whole redesign remains open after this first batch.
