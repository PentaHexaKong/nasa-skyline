# frontend

The web app. Two modes, Explore (the public and classrooms) and Analyze (mission planners), plus a method page:

| Path                                                                           | Mode                                                                                                                                                                                                                                               | For                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `/?view=&day=&t=&from=`                                                        | Explore: one scrolling page. A fixed Moon (`ParallaxMoon.tsx`) turns to each chapter; the lessons as findings; the five sites compared; the true-scale scene (`#space`, `SpaceChapter.tsx`); the lesson list (`#lessons`); the hand-off to Analyze | the public, classrooms |
| `/explore/$siteId?day=&t=`                                                     | A site's 3D terrain with Sun and Earth, opened from the scene or a chapter                                                                                                                                                                         | the public, classrooms |
| `/understand/$lessonId`                                                        | A lesson: predict, see the real data, why. Lessons live in `src/components/lessons.tsx`                                                                                                                                                            | classrooms             |
| `/explore`, `/understand`                                                      | Redirect to `/#space` and `/#lessons` (route `beforeLoad`, and nginx for the static build)                                                                                                                                                         |                        |
| `/analyze?profile=`, `/analyze/$siteId?day=&t=`                                | Analyze: the four-step planner, started from a mission profile (`src/lib/profiles.ts`), and the full report for one site                                                                                                                           | mission planners       |
| `/analyze/scenario/mast`, `/analyze/scenario/relay`, `/analyze/scenario/rover` | Follow-ups from Review: investigate missed limits or explore further, with the mission settings retained                                                                                                                                           | mission planners       |
| `/method`                                                                      | Pipeline, sites, limits, credits                                                                                                                                                                                                                   | anyone checking        |

Static output only: every page is pre-rendered, nothing runs on a server (ADR-0001).

```bash
pnpm install
pnpm dev        # http://localhost:5173, data synced from data/
pnpm build      # static site in dist/client/, host it anywhere
```

With Docker, `docker compose up --build` from the repo root builds this app and serves it with Nginx on http://localhost:8080 (`/api/` is proxied to the Go backend).

Also served from `public/`: the concept demo at `/demo/` (dummy data, see `public/demo/UI_DEMO.md`) and the backend test page at `/integration.html`.

```bash
pnpm check      # Biome lint + format, TypeScript strict
pnpm test       # Vitest
```

## Stack

| Concern   | Choice                                                                        | Why                                                                                                                       |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Framework | TanStack Start (React 19, Vite 8), pre-rendered                               | Typed routes and URL state, static HTML for a fast first paint, server functions available later if the live path happens |
| Styling   | Kumo (`@cloudflare/kumo`) on Tailwind v4, plus our tokens in `src/styles.css` | Kumo is the base design system (tokens, 14px type scale, components); we polish on top                                    |
| Charts    | Own SVG components on `d3-scale` and `d3-shape`                               | A skyline panorama is too specific for a chart library                                                                    |
| 3D        | `three` (no r3f), one component, `SiteIsland.tsx`, lazy and browser-only      | WebGL terrain with shadows; kept out of the main bundle and the pre-rendered HTML                                         |
| Data      | `zod` at every boundary                                                       | URL search params and result JSON are parsed, not trusted                                                                 |
| Type      | Barlow (text), DM Mono (numbers, labels), self-hosted                         | DIN-style, plain and technical. See `../docs/design.md`                                                                   |
| Tooling   | Biome, Vitest, pnpm, TypeScript strict                                        | One fast linter/formatter; tests run in ~200 ms                                                                           |

UI controls come from Kumo (Button, ButtonGroup, Select, Popover + DatePicker, Collapsible, Badge, Link, Tooltip). Where Kumo can't express something we use Base UI (`@base-ui/react`, Kumo's own foundation) styled with Kumo tokens: the time slider, because Kumo's Slider can only format plain numbers. Icons: `@phosphor-icons/react`. Import Kumo per component (`@cloudflare/kumo/components/<name>`); the root entry only for `LinkProvider`.

Add when first needed, not before: TanStack Query (only if data stops being static), Playwright.

## Tokens

