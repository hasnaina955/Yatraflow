# CSS-3 inventory evidence

The input commit is `699fbe2806844df15ee3d1bccfca3aaebbca3453`.
This commit is the CSS-2 checkpoint.
The branch is `chore/css-3-ownership`.

## Starting graph

| Measure | Value |
|---|---|
| Files in the graph | 20 |
| Records | 5,394 |
| Rule records | 5,058 |
| At-rule records | 254 |
| Resolved assets | 10 |
| Canonical fingerprint | `6ccb7bcd42b3fd650e24209e3db46ed2908269c564562e1eb0182f8491cd3226` |

The record count and the asset count equal the CSS-2 report.
The declaration content is therefore unchanged.

## Line-ending repair

The CSS-2 report records the final fingerprint `f4e8c99d449b6f7688f7fb557944bd17b9b57b479b14d8fef946576d40fb6ffa`.
That number does not reproduce from the repository.

The reference worktree had mixed line endings.
The seven files that CSS-2 rewrote were LF.
The thirteen files that CSS-2 did not touch were CRLF.
A Windows clone with `core.autocrlf=true` writes every file as CRLF.
The graph hashes raw bytes, so the fingerprint changes with the line endings.

The repository stores LF blobs.
The tree and blob identities of this branch equal the reference worktree:

- tree `d9c3137578cf71314f426935f23317fa8f33c923`
- `src/styles.css` blob `a44848a11199b656eb68e26da013432d21990e2d`

Two changes make the fingerprint reproducible:

1. `.gitattributes` pins `src/styles.css` and `src/styles/**` to `eol=lf`.
   The repository already uses this treatment for `eslint-baseline.json`.
2. This clone uses `core.autocrlf=input`.

`git diff` shows no content change in the 20 stylesheet files.
The working tree now equals the committed blobs byte for byte.
The fingerprint above is the canonical value for this commit.

Every later fingerprint comparison uses LF bytes.

## Ownership inventory

Measured from the shared source graph and from `src/` consumers.
A consumer is a source file that names the class token.

| Family | Rules | Files | Consumers | `!important` | Proposed owner |
|---|---|---|---|---|---|
| `.btn` | 57 | 12 | 54 | 0 | `components/button.css` |
| `.card` | 7 | 2 | 109 | 0 | `components/card.css` |
| `.input` | 19 | 6 | 93 | 0 | `components/input.css` |
| `.field` | 10 | 4 | 55 | 0 | `components/input.css` |
| `.container` | 24 | 9 | 24 | 0 | `layouts/container.css` |
| `.chip` | 17 | 6 | 47 | 0 | `components/chip.css` |
| `.toast` | 7 | 2 | 50 | 0 | `components/toast.css` |
| `.avatar` | 22 | 6 | 5 | 0 | `components/avatar.css` |
| `.modal` | 24 | 5 | 16 | 0 | `components/dialog.css` |
| `.hero` | 13 | 3 | 22 | 0 | `pages/landing.css` |
| `.itin-card` | 25 | 4 | 1 | 0 | page owner |
| `.pill-nav` | 21 | 3 | 1 | 0 | `components/pill-nav.css` |
| `.chip-btn` | 6 | 3 | 1 | 0 | `components/chip.css` |
| `.trip-head-card` | 13 | 3 | 0 | 3 | no consumer |
| `.popover` | 3 | 2 | 6 | 2 | `components/popover.css` |

Two counts in this table were wrong when B10 read them again. `.pill-nav` carries 21 rules, not 11, and `.pill-glider` adds 5 more. `.board*` is 29 classes over 150 rules in 5 files, not 2 files. `node dev/_css3-b10-scale.mjs <family>` reproduces every figure here.


## Cross-file duplication

The graph finds 101 selectors that occur in more than one file.

Most of these are not defects.
The keyframe steps `from`, `to`, `0%`, `50%`, `100%` and `0%, 100%` repeat in every animation.
The handoff forbids a global duplicate-selector check for this reason.

The defects are these:

| Selector | Files | Problem |
|---|---|---|
| `:root` | 7 | Token definitions are spread over 7 files |
| `.btn` | 12 | One control, twelve owners |
| `.container` | 9 | One layout, nine owners |
| `.input` | 6 | One control, six owners |
| `.chip` | 6 | One control, six owners |
| `.avatar` | 6 | One control, six owners |
| `.modal` | 5 | One control, five owners |
| `.itin-card` | 4 | One card, four owners |
| `.board*` | 5 | Board family split over 5 files, 29 classes |
| `.trip-head-card` | 3 | One card, three owners |

The `:root` duplication is the largest single ownership defect.
Token definitions belong to token modules.

## Verification limits carried from CSS-2

These limits stay open until a later batch closes them:

- The unmodified `npm run verify` stops at default STE.
  The CSS-2 branch reported 170 findings on 153 lines against the integration merge base.
- Signed-in My trips acceptance is not proven.
  The CSS-2 fixture recreates that page's filter markup.
- Native and file builds are not part of this inventory.

This document records findings only.
The batch schedule is in `ROADMAP.md`, under the CSS system migration section.
No browser check has run for CSS-3 yet.
