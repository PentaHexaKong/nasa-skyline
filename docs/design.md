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

Three ways in, numbered in the top navigation as the storyboard draws them: **01 Explore** (the curious public, `/explore`), **02 Understand** (classrooms and anyone who wants to experiment, `/understand` and the lab at `/understand/lab`) and **03 Analyze** (mission planners, `/analyze`). Method sits on the right and in the footer. `/` is the front door: "What brings you to the Moon?" with one mascot and one button per way in. It has no header (the three doors are its navigation); the accurate globe rises from the bottom edge, past first quarter so the terminator crosses it, turning slowly on its axis, and never reaching the text. Reduced motion holds it still. It is the same Moon as Explore's, Understand's and Analyze's: `MoonStage` keeps one Moon (`ParallaxMoon`) above the routes, each page only says where it should be, and taking a door glides that Moon from the horizon into the next page's first pose (1.6 s, eased at both ends; instant with reduced motion). On Analyze's Set up it glides into exactly the view of the planner's own Moon (`MissionMoon`, which the reader turns and which carries the site pins) and hands over to it in one frame; leaving Analyze, it glides on from that view (`plannerBridge` in `moonBridge.ts`).

### Story pages: mascot, parallax, real data

- The mascot is the team's own drawing, cut from the storyboard into `frontend/public/mascot/`: the scarf explorer guides Explore, the scientist in glasses guides Understand and the planner with the clipboard guides Analyze. All three use the PNG cutouts in `mascot/cutouts/`, with opaque white lunar heads, transparent backgrounds and body interiors, the original coloured accents and a thin pale contour for dark backgrounds. The mascot says one short line in a white bubble. A bubble may carry a "Tell me more" (native `<details>`, closed by default) that opens the same idea in plain words a step further, with a link to the deeper chart or lesson: on Explore the explorer explains each of the three questions; on Understand the scientist asks each chapter's "ask the class" question and holds the lesson's why. The page never depends on the bubble being opened, and the short line is never the only place a fact appears.
- Parallax comes from scroll, never from a timer: a section's `--p` (0 to 1 as it crosses the screen) drives `.parallax` layers and `.zoom-in`; reduced motion holds them still.

### Explore (`/explore`)

- 1 Opening: the whole Moon (`ParallaxMoon.tsx`, centred pose), "Where would you land?", the explorer looking up, "Scroll to get closer". The Moon's light is the SPICE ephemeris at the moment printed in the corner.
- 2 Moment of discovery: the Moon dives toward the south pole and fades to black, then Shackleton Rim's real LOLA terrain fades in as a lit 3D landscape seen from orbit and its camera comes down onto the site, looking toward the steepest fall in the tile (`explore/Landscape.tsx`, `lib/landscape.ts`). The section is pinned; scroll (or the Ground, Sunlight and Earth tabs, active tab in the action white) walks the three questions, and at the end the camera climbs back out and the terrain fades before the Moon returns. A "Landing site" marker is always shown; the Sunlight look adds a Sun marker at its true direction, or at the screen edge pointing to it. Pins hidden behind terrain are not drawn. Ground shades the shape and pins the highest and lowest ground relative to the site; Sunlight traces terrain shadows for the lowest Sun of the first month that still reaches the site, and says it was picked for its long shadows; Earth tints the ground with a direct line to Earth at the same hour. Shadows and sight lines are traced inside the 20 km tile only, and the page says so.
- 3 Pick a place: the true-scale scene (`#space`; tabs offer Moon, Moon and Earth, and Orbit; the other views stay reachable from shared links), then one card per site with the storyboard's hook, a computed Sun and Earth share, and a key-insight panel with the explorer and a link to stand on the site in 3D.
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
- Site report: the skyline runs the whole horizon, north to north. The day profile has a Direct sun lane and says the rule (any part of the disk above the ridge). Method defines every term from the pipeline's conventions and states how sharp the horizon is per terrain band, with the pipeline's own known limits.
- Touchdown and stay are separate tests, and copy names which one failed; status words are Works and Doesn't work everywhere.
- Analyze, Dates: a landing day that works is a full green bar, a near miss a half-height dark-green bar and a hidden day an empty track, so status also reads from shape. Result names the answer per site ("This landing: Works / No" with the reason) apart from the count of stay limits met.
- Mission profiles are starting points for Analyze. Their thresholds are examples and say so. Each opens on a day when at least one of its sites works (`profiles.test.ts`).
- Earth rehearsal sites appear only on Method and their own site reports, never in the Moon pickers.

