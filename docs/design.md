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
| Story | `--story` | `oklch(0.56 0.2 275)` | (dark only) | The call-to-action button and the mascot's scarf on Home, Explore and Understand; never data |
| Flare | `--flare` | `oklch(0.66 0.19 33)` | (dark only) | The Understand lab's active step and its accent words, as the storyboard draws them; never data |
| Works | `--go` | `oklch(0.76 0.15 155)` | (dark only) | Analyze only: a landing or day that works, always with a tick or the word |
| Misses | `--miss` | `oklch(0.7 0.17 25)` | (dark only) | Analyze only: a site that does not work or a missed limit, always with a cross or the word |

- Never use an accent for decoration, hover states or emphasis in copy.
- Never encode a state by colour alone. Relay pink and Earth cyan merge under simulated deuteranopia, so relays must be dashed.
- Do not use lime or another yellow-green. It merges with the Sun amber under deuteranopia.
- Each dark-mode accent reaches at least 5.8:1 on black. Each light-mode accent reaches at least 4.5:1 on white.

## Type

- Barlow for text and headings, at 400, 500 and 600. DM Mono for stand-alone numbers and small labels (`readout`, `eyebrow`).
- Headings are sentence case at weight 500, with no tracking changes.
- Wide-tracked capitals are for the wordmark and the top navigation only.

## Structure

Three ways in, numbered in the top navigation as the storyboard draws them: **01 Explore** (the curious public, `/explore`), **02 Understand** (classrooms and anyone who wants to experiment, `/understand` and the lab at `/understand/lab`) and **03 Analyze** (mission planners, `/analyze`). Method sits on the right and in the footer. `/` is the front door: "What brings you to the Moon?" with one mascot and one button per way in. It has no header (the three doors are its navigation); the accurate globe rises from the bottom edge, past first quarter so the terminator crosses it, turning slowly on its axis, and never reaching the text. Reduced motion holds it still. It is the same Moon as Explore's and Understand's: `MoonStage` keeps one Moon (`ParallaxMoon`) above the routes, each page only says where it should be, and taking a door glides that Moon from the horizon into the next page's first pose (1.6 s, eased at both ends; instant with reduced motion).

### Story pages: mascot, parallax, real data

- The mascot is the team's own drawing, cut from the storyboard into `frontend/public/mascot/`: the scarf explorer guides Explore, the scientist in glasses guides Understand and the planner with the clipboard guides Analyze. All three use the PNG cutouts in `mascot/cutouts/`, with opaque white lunar heads, transparent backgrounds and body interiors, the original coloured accents and a thin pale contour for dark backgrounds. The mascot says one short line in a white bubble; what it says is never the only place a fact appears.
- Parallax comes from scroll, never from a timer: a section's `--p` (0 to 1 as it crosses the screen) drives `.parallax` layers and `.zoom-in`; reduced motion holds them still.

### Explore (`/explore`)

- 1 Opening: the whole Moon (`ParallaxMoon.tsx`, centred pose), "Where would you land?", the explorer looking up, "Scroll to get closer". The Moon's light is the SPICE ephemeris at the moment printed in the corner.
- 2 Moment of discovery: the camera dives to the south pole and the screen fills with Shackleton Rim's real LOLA terrain, tilted into a landscape (`explore/Landscape.tsx`, `lib/landscape.ts`). The section is pinned for three screens; scroll (or the Ground, Sunlight and Earth tabs) walks the three questions. Ground shades the shape and pins the highest and lowest ground relative to the site; Sunlight traces terrain shadows for the lowest Sun of the first month that still reaches the site; Earth tints the ground with a direct line to Earth at the same hour. Shadows and sight lines are traced inside the 20 km tile only, and the page says so.
- 3 Pick a place: the true-scale scene (`#space`, with the Orbit view that used to be "Watch the Moon turn"), then one card per site with the storyboard's hook, a computed Sun and Earth share, and a key-insight panel with the explorer and a link to stand on the site in 3D.
- 5 Bridge: a dark starfield section with a blue orbit and the explorer facing the reader, "You've seen the place. Now change the conditions.", and "Try the light experiment" into Understand.

### Understand (`/understand`, `/understand/lab`)

