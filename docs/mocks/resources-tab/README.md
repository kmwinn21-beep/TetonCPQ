# Resources tab on the shared link (mocks, in progress — not built)

A lite deal room beside the proposal on the prospect's link.

## Prospect side (room-*.png)
- Top bar: Proposal | Resources (tab name defaults to "Resources"; the rep can rename it), with a count of new items.
- Left panel: summary cards in sections (Start here → Your Team; Decks & documents; Case studies; Recordings; custom sections). Selected card outlined; blue dot = new since their last visit.
- Right: the selected item. Your Team (landing page): "{customer}'s Teton Team", the owner's large card (photo, title, email, phone, note, Email / Book a meeting / Call) and teammates (photo, name, title, a line for this deal, contact). Recording: player, chapter marks, key moments, summary. Deck: slide viewer, thumbnails, Download.
- Phone: cards become a sideways row above the content.

## Rep side (res-*.png)
- Share dialog: a "Resources tab" section (on/off, item count, team avatars, engagement line, "Edit Resources →").
- Full-screen editor: tab name, Preview as prospect, Activity, Done. Left: the same cards with drag handles, ⋯ menu, hidden cards dimmed, per-card engagement (opened by, time, downloads, clicks), section Rename, "+ Add to Resources" (Upload a file / Embed a video / Add a link / Add a one pager / New section). Right: the selected item's form.
- Your Team form: heading with {customer}, note, main contact from the owner's profile (Change, Edit your profile, Book a meeting switch with scheduling link), teammates picked from users (drag to reorder, per-deal line, remove).
- Item form (recording): title, section, card description, source (file / embed / link, Replace), allow download, show to prospect, key moments, summary, who's watched it.

## Decisions so far
1. Tab name defaults to "Resources"; customizable.
2. Name, title, photo, phone come from each user's profile (needs profile fields + photo upload).
3. Editor as mocked (rep side).
4. Sources: uploaded files (incl. video), embed links (videos play in the page), and plain hyperlinks (open in a new tab).
5. Engagement tracking built in-house from the signed-in prospect: opens, time on item, video progress (our player; YouTube/Vimeo via their player APIs), downloads, link clicks (through a redirect). No third-party tools.

## Notes for building
- Uploads are stored in the database today (floor plans). Fine for PDFs; video needs file storage (e.g. Vercel Blob, already in the hosting stack) and size limits.
- Hyperlinks can't be shown inside the page (most sites block framing), so they open in a new tab.
