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

Three ways in, numbered in the top navigation as the storyboard draws them: **01 Explore** (the curious public, `/explore`), **02 Understand** (classrooms and anyone who wants to experiment, `/understand` and the lab at `/understand/lab`) and **03 Analyze** (mission planners, `/analyze`). Method sits on the right and in the footer. `/` is the front door: "What brings you to the Moon?" with one mascot and one button per way in. It has no header (the three doors are its navigation); the accurate globe (`HorizonMoon.tsx`) rises from the bottom edge, past first quarter so the terminator crosses it, turning slowly on its axis, and never reaching the text. Reduced motion holds it still.

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

- Set up opens on a mission carousel: a large still terrain preview beside the profile's real example limits, then the mission cards and previous/next controls. Browsing previews leaves the plan intact until Select mission or Enter applies a supported profile. The bars show the actual thresholds and stay, without a synthetic demand score. Four profiles are supported; Pole versus equator is labelled not computed and cannot be applied.
- The site picker follows the carousel: a rotatable 3D Moon, labels connected to the actual pipeline coordinates, and a selected-site list. The three polar points are close together at this scale; the labels are spread for readability. Works comes from the same touchdown and stay checks as Result. At least one site stays selected. Date, time and limit controls follow, with the current verdict and See the result in one card. A stay beyond coverage is not computed.
- Drag with a mouse or two fingers to rotate the Moon; labelled direction and reset buttons also support a keyboard. One finger scrolls the page. The globe uses preview textures, renders only on changes and stops drawing off screen or in a hidden tab; reduced motion disables damping. A static preview remains available when 3D cannot load. The drawn orbit and descent are illustrations, not mission trajectories.
- Result, top to bottom: the landing feasibility summary (the verdict headline from `verdict()`, how many sites work, how many miss, the next day that works) over a dark lunar backdrop; one card per site, its picture being its own computed skyline, with Works or Doesn't work, its skyline with the Sun and Earth at touchdown and three readings; the full table; the touchdown details (collapsed); "What should you do next?" for one chosen site; the live check against the mission-science service; the brief, the plan link and "Before you decide".
- Dates: the landing-opportunity summary with good days per site, the year's availability strip (green full bar works, dark-green half bar misses a stay limit, empty track otherwise, a red line on the first available day), and one window card per site whose other windows open on click.
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
