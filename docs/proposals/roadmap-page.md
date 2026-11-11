# Proposal: public roadmap page

Status: proposal, not built. Everything here is subject to change.

## Why

Open-alpha players want to know what's coming next and whether the thing they reported is being worked on. The changelog covers the past; a roadmap covers the future. The About page already has a short "Roadmap" list. This page would replace it with something players can come back to.

## What it would show

- **Now:** what's being built for the next release.
- **Next:** what comes after, in rough order.
- **Later:** ideas being considered, with no order and no promise.
- **Recently shipped:** the last two or three changelog entries, linking to `/changelog`.

Each item: a short title, one plain sentence, and optionally "Requested by players" when it came from the support form.

A banner at the top: "This roadmap shows current plans. Plans change, especially during the alpha. Nothing here is a promise or a release date."

No dates beyond "Now / Next / Later". Dates create expectations a one-person project can't always meet.

## Draft content (from docs/DESIGN.md and the About page)

| Column | Item         | Sentence                                                        |
| ------ | ------------ | --------------------------------------------------------------- |
| Now    | Games        | Simulated games with schedules, standings and box scores.       |
| Next   | Seasons      | Advance through a season with live progress, then the playoffs. |
| Next   | Front office | Draft, free agency, contracts, trades and finances.             |
| Later  | Mobile apps  | iOS and Android apps sharing the same account and leagues.      |
| Later  | Desktop      | A possible desktop release.                                     |

The owner reviews and edits these before publishing.

## How it would be built

- Content in `apps/web/src/content/roadmap.ts`, like the changelog: typed, reviewed in pull requests, no database.
- Page at `/roadmap` in the marketing group using `Page`, `Section` and `Card`. Columns stack on phones and sit side by side from tablet up.
- Linked from the footer ("Full Court" column) and from the changelog.
- Added to `e2e/pages.ts` for the accessibility, 320 px and touch-target checks.

## Decisions for the owner

1. Publish a roadmap at all, or keep only the changelog for now?
2. "Now / Next / Later", or a plain ordered list?
3. Show "Requested by players" tags?
4. Who updates it, and when (every release)?