## Planner (Analyze)

The Planner is one flow in four steps: Set up, Result, Dates, Add-ons. Result carries what Review used to, so the answer and the way forward are one page; an older `step=review` link opens Result. The step and every setting live in the URL, so a link reopens the same plan. It opens on Result, because the answer comes first.

- Analyze looks like the story pages: black canvas, white type, hairline frames, and section heads with the pip, a number and a short name. No tinted panels or gradients; green and red appear only as Works and Doesn't work, always with a tick or a cross.
- Set up is one screen that never scrolls, at any size: the Moon, lit by the SPICE Sun at the landing time, and the four questions as a deck of cards in front of it. The heading introduces them ("Answer four questions to plan your landing"); each card is one question with its current answer: 01 What kind of mission?, 02 Where do you land?, 03 When do you land, and for how long? (the stay on a second line), 04 What must the site give you? The same question is the title of its panel. Answers state the choice only; whether the plan works is said once, in the bar at the bottom, with the verdict from `verdict()`, each site's answer and See the result.
- The deck: the four questions are one stack of cards low on the stage, just above the answer bar, small enough to leave most of the Moon in view; the three behind the front card peek out above it, each a little smaller and lighter. Beside it is one numbered point per question, the front one filled; there are no arrows, so a click on a point or on the card is all it takes. The front card shows its number, its question, the current answer, one line on what it is for and Answer. Moving forward (a point further on, or swiping the card) throws the front card off the stage, right then left in turn or the way it was swiped, and it rejoins the back of the stack; moving back (an earlier point) pulls a card in from the side.
- An open question sits on the Moon: the deck steps back, the camera moves in so the disc glows around the question's form in the middle, and the questions before and after it stand on either side as cards turned toward it in perspective (after the Spyker case study by Thomas Gertenbach). Opening grows the form out of the deck's front card and fans the side cards out from behind it; a side card, the arrows in the form's header, a swipe across the header or the left and right keys slide the row, the card reaching the middle becoming the form, while the Moon turns once around. On phones the side cards show as slivers at the edges. Escape and the close button shrink the form back into its card and bring the deck forward. The light caption sits in a dark pill above the row. The Moon sways slowly; the camera turns, not the Moon, so the sunlit side stays the SPICE one. The planner sits at the left of the answer bar, as if saying it, and its pose follows the answer.
- When the device asks for reduced motion and the site's Motion setting is System, a note under the header says animations are paused and why (on Windows, Animation effects off), with Turn motion on (the same as Motion: On) and a close button; it does not return in that tab once closed.
- How the motion stays smooth: cards move by `transform` and opacity only (a throw runs on the Web Animations API with the card's transition set aside until it is back in the stack); the panel grows by a transform from the card's box (FLIP), not a clip, so nothing repaints while it moves; its contents are built as the grow settles, the year strip a moment later, and every panel's contents are built once, hidden, while the page is idle so a first opening costs what a second one does. Nothing blurs what is behind it over the live Moon. Reduced motion (the OS setting, or Motion: Reduced in the header) moves everything without animation; Motion: On animates even when the OS asks for less.
- 01 Mission: one card per supported profile with its pitch, all four limits and the stay. Choosing a card applies it; choosing the active card after an edit resets it. Pole versus equator is named as not computed and cannot be chosen. Thresholds are examples and say so.
- 02 Where: a checklist of every computed site with its coordinates (°S, °E) and its answer on the day in view, with the reason when it does not work; at least one stays selected. A note states the frame, the light source, the Works rule and the claims limit. On the stage the Moon shows the sites as dots only.
- 03 When: landing day, stay and time, then the year: one row per chosen site, a full green bar where the landing works, a half dark-green bar where the stay misses a limit, an empty track otherwise, with a legend. Hovering previews a day on the Moon without changing the plan; dragging scrubs; releasing, clicking or the keyboard (arrows, Page Up/Down, Home/End) chooses it. Play runs through the year a day at a time and pausing keeps the day reached; the skip button jumps to the next day that works. A previewed day's answer comes from the plan's per-day statuses, the same rule as Result's Works; the chosen day's reason comes from `siteResult()`.
- 04 Limits: the four limits in two groups, Sunlight and Contact with Earth, each with one line saying what it means. A stay beyond coverage is not computed.
- The planner's Moon (`MissionMoon.tsx`) is the globe of Explore and Understand (`moonGlobe.ts`: NASA colour and relief, LOLA relief south of 75°S, the limb glow), seen from below the south pole and lit by the SPICE Sun at the plan's landing moment; the caption states that moment. A new day or time relights it and the camera turns smoothly to the sunlit side, until the reader turns the Moon themselves; reset faces the light again. Site dots sit on the pipeline coordinates; labels are spread beside the disc (in a row under it on narrow boxes) with leader lines, since the polar sites are pixels apart. There is no drawn orbit or descent.
- Drag with a mouse or two fingers to turn the Moon; labelled direction and reset buttons also support a keyboard. One finger scrolls the page. It loads the first-look maps first, renders only on changes and stops off screen or in a hidden tab; reduced motion snaps instead of easing. Without WebGL the site labels remain as a list.
- Result and Dates are set like an editorial spec sheet, after Awwwards references such as NASA Spacecrafts and A Spacecraft for All: large figures, DM Mono labels, hairline rules instead of boxes, pill buttons. Result, top to bottom: a cover (how many sites work as one large figure, the verdict's headline and detail from `verdict()`, See every date, the Moon at the landing moment with each site's answer) over a strip of the plan's four facts (mission, landing, stay, next day that works), with what changed since a slip's start; the recommended plan; "What each site gives you", one column per site on a hairline grid with its coordinates, Works or Doesn't work and the reason, its skyline with the Sun and Earth at touchdown, the Sun and Earth at touchdown, and every limit as a meter (the reading over the stay, a white tick at the limit, a red × beside a missed value, its margin to the limit ("≥ 70 % · 1.7 pts spare", in red when short), the change since the slip's start); "Take it with you" (the brief, the plan link, the dates and the live check against the mission-science service); and "Behind the numbers" (the stay hour by hour, "Before you decide", sources and more analysis, collapsed).
- Dates: "When can you land?" with the next days that work in words, then each site's next day that works set large with its count of days that work; the year as the large strip (the same strip as Set up's: one row per site, full green bar works, half dark-green bar misses a stay limit, empty track otherwise; hover shows a day and names each site's status under it, drag, play or click chooses one, the skip button jumps to the next day that works); and every window per site as a chip (dates and length), the one holding the chosen day filled, one tap to plan around it.
- The live check sends nothing until the reader asks. The service's answer is shown beside the pipeline's, row by row with its source, never merged or averaged.

