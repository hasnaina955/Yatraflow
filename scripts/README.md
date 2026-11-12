This table lists every tracked file under `scripts/` with its purpose and how it runs.
Add a row here when you add a new script.

| File | Purpose | How it runs | Status |
| --- | --- | --- | --- |
| `scripts/apk-release-manifest.mjs` | Generates and checks the APK release update manifest from a real APK. | imported by `tests/apk-release-manifest.test.ts` | helper |
| `scripts/control-runs-r13.mjs` | Records negative-control runs for the r13 repair. | imported by `tests/release-tooling.test.ts` | helper |
| `scripts/css-source-graph.mjs` | Reads the CSS import graph as one shared source for every check. | imported by `scripts/css-ownership.mjs` and `scripts/uiAntipatterns.mjs` | helper |
| `scripts/fixtureFunnelPlan.mjs` | Holds the creator fixture's traffic plan as a pure module. | imported by `scripts/seedCreatorFixture.mjs` | helper |
| `scripts/fixtureGuard.mjs` | Stops a fixture seed from reaching a live project. | imported by `scripts/seedCreatorFixture.mjs` | helper |
| `scripts/fixtureKit.mjs` | Holds reusable seeding primitives for any surface. | imported by `scripts/seedCreatorFixture.mjs` | helper |
| `scripts/geocode-places.mjs` | Looks up place coordinates through Nominatim. | imported by `scripts/gallery-geocode.mjs` and `scripts/new-itinerary.mjs` | helper |
| `scripts/jev-router-corpus-harvested.ts` | Holds harvested router-audit phrasings with their provenance. | imported by `scripts/jev-router-audit.test.ts` | helper |
| `scripts/jev-router-corpus.ts` | Holds realistic phrasings for the router audit. | imported by `scripts/jev-router-audit.test.ts` and `scripts/jev-router-corpus-harvested.ts` | helper |
| `scripts/lint-ste-base.mjs` | Chooses the commit that a default `lint:ste` run diffs from. | imported by `scripts/lint-ste.mjs` | helper |
| `scripts/motion-page-sampler.mjs` | Samples page-root block motion once per animation frame. | imported by `scripts/browser-motion-check.mjs` | helper |
| `scripts/mutation-check.mjs` | Removes one guard at a time and records which test fails. | imported by `tests/mutation-runner.test.ts` | helper |
| `scripts/mutation-error-reporter.mjs` | Writes unhandled vitest errors for the mutation runner. | used by `scripts/mutation-check.mjs` | helper |
| `scripts/mutation-lib.mjs` | Holds pure helpers for the mutation check. | imported by `scripts/mutation-check.mjs` | helper |
| `scripts/verify-bound-r13.mjs` | Records commit identity and file hashes before and after one full verify run. | referenced by `tests/release-tooling.test.ts` | helper |
| `scripts/README.md` | Lists every tracked file under `scripts/` with its purpose and how it runs. | manual | manual, not wired |
| `scripts/apply-schema.mjs` | Fixes RLS infinite recursion on `trip_members` with a one-off migration. | manual | manual, not wired |
| `scripts/gallery-geocode.mjs` | Geocodes the places a draft itinerary names. | manual | manual, not wired |
| `scripts/generatePwaIcons.mjs` | Draws the PWA launcher icons from the Ribbon Y mark. | manual | manual, not wired |
| `scripts/integration/cleanupHarness.mjs` | Removes rows left by integration runs. | manual | manual, not wired |
| `scripts/integration/growth-db.mjs` | Runs a network-isolated local database container and refuses a remote database URL. | manual | manual, not wired |
| `scripts/integration/trip-write-version-db.mjs` | Runs the trip write-version SQL migration and its checks in a network-isolated local container. | manual | manual, not wired |
| `scripts/lighthouse-parse.mjs` | Parses local Lighthouse desktop and mobile HTML reports. | manual | manual, not wired |
| `scripts/make-dev-shortcut.ps1` | Creates a YatraFlow Dev desktop shortcut. | manual | manual, not wired |
| `scripts/new-itinerary.mjs` | Builds an itinerary authoring scaffold with geocoded stops. | manual | manual, not wired |
| `scripts/og-default-card.html` | Holds the source for the default Open Graph card. | manual | manual, not wired |
| `scripts/papercut-motion-check.mjs` | Checks the live gallery motion at both widths and themes. | manual | manual, not wired |
| `scripts/seedCreatorFixture.mjs` | Builds a local creator fixture with real sales. | manual | manual, not wired |
| `scripts/validate-itinerary.mjs` | Checks an itinerary JSON against the import spec. | manual | manual, not wired |
| `scripts/verify-google-places.mjs` | Replicates the app's three live Google Places call paths. | manual | manual, not wired |
| `scripts/browser-motion-check.mjs` | Serves the production build and samples page blocks once per animation frame. | `npm run check:motion`; `.github/workflows/ci.yml` (motion job) | wired |
| `scripts/build-art.mjs` | Builds illustration derivatives in `src/assets/art/` from master PNGs. | `npm run art:build` | wired |
| `scripts/checkMigrations.mjs` | Asks the live project whether every migration artifact is there. | `npm run check:migrations` | wired |
| `scripts/changelog.mjs` | Creates and checks fragments. Prints a release patch. `--write` saves the patch only. | `npm run changelog:new`; `npm run changelog:check`; `npm run changelog:release` | wired |
| `scripts/clean-env.mjs` | Clears the `NODE_ENV=production` trap before an npm operation. | `npm run clean:env` | wired |
| `scripts/css-ownership.mjs` | Checks who may write each rule in the CSS source graph. | `npm run check:css`; `npm run verify` | wired |
| `scripts/hooks.mjs` | Turns the opt-in pre-push hook on or off for this clone. | `npm run hooks:install`; `npm run hooks:uninstall` | wired |
| `scripts/integration/integrationHarness.mjs` | Asserts row-level behaviour against a real Supabase project. | `npm run test:integration` | wired |
| `scripts/jev-router-audit.test.ts` | Diffs Jev's capability answer against the deterministic route. | `npm test` (vitest `scripts/**/*.test.ts`; needs `JEV_AUDIT=1`) | wired |
| `scripts/landing-overflow-probe.mjs` | Measures real horizontal overflow on the Landing page at phone widths. | `npm run probe:landing-overflow` | wired |
| `scripts/lint-ratchet.mjs` | Makes the ESLint error count a ceiling instead of a gate. | `npm run lint:ratchet`; `npm run verify` | wired |
| `scripts/lint-ste.mjs` | Checks new prose against Simplified Technical English rules. | `npm run lint:ste`; `npm run verify`; `.github/workflows/ci.yml` | wired |
| `scripts/next-step-probe.mjs` | Reports what `nextTripStep` derives for every published itinerary. | `npm run probe:next-step` | wired |
| `scripts/pr-auto-close.mjs` | Closes issues named in a PR merged into `test`. | `.github/workflows/issue-autoclose.yml` | wired |
| `scripts/start.ps1` | Launches the dev server, the test suite or the production build. | `npm run start` | wired |
| `scripts/ui-sweep.mjs` | Takes a dev-only screenshot sweep of the web app. | `npm run ui:sweep` | wired |
| `scripts/uiAntipatterns.mjs` | Runs the mechanical subset of the UI design rules. | `npm run check:ui` | wired |
| `scripts/verify-fast.mjs` | Runs `tsc -b` and `vitest related` on the changed files. `--base <rev>` limits the list to committed changes. | `npm run verify:fast`; `.githooks/pre-push` | wired |
