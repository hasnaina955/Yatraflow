// Append the B7 evidence section.
import fs from 'node:fs'

const block = `
## B7: the avatar

Commit \`e80111fe\`.

Five rules moved into \`src/styles/components/avatar.css\`: \`.avatar\` and \`.avatar.lg\` from section 02, and \`.avatar.tone-sea\`, \`.avatar.tone-marigold\` and \`.avatar.tone-bloom\` from section 17. The tone classes are surface variants, so they belong with the recipe rather than in a page module.

Seventeen of the twenty-two rules naming \`.avatar\` stayed. They size or stack an avatar inside a page:

| Rule | Concern |
|---|---|
| \`.member-stack .avatar\` and \`:first-child\` | stack overlap and border |
| \`.presence-peer .avatar\` | stack border |
| \`.balance-who .avatar\` | page sizing |
| \`.who-voted .avatar\` and \`:first-child\` | page sizing and overlap |
| \`.creator-hero .avatar\` | page sizing |
| \`.ex-byline .avatar\`, \`.ex-creator .avatar\` | page sizing |
| \`.yf-member .avatar\`, \`.yf-page .yf-member .avatar\` | page sizing and border |
| \`.ovw2 .ovw-avatars .avatar + .avatar\` | stack overlap |
| \`.member-stack .avatar\`, \`.yf-avatars .avatar\` box-shadow | stack edge |

### The seed proof came first

A zero from an untrusted tool means nothing. The avatar tool planted two defects in the module, rebuilt, and required the comparison to fail:

| Seed | Expected | Result |
|---|---|---|
| \`tone-sea\` fill changed to the base teal | detected | exit 1 |
| \`.avatar.lg\` 44px changed to 40px | detected | exit 1 |
| module restored | clean | exit 0 |

The module came back byte-identical, confirmed by an empty \`git diff\`. The tool is \`dev/_css3-avatar-seed.mjs\`, so the proof can be repeated.

### Verification

| Measure | Value |
|---|---|
| Elements | 91: 13 scopes by 7 variants |
| Variants | base, lg, three tones, an image avatar, an adjacent pair |
| Scopes | plain, member-stack, presence-peer, balance-who, who-voted, creator-hero, ex-byline, ex-creator, yf-member, yf-page yf-member, ovw-avatars, yf-avatars, yf-page yf-avatars |
| Environments | light and dark at 1440, light and dark at 390, reduced motion |
| Properties | 26 |
| Comparisons | 13,520 |
| Differences | 0 |

Eleven painted cases, all pixel-identical. The new one covers the circular clip, the three tone fills and inks in dark mode, and the overlapped member stack.

### A stale key was removed

Registering the owner made \`container-phone.css\` an owner file, so its appearance key could never match a finding. The stale-key check fired and the key was deleted rather than left in the ledger.

Rollback: move the five rules back to sections 02 and 17, remove the module and its import, and restore the appearance baseline.
`

fs.appendFileSync('docs/evidence/css-3-batches.md', block)
console.log('B7 evidence appended')
