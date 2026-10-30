# CSS-2 pilot evidence

The input commit is `fc775db83dda55e77db58b7b3208bbe0a400cea5`.
The input CSS graph fingerprint is `9d379791fec50fac04371032919b2528d8aebb3d69b71e8033ec0638934f1f3a`.
The final graph fingerprint is `f4e8c99d449b6f7688f7fb557944bd17b9b57b479b14d8fef946576d40fb6ffa`.
The graph still resolves 10 assets. CSS-1 proved byte identity at the input.
CSS-2 changes the cascade text and uses computed styles for comparison.

My trips imports both controls directly. Explore uses both through `ExploreFilterBar`.
Other select consumers include Create Trip, Trip Settings, Timeline, and Map.
Native selects use the same `.select` recipe. The pilot retains that contract.

`components/select.css` owns the native and custom select rules.
The entry imports it after legacy section 04. It owns the dark chevron and phone rules.
The catalog variant keeps its original selector specificity inside this module.
The sort wrapper sets `--select-leading-space` for its icon.
`components/search-field.css` owns search paint, states, and local motion.
The entry imports it before legacy section 10. The filter bar sets `--search-field-flex` on phones.
Legacy section 10 keeps the shared catalog layout and filter bar stacking.
Shared tokens, popup glass, and global reduced motion remain in their existing owners.
The select invalid and disabled duplicates were removed. Their native rules retain the same values.

The baseline and final fixture runs used the real React controls in both page layouts.
The Explore fixture uses `ExploreFilterBar`. The My trips fixture recreates its filter markup.
The runs cover both themes at 390, 640, 641, 720, 721, and 1440 pixels.
They check clearing, keyboard selection, Escape, focus retention, and popup hit testing.
They compare recorded computed properties for search, select, disabled, and invalid states.
Those properties have zero differences across the 24 cases.
The measurement rejected a hidden focus ring and a clipped popup.
The real `/explore` route passed at 390 and 1440 pixels in both themes.
Focus screenshots changed when the ring was removed. Popup hit tests reached the last option.
The fixture does not prove signed-in My trips. It recreates that page's filter markup.

The variant run uses the real `DobPicker` and compact `Select` components.
It compares CSS-1 with the current graph in both themes at 390 and 1440 pixels.
It tests normal and reduced motion. The 390 pixel cases emulate a coarse touch pointer.
All eight baseline pairs match for the recorded styles and transition samples.
The native year select changes value. The compact popup opens and closes with Escape.
On the coarse pointer, each tested control measures at least 44 pixels in both dimensions.
The compact control measures 29 pixels high on desktop in both versions.
The native year control measures 42 pixels high on desktop in both versions.
The fixture does not reproduce each consumer's surrounding layout.

The harness samples focus and hover at the start, midpoint, and end of each transition.
It samples the compact popup entrance at the same points.
The focus and hover transitions last 160 ms. The popup entrance lasts 240 ms.
The reduced-motion cases show no active transition or popup animation at sampling time.
The hover checks use a mouse, including in the emulated touch context.

The harness compares a painted ring pixel with the same pixel after it hides the ring.
The smallest measured contrast is 3.61:1 in light and 6.17:1 in dark.
Those samples match the CSS-1 baseline. A same-color control produces 1:1.
The result covers the sampled top edge in this fixture, not every surrounding surface.

Local evidence is in `dev/_evidence/css2-20261029-before-2/` and `dev/_evidence/css2-20261029-final/`.
Each run records its graph, inputs, times, screenshots, and results.
The first baseline run failed because the Filters badge changed its accessible name.
The corrected run used the toggle class. The final graph matched before and after capture.
The variant confirmation is in `dev/_evidence/css2-20261029-variants-confirm/`.
Its first run sampled styles before stylesheet replacement settled. The confirmation waits for it.
The analysis mode was added after capture. It reads the saved screenshots and records.

| Check | Result |
|---|---|
| `npx vitest run tests/css-source-graph.test.ts tests/design-system.test.ts tests/segmented-tabs-filterbar.test.ts tests/lint-ste.test.ts --maxWorkers=2` | 178 passed. |
| `npm run check:ui` | Exit 0. No findings. |
| `node scripts/lint-ste.mjs --base fc775db83dda55e77db58b7b3208bbe0a400cea5` | Exit 0. |
| `npm run verify` | Exit 1 at default STE. The existing branch has 170 findings on 153 lines. |
| `npx vitest run --maxWorkers=2` | Exit 0. 6,891 passed and one skipped. |
| `npm run check:motion` | Exit 0. The build passed. Signed-in My trips motion was skipped. |
| `node dev/css2-check.mjs dev/_evidence/css2-20261029-variants-confirm --variants` | Exit 0. Sixteen cases captured. |
| `node dev/css2-check.mjs dev/_evidence/css2-20261029-variants-confirm --analyze` | Exit 0. Eight pairs match. Twenty-four ring samples pass 3:1. |

The default STE base is the `origin/test` merge base `f68b3d9`.
The verify run passed clean type checking and the lint limit before STE stopped it.
The lint report stayed at 134 errors and 27 warnings. No baseline file changed.
The STE guard compares legacy edits with the immutable extraction commit.
It checks new and edited comments. A missing extraction commit checks all changed lines.

To roll back search, restore its rules in section 10 and remove its import and module.
To roll back select, restore its rules in sections 01, 02, 04, and 10.
Then remove the select import and module. Restore the filter variables with their original rules.
These rollbacks need no checkout reset or reversal of other redesign work.
