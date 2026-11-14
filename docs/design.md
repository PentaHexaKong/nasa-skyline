# Design

Brand direction. The tokens live in `frontend/src/styles.css`.

## Colour only ever means something

Black and white carry the interface. A viewer should learn that any colour on screen is telling them something about the Moon or about time.

The app is dark only. Light token values exist but are unused.

| Role | Token | Dark | Light (unused) | Use it for |
| --- | --- | --- | --- | --- |
| Canvas | `--color-kumo-canvas` | `#000` | `#fff` | The page |
| Action | `--brand` | `#fff` | `#000` | Primary buttons, the active page, pips |
| Sun | `--sun` | `oklch(0.82 0.15 75)` | `oklch(0.56 0.13 72)` | Sunlight data only |
| Earth | `--comms` | `oklch(0.8 0.11 215)` | `cyan-600` | Earth and comms-target data only |
| Now | `--now` | `#fc3d21` | `#d93216` | The current-moment marker on time charts, and alerts |
| Relay | `--relay` | `oklch(0.76 0.16 330)` | `oklch(0.52 0.18 330)` | Relay data only, always dashed |

- Never use an accent for decoration, hover states or emphasis in copy.
- Never encode a state by colour alone. Relay pink and Earth cyan merge under simulated deuteranopia, so relays must be dashed.
- Do not use lime or another yellow-green. It merges with the Sun amber under deuteranopia.
- Each dark-mode accent reaches at least 5.8:1 on black. Each light-mode accent reaches at least 4.5:1 on white.

## Type

- Barlow for text and headings, at 400, 500 and 600. DM Mono for stand-alone numbers and small labels (`readout`, `eyebrow`).
- Headings are sentence case at weight 500, with no tracking changes.
- Wide-tracked capitals are for the wordmark and the top navigation only.

## Structure

Two modes in the top navigation: **Explore** (the public and classrooms, one page at `/`) and **Analyze** (mission planners). Method sits on the right and in the footer. Explore and Understand are one mode; there is no separate Understand mode.

### The Explore page (`/`)

- One scroll, one Moon. The Moon (`ParallaxMoon.tsx`, the same NASA colour, relief and LOLA polar cap as the space scene) stays fixed while chapters scroll over it, and turns to the place each chapter is about. Only the camera follows the scroll. Sunlight and the point under Earth come from the pipeline's SPICE ephemeris at a moment printed in the corner, never from a made-up angle; in the two "sweep" chapters that moment runs through one synodic month as the reader scrolls.
- Every chapter gives one finding computed from the pipeline output when the page runs, then opens the full tool behind it: the guess-first lesson, the 3D site, the planner. The opening screen lists the chapters, and a chapter bar under the header shows where the reader is, so nothing is hidden behind a click.
- Order: a lunar day, a hidden Sun, high ground, Earth contact, compare sites, the true-scale scene (embedded; the wheel and swipes keep scrolling the page until the reader opens it full screen), then the lesson list for classrooms and the hand-off to Analyze. After the scene the Moon steps back and sets before the planner's table.
- The page is dark, like the 3D scenes. Text sits on solid canvas: a fade from the left on wide screens; on phones a panel that rises over the Moon as black fog, thickening at its top and thinning out over its empty bottom padding, so the next chapter's Moon comes up through it rather than from a hard edge. Site dots are white with a dark rim, since they sit on the Moon's imagery. The point under Earth is a thin cyan ring lying flat on the ground, with its month-long path as a thin line and a sentence in chapter 04 saying what it is; never a filled ball, which reads as a small Earth in orbit. No other colour is added to the Moon.
- The Moon swaps sides from chapter to chapter on wide screens (right, left, right…); the text takes the other side. On narrow screens it stays above the text and only sways a little.
- The true-scale scene (06) has one Moon: in its Moon view the page Moon draws it from the scene's camera, over the scene's own starry sky, and the scene draws its full frame only for the other views and in full screen (`moonBridge.ts`). The sky's top and bottom edges fade into the page over `--sky-fade` (3rem); the chapter's text and dock stay clear of those fades.
- Reduced motion: the camera snaps to each chapter's pose instead of easing, and jumps scroll without smoothing.
- `/explore` and `/understand` redirect to `/#space` and `/#lessons`; `/explore/$siteId` and `/understand/$lessonId` stay as the deeper pages.

- One screen, one question, one visual. Caveats and provenance live on Method, not repeated on every screen; the claims line stays in the footer.
- Explore uses plain states ("In view", "Behind the ridge"), not degrees. Degrees belong to Analyze.
- A lesson is predict, then the real data, then why. Every number on a lesson is computed from the pipeline output when the page runs; never type one into the copy.
- Analyze, Dates: a landing day that works is drawn in colour, the Sun's amber over Earth's cyan, since both are in view at touchdown; near misses are a thin neutral bar and hidden days an empty track, so status also reads from shape. Result names the answer per site ("This landing: Works / No" with the reason) apart from the count of stay limits met.
- Mission profiles are starting points for Analyze. Their thresholds are examples and say so. Each opens on a day when at least one of its sites works (`profiles.test.ts`).
- Earth rehearsal sites appear only on Method and their own site reports, never in the Moon pickers.

## Planner (Analyze)

The Planner is one flow in four steps: Set up, Result, Dates, Review. The step and every setting live in the URL, so a link reopens the same plan. It opens on Result, because the answer comes first.

- Result leads with a sentence that states the verdict, generated from the same record the table reads. Do not add a composite score or a ranking.
- A landing works only when the Sun and Earth are both in view at touchdown and every requirement holds over the stay.
- Mark a missed value with a red × beside it. Do not dim it.
- A slip is measured from the date it started at, and each value shows its change from that date.
- Time we did not compute is "not computed", never zero.
- Review connects missed whole-stay Sun and Earth limits to mast and relay investigations, without a composite score or a hardware ranking. Try another date and compare sites stay first; rover reach is an optional exploration follow-up. All three tools remain accessible.
- Scenario pages keep the plan settings in the URL and return to the same Review. The original baseline stays visible. Sample previews reuse the prototype visuals with Kumo controls, are explicitly labelled, and are available only in development. A sample is never compared numerically with the user's baseline.
- Review choices use three compact cards in one row on desktop (stacked below 1024 px): an outline tool icon, a short title, one line and a navigation arrow. Follow-ups for missed limits appear first in the same row. Reasons, threshold readings and long review notes are collapsed by default; missed Sun/Earth limits stay visible in each relevant summary. Static tool identifiers may use the existing Sun, relay and comms colours. This exception is limited to those icons; neutral corner brackets indicate interaction, without changing colour to imply a result. Bracket/arrow movement is disabled under reduced motion.

## Identity

The wordmark is SKYLINE in Montserrat 500 outlines, with a Y drawn as one tilted, thick-to-thin loop. It lives in `frontend/src/components/Wordmark.tsx`, needs no font loading, and takes the text colour. The icon and favicon are that curve alone, without the Y's straight arm, white on a black tile, with a heavier cut for small sizes.

The reference is the restraint of aerospace sites: black, white, and little else. Do not use SpaceX's or NASA's logos, wordmarks or insignia. Third parties may not use NASA's (14 CFR 1221).
