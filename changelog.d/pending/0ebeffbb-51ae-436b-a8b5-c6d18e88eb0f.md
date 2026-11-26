### Changed

- **The invite card's og:url names /join with no code.** A chat app cannot keep a join token from the card. (#1045)

### Fixed

- **Invite link previews no longer show trip details to people who are not signed in.** Every anonymous request gets one private-invite card. The card names no trip title, day count or member. (#1045)
- **The invite preview no longer makes a database lookup for an anonymous card.** A valid code, an invalid code and a malformed code now return the same card bytes. (#1045)