- The landing ("A different place. A different perspective.") and four chapters over the turning Moon: a lunar day, a hidden Sun, high ground, Earth contact, each a finding computed from the site results. Each chapter keeps only its way into the 3D site; the guess-first step now happens in the lab.
- The learning-journey section has the question card on the left and a mascot with four clickable step cards on the right. Choose, Try, Observe and Explain open in a native modal over the same page, with a short entrance and exit. Escape, the close button and the backdrop close it; focus returns to its trigger. The standalone `/understand/lab` entry shows the same journey and accepts existing scenario links.
- The lab is four steps, one question at a time: Choose (three questions with still previews of their computed LOLA terrain; free orbit opens the model's orbit panel), Try (write a prediction), Observe (the 3D terrain model with Light & landscape / Play with orbit, a lunar-day slider, Sun and Earth readings, an optional 2D horizon diagram and comparison of the last two captured observations), and Explain (prediction and observations side by side, then the explanation and Markdown download). Notes stay in this browser tab; the exported link carries the scenario without the learner's words. Closing the modal unmounts its 3D model. The record preserves source provenance and visibility rules and compares the same last two observations as the screen.
- Stand-on-site links in Understand and its guided lessons are full clickable cards with the pointing explorer, a visible 3D label and an arrow. The whole card has a focus outline and a small hover movement; reduced motion holds it still.

### Shared rules for the story pages

- The 3D site view at `/explore/$siteId` and the lessons at `/understand/$lessonId` stay as the deeper pages.
- Reduced motion: the camera snaps to each pose, the parallax and orbit rings hold still and the lab's "Let's go" opens without the zoom.
- Scenery fades at the boundaries between the Moon, terrain and other sections. The closing starfields blend into the preceding scene with an overlapping gradient; text, mascots and controls retain their contrast.

- One screen, one question, one visual. Caveats and provenance live on Method, not repeated on every screen; the claims line stays in the footer.
- Explore uses plain states ("In view", "Behind the ridge"), not degrees. Degrees belong to Analyze.
- A lesson is predict, then the real data, then why. Every number on a lesson is computed from the pipeline output when the page runs; never type one into the copy.
- Analyze, Dates: a landing day that works is a full green bar, a near miss a half-height dark-green bar and a hidden day an empty track, so status also reads from shape. Result names the answer per site ("This landing: Works / No" with the reason) apart from the count of stay limits met.
- Mission profiles are starting points for Analyze. Their thresholds are examples and say so. Each opens on a day when at least one of its sites works (`profiles.test.ts`).
- Earth rehearsal sites appear only on Method and their own site reports, never in the Moon pickers.

## Planner (Analyze)

The Planner is one flow in three steps: Set up, Result, Dates. Result carries what Review used to, so the answer and the way forward are one page; an older `step=review` link opens Result. The step and every setting live in the URL, so a link reopens the same plan. It opens on Result, because the answer comes first.

- Analyze looks like the story pages: black canvas, white type, hairline frames, and section heads with the pip, a number and a short name. No tinted panels or gradients; green and red appear only as Works and Doesn't work, always with a tick or a cross.
- Set up is one screen that never scrolls, at any size: the Moon in the middle, lit by the SPICE Sun at the landing time, and four choices floating around it at uneven corners (01 Mission top left, 02 Sites top right, 03 When bottom left, 04 Limits bottom right). Each choice is plain text, its current value over a bracket underline, so the screen states the plan at a glance. A bar at the bottom holds the verdict from `verdict()`, each site's answer and See the result.
- Motion: each choice drifts in zero gravity, bouncing in any direction inside a small circle (16 px, 9 px on phones) with a faint pull home so its path curves, and leans with its motion; it also tilts toward the Moon and follows the pointer a little. Pointing or focusing wobbles it and shows a one-line description; a touch wobbles it as it opens. Choosing one pulls all four into the middle of the Moon along a spiral, faster as they fall, the chosen one first, while the WebGL camera zooms in (the picture stays sharp); the panel then opens from that corner: beside the Moon on wide screens, as a sheet under it on narrow ones. Closing throws the choices back out along the spiral with a small overshoot. The Moon sways slowly around its polar axis; Next and Back sit on the Moon itself and turn it once all the way round as the panel changes, Done on the last one. The camera turns, not the Moon, so the sunlit side stays the SPICE one for the landing time. The planner sits at the left of the answer bar, as if saying it, and its pose follows the answer. Escape and the close button return to the Moon and to the choice. Animations use opacity and the individual `translate`, `rotate` and `scale` properties only (Chrome, Edge, Safari 14.1+); reduced motion holds every drift, wobble, spiral, sway and turn still.
- 01 Mission: one card per supported profile with its pitch, all four limits and the stay. Choosing a card applies it; choosing the active card after an edit resets it. Pole versus equator is named as not computed and cannot be chosen. Thresholds are examples and say so.
- 02 Sites: a checklist of every computed site with its coordinates (°S, °E) and its answer on the day in view, with the reason when it does not work; at least one stays selected. A note states the frame, the light source, the Works rule and the claims limit. On the stage the Moon shows the sites as dots only.
- 03 When: landing day, stay and time, then the year: one row per chosen site, a full green bar where the landing works, a half dark-green bar where the stay misses a limit, an empty track otherwise, with a legend. Hovering previews a day on the Moon without changing the plan; dragging scrubs; releasing, clicking or the keyboard (arrows, Page Up/Down, Home/End) chooses it. Play runs through the year a day at a time and pausing keeps the day reached; the skip button jumps to the next day that works. A previewed day's answer comes from the plan's per-day statuses, the same rule as Result's Works; the chosen day's reason comes from `siteResult()`.
- 04 Limits: the four limits in two groups, Sunlight and Contact with Earth, each with one line saying what it means. A stay beyond coverage is not computed.
- The planner's Moon (`MissionMoon.tsx`) is the globe of Explore and Understand (`moonGlobe.ts`: NASA colour and relief, LOLA relief south of 75°S, the limb glow), seen from below the south pole and lit by the SPICE Sun at the plan's landing moment; the caption states that moment. A new day or time relights it and the camera turns smoothly to the sunlit side, until the reader turns the Moon themselves; reset faces the light again. Site dots sit on the pipeline coordinates; labels are spread beside the disc (in a row under it on narrow boxes) with leader lines, since the polar sites are pixels apart. There is no drawn orbit or descent.
- Drag with a mouse or two fingers to turn the Moon; labelled direction and reset buttons also support a keyboard. One finger scrolls the page. It loads the first-look maps first, renders only on changes and stops off screen or in a hidden tab; reduced motion snaps instead of easing. Without WebGL the site labels remain as a list.
- Result, top to bottom: the verdict (headline and detail from `verdict()`, which name what fails and the next days that work, and See every date) beside the same Moon with each site's answer; "What each site sees at touchdown", one card per site with its own computed skyline, Works or Doesn't work and the reason, the skyline with the Sun and Earth at touchdown and three readings; every limit site by site and the touchdown details (both collapsed); "What should you do next?" for one chosen site; the live check against the mission-science service; the brief, the plan link and "Before you decide".
- Dates: the next days that work as the headline with days that work per site, the year's availability strip (green full bar works, dark-green half bar misses a stay limit, empty track otherwise, a red line on the first available day), and one window card per site whose other windows open on click.
- The live check sends nothing until the reader asks. The service's answer is shown beside the pipeline's, row by row with its source, never merged or averaged.

- Result leads with a sentence that states the verdict, generated from the same record the table reads. Do not add a composite score or a ranking.
- A landing works only when the Sun and Earth are both in view at touchdown and every requirement holds over the stay.
- Mark a missed value with a red × beside it. Do not dim it.
- A slip is measured from the date it started at, and each value shows its change from that date.
- Time we did not compute is "not computed", never zero.
- "What should you do next?" connects missed whole-stay Sun and Earth limits to mast and relay investigations, without a composite score or a hardware ranking. Try another date and compare sites stay first; rover reach is an optional exploration follow-up. All three tools remain accessible.
- Scenario pages keep the plan settings in the URL and return to the same Result. The original baseline stays visible. Sample previews reuse the prototype visuals with Kumo controls, are explicitly labelled, and are available only in development. A sample is never compared numerically with the user's baseline.
- The follow-ups are three cards in one row on desktop (stacked below 1024 px): a drawn scene (labelled as a drawing), an outline tool icon, a short title, one line and "Open analysis". Follow-ups for missed limits appear first in the same row. Reasons, threshold readings and long review notes are collapsed by default; missed Sun/Earth limits stay visible in each relevant summary. Static tool identifiers may use the existing Sun, relay and comms colours. This exception is limited to those icons; neutral corner brackets indicate interaction, without changing colour to imply a result. Bracket/arrow movement is disabled under reduced motion.

## Identity

The wordmark is SKYLINE in Montserrat 500 outlines, with a Y drawn as one tilted, thick-to-thin loop. It lives in `frontend/src/components/Wordmark.tsx`, needs no font loading, and takes the text colour. The icon and favicon are that curve alone, without the Y's straight arm, white on a black tile, with a heavier cut for small sizes.

The reference is the restraint of aerospace sites: black, white, and little else. Do not use SpaceX's or NASA's logos, wordmarks or insignia. Third parties may not use NASA's (14 CFR 1221).
