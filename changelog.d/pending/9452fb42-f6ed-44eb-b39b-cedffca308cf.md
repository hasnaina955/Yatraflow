### Added

- **The FAQ, How it works, About and For creators pages carry their full text in the first HTML response.** Each page has its own title, description, canonical address and social card, written at build time. Crawlers and link previews read them without running the app. (#1042)

### Changed

- **The About and For creators pages show their text before the account loads.** For creators shows its signed-out call to action until the account loads, then updates it. (#1042)

### Fixed

- **The offline fallback stays the app shell after a visit to a copy page.** The service worker no longer stores a copy page as the shell. (#1042)
