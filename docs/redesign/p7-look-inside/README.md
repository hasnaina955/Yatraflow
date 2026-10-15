# P7 Look Inside: public itinerary prototype

Status: unreviewed prototype. The user has not approved the concept.

This folder holds a clickable mockup of the public itinerary page (P7). It is a design record. It does not change the app. No file in `src/` uses it.

## How to open it

1. Run `node tools/serve.mjs 5301` in this folder.
2. Open `http://127.0.0.1:5301/index.html?trip=spiti` in a full browser window.

Do not double-click `index.html` in a preview pane. Some viewers load the page without its CSS and JavaScript, and the page shows as plain buttons.

Pick a trip with the "Prototype" panel, or with `?trip=<id>`. The ids are `spiti`, `jaipur`, `longway`, `air`, `coorg`, `pondy` and `purulia`. The switches `?theme=dark` and `?state=owned` show dark mode and the paid view.

## What is in here

| Path | What it holds |
| --- | --- |
| `index.html`, `assets/`, `data/` | The prototype. It has no build step. |
| `NOTES.md` | The design notes: the concept, each decision, the checks and the known weaknesses. |
| `specs/ticket-stage-spec.md` | The first concept, "the Ticket". It was replaced. |
| `specs/opus-redesign.md` | The advisor's concept, "Look Inside", and the plan to prove it. |
| `specs/photo-candidates.md` | Open-licence photo candidates. Nothing from this list is in the prototype yet. |
| `screenshots/` | Nine key frames. The full set of 58 stays outside the repo. |
| `tools/serve.mjs` | A small static server. |
| `tools/prep-data.mjs` | A record of how `data/` was built. It reads a corpus folder that is not in this repo, so it cannot run here. |

## Data in the prototype

- The Spiti trip is a real public trip. All other trips come from the itinerary fixtures.
- Creator names, bios, pitches and day teasers are sample text, except the real `Has9` handle.
- Views, forks and prices on the fixtures are test values.

## Photos

The photos in `assets/photos/` are open-licence images. Their credits are in `assets/photos/credits.json`. The flight trip links one Wikimedia photo from the web. Five of the seven trips have no real photo, so they use a ticket over an icon pattern.

## Open problems

- The gallery photo strip showed empty boxes in one full-page capture. Nobody has confirmed whether this is a real fault.
- Inspect fails on the trips with no photo ("too few pictures"). Jaipur at 768 px has the creator name pass under the fixed price bar. The Coorg title runs to three lines on a phone.
- The data does not yet hold a per-day teaser, a buy-box pitch or a photo gallery. The prototype uses sample values for these.
- The public function `get_public_trip` still returns locked stop titles and coordinates (issue #774). The prototype loads locked names only after the pretend payment. The real app does not.