- Result leads with a sentence that states the verdict, generated from the same record the table reads. Do not add a composite score or a ranking.
- A landing works only when the Sun and Earth are both in view at touchdown and every requirement holds over the stay.
- Mark a missed value with a red × beside it. Do not dim it.
- A slip is measured from the date it started at, and each value shows its change from that date.
- Time we did not compute is "not computed", never zero.
- Result opens with a recommended plan under the verdict: the site and date that work (or that none does, and the next day that would), then one row per add-on for the site in focus, naming the limits it misses and linking into Add-ons. No composite score and no ranking; it is built only from `verdict()`, `siteResult()` and `scenarioGuidance()`. The planner mascot explains it in plain words, with more behind "Tell me more".
- Add-ons is the fourth step, with a tab per tool (Mast, Relay, Rover; `piece` in the URL) and the site in focus. Each tab leads with its answer and a trust badge, then a segmented view switcher, then the numbers; the plan as it stands is collapsed below. Old `/analyze/scenario/…` links redirect into the step with every setting kept. Every number is computed for the plan or visibly labelled as an example:
  - Relay: the live comparison for the plan's stay, drawn In 3D (relays on the positions the service returned), Ladder, Dial and Gap ledger. Direct contact is Earth cyan, what relays add is dashed relay pink, and the elapsed seconds show while it computes.
  - Rover: a browser simulation over the whole 20 km LOLA tile and the whole stay, badged "Computed from LOLA terrain, not validated", with a relay count from none to four, a Map (ground only relays reach is striped) and a Days view, its approximations listed, and the rover service's nine squares below as an independent check.
  - Mast: a computed worked example (one mission-science run at Connecting Ridge) under a banner that names its site and day and says it is not computed for the plan. A computed placement that matches the plan comes first when one exists.

## Identity

The wordmark is SKYLINE in Montserrat 500 outlines, with a Y drawn as one tilted, thick-to-thin loop. It lives in `frontend/src/components/Wordmark.tsx`, needs no font loading, and takes the text colour. The icon and favicon are that curve alone, without the Y's straight arm, white on a black tile, with a heavier cut for small sizes.

The reference is the restraint of aerospace sites: black, white, and little else. Do not use SpaceX's or NASA's logos, wordmarks or insignia. Third parties may not use NASA's (14 CFR 1221).
