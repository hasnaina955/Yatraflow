// Append the B8 evidence section.
import fs from 'node:fs'

const block = `
## B8: the dialog

Checkpoint 1 is \`5a52844f\`. Checkpoint 2 is \`faa33b47\`.

### The inventory was misleading

Twenty-four rules name \`.modal\` or \`.dialog\`. Most of them are \`:not(.modal *)\` exclusions inside the button page recipes: they exclude modal descendants from a page's button skin. They do not style a dialog.

Nine rules are the surface: \`.modal-overlay\` and \`.modal\` with their \`min-width: 640px\` steps, the \`max-width: 720px\` sheet step, and \`.modal-full\` with its head rule and two motion rules.

### The fixture mounts the real component

The fixture renders \`Modal\` from \`src/components/ui.tsx\`, so the focus trap, the Escape handler, the scroll lock, the focus restoration and the motion under test are the ones the product ships. Lookalike markup would have proven nothing about any of them.

### Detection proven before the result

Seeds are stylesheet overrides in isolated pages. No source edit, no rebuild.

| Seed | What it plants | Healthy | Seeded |
|---|---|---|---|
| Stacking | overlay \`z-index: 0\`, \`pointer-events: none\` | on top | not on top, detected |
| Clipping | \`overflow-y: hidden\`, \`max-height: 320px\` | scrolls, last control reachable | cut off, detected |

### Two measurement defects found while proving that

**The fixture never imported the stylesheet.** Vite injected nothing, so every measurement read an unstyled element: overlay \`position: static\`, \`z-index: auto\`, no max-height. Both seeds "passed" for the wrong reason. Fixed by importing \`../src/styles.css\` in the fixture.

**The Tab check never pressed Tab.** It sampled \`document.activeElement\` eight times, so it always saw the same control. It proved nothing about the trap. It now presses Tab, requires the walk to reach every focusable control, and fails if it does not. The sequence is now \`Close → confirm → cancel → Close\` and wraps, in all six environments.

### Coverage and behaviour

| Measure | Value |
|---|---|
| States | 18: six environments by three variant and body combinations |
| Environments | light and dark at 1440, light and dark at 390, reduced motion at both widths |
| Properties | 24, on overlay, dialog and head |
| Comparisons | 1,350 |
| Differences | 0 |
| Behaviour checks | 12 |

Each state asserts before measuring that the overlay, the dialog, \`role="dialog"\`, \`aria-modal="true"\` and at least two focusable controls exist, and that the long-body case rendered at least twenty paragraphs. A state that measured nothing would fail rather than report zero.

Behaviour asserted in every environment:

- keyboard entry with Enter moves focus inside the dialog
- Tab reaches all three focusables and wraps
- Shift+Tab stays inside
- Escape calls \`onClose\` and the dialog detaches
- focus returns to the opener
- reopening during the close transition leaves exactly one dialog and one overlay, with \`body { overflow: hidden }\` still in force and focus inside

### Checkpoint 2

Three variables: \`--dialog-max-width\`, \`--dialog-max-height\`, \`--dialog-max-height-dvh\`. \`.modal-full\` selects 720px instead of restating it. The phone step selects the safe-area-subtracted heights instead of redeclaring the vh/dvh pair, so that pair is declared once.

Two comments in the moved rules claimed the repetition was needed because the later block re-declared the base max-height. With a variable the base reads, that is no longer true, so both were rewritten to describe what the code does.

Twelve painted cases, all pixel-identical, including a new bottom-sheet case at 390px in dark mode.

### Pre-existing gaps, recorded and not fixed

These were present before this batch and are not caused by it. They are recorded rather than repaired, because the migration must not turn into a redesign.

- **The dialog does not use a portal.** \`Modal\` renders inline where it is called, so a caller inside a stacking context can trap it. The CSS cannot fix that; it is a component concern.
- **The initial-focus timer is 30ms.** A caller that opens and immediately moves focus can race it.
- **No \`aria-describedby\`.** The dialog names itself with \`aria-labelledby\` but does not describe its body.
- **The overlay has no explicit \`overflow\`.** A tall sheet on a short viewport relies on the sheet's own scroll rather than the overlay's.

### Gate

Focused checks pass: \`check:css\` with 10 owner modules, \`check:ui\`, typecheck, lint ratchet at baseline.

\`npm run verify\` did not run. Inherited STE findings still block it. This is not a claim that it passed.

Rollback: move the nine rules back to sections 02, 04 and 07. Restore the direct \`max-width\` and the two \`max-height\` pairs. Remove the module and its import. Restore the appearance baseline.
`

fs.appendFileSync('docs/evidence/css-3-batches.md', block)
console.log('B8 evidence appended')