`src/styles.css` imports Kumo's styles before Tailwind, so Kumo's semantic tokens (`bg-kumo-canvas`, `text-kumo-subtle`, `ring-kumo-line`...) and type scale (xs 12 / sm 13 / **base 14 for content** / lg 16) are the base. On top:

1. **App aliases:** `bg`, `surface`, `line`, `ink`, `ink-muted`, `accent`... each points at a Kumo token. App code uses these names.
2. **Chart tokens Kumo has no word for:** `sun`, `comms`, `terrain`, `shade`, `daylight`, `grid`, `ink-faint`, defined with `light-dark()`.
3. **Sizes above Kumo's scale:** `text-xl` 20, `2xl` 24, `3xl` 32, `display` (landing headline), and `text-2xs` 11 for chart labels.

**Brand.** See `../docs/design.md`. Black and white carry the interface, and colour only ever means something: amber is the Sun, cyan is Earth, red is the current moment and alerts.

Mode is Kumo's: `<html data-mode="dark">`, and the app is dark only (a saved `theme` key in `localStorage` is ignored). Light token values exist but are unused. To restyle the neutrals in our own direction, override Kumo tokens in a `[data-theme="skyline"]` block (Kumo's FedRAMP theme shows the pattern), rather than editing the aliases.

Motion uses `--duration-fast` / `--duration-base`, which drop to 0 ms under reduced motion.

## Data flow

`scripts/sync-data.mjs` splits each pipeline result into `<site>.summary.json` (~13 KB gzip, pre-rendered into the HTML) and `<site>.tracks.json` (~140 KB gzip, lazy-loaded in the browser after first paint). Both land in `src/data/generated/` (gitignored, rebuilt by `dev` and `build`).

The 3D island reads `data/terrain/<site>.bin` (the inner tier, 513×513 Int16 metres, rows north to south) and its `.json` metadata, written by `ds` `pipeline.island` and copied as-is by `sync-data`, plus a veiled outer tier (`<site>.outer.bin`). The same scene fills `/explore/$siteId` (full view) and has an eye-level mode, and draws Earth as the comms target (`src/lib/target.ts` gives it as a `SkyTarget`). The `#space` chapter of `/` is the true-scale space scene (`src/components/SpaceScene.tsx`, wrapped by `SpaceChapter.tsx`; `gestures="page"` lets the wheel and swipes scroll the page until it is opened full screen): the Moon (textures in `public/moon/`, baked by `ds/pipeline/globe.py`), Earth, the Sun and the star sky (textures and their provenance in `public/space/`, baked by `ds` `pipeline.space textures`), placed and turned by `data/moon/space.json` (`pipeline.space ephemeris`, read through `src/lib/space.ts`). Camera presets: Moon (site dots, fly-in), Earth, Moon and Earth, Orbit, From Earth, Sun; `?scale=closer` draws Earth at a tenth of its distance in the outside views. Geometry helpers (azimuth to scene direction, heightmap sampling, sight-line ray march) live in `src/lib/sky.ts` with tests against the real Connecting Ridge heightmap.

Pages are pre-rendered for each site's default day. A shared `?day=` link applies after hydration, so the static HTML always matches what React renders first.

**Pipeline feeds.** Planner panels that need new science read JSON files from `data/feeds/`. See [frontend-feeds.md](../docs/architecture/frontend-feeds.md). Open `/analyze?fixtures=1` on the dev server to see them with invented example data.

**Review follow-ups.** Review prioritizes mast investigations for missed Sun limits and relay investigations for missed Earth limits over the whole stay. Rover reach stays an exploration follow-up; all three tools remain accessible even when the limits are met. The site picker chooses which site's conditions to investigate. Date changes and site comparisons remain the first alternatives. Scenario pages retain all validated planner settings, including the original slip date, and return to the same Review without marking an unchanged profile as edited.

Scenario pages show the computed baseline and accept scenario feeds only for the exact site and mission period with `origin: computed`. Missing, invalid, fixture or differently scoped feeds cannot imply an improvement. Rover results remain not computed until a feed contract and pipeline output exist. On the dev server, **Open sample preview** displays the existing Shackleton prototype visuals and their own settings, labelled as sample data. This preview is separate from the mission baseline and absent in production. The standalone `/prototypes/*` design-review pages remain available in development.
