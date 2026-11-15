# Skyline system design

Drawn from the code as of 2026-11-15, after the international site catalogue merged (`compose.yaml`, `frontend/nginx.conf`, `backend/*.go`, `services/*/api.py`, `ds/pipeline`, `frontend/src`). Where this disagrees with [overview.md](overview.md), the code wins: overview.md predates the mission-science, relay and rover services.

1. [System context](#1-system-context)
2. [Containers and runtime topology](#2-containers-and-runtime-topology)
3. [Offline data path (static-first)](#3-offline-data-path-static-first)
4. [Gateway routing table](#4-gateway-routing-table)
5. [Live check: scientific evaluation](#5-live-check-scientific-evaluation)
6. [Relay comparison (Go orchestrates two services)](#6-relay-comparison-go-orchestrates-two-services)
7. [Mast power and placement (long-running)](#7-mast-power-and-placement-long-running)
8. [Rover reachability](#8-rover-reachability)
9. [Scenario feed lifecycle](#9-scenario-feed-lifecycle)
10. [Frontend structure](#10-frontend-structure)
11. [Contracts and schema flow](#11-contracts-and-schema-flow)
12. [Deployment: Compose services, volumes, profiles](#12-deployment-compose-services-volumes-profiles)
13. [Planner user journey](#13-planner-user-journey)
14. [Site routing: polar or global terrain](#14-site-routing-polar-or-global-terrain)

---

## 1. System context

```mermaid
flowchart LR
    planner(["Mission planner"])
    educator(["Educator / public"])
    dev(["Maintainer"])

    subgraph skyline["Skyline"]
        app["Web app<br/>static pre-rendered + live checks"]
        science["Scientific services<br/>SPICE + LOLA terrain"]
    end

    naif[("NAIF SPICE kernels<br/>DE440, MOON_ME frame")]
    lola[("LOLA terrain<br/>PGDA south-pole DEMs (80 m, 240 m)<br/>global LDEM_16 (~1.9 km)")]
    papers[("Published sources<br/>De Rosa 2012, IM relay paper,<br/>LROC and mission landing coordinates,<br/>NASA imagery (GIBS, SVS, SDO)")]

    planner -->|"compare sites & dates,<br/>run scenarios"| app
    educator -->|"explore & lessons"| app
    dev -->|"run pipeline, export feeds"| science
    app -->|"/api/* live checks"| science
    naif --> science
    lola --> science
    papers -->|"site coords, relay orbits,<br/>textures"| science
```

## 2. Containers and runtime topology

```mermaid
flowchart TB
    browser["Browser<br/>React SPA, pre-rendered HTML"]

    subgraph edge["frontend container (:80, published :8080)"]
        nginx["Nginx<br/>static files + /api reverse proxy<br/>legacy-URL 301s"]
        static[("Static build<br/>44 pre-rendered pages<br/>generated JSON, terrain .bin,<br/>feeds, textures")]
    end

    subgraph gw["backend container (:8080, internal)"]
        go["Go gateway (net/http ServeMux)<br/>envelope validation, 1 MiB limit,<br/>request IDs, JSON logs,<br/>per-route deadlines, graceful shutdown"]
    end

    subgraph sci["Scientific services (Python)"]
        ms["mission-science :8014<br/>FastAPI · skyline_mission_science<br/>evaluate, compare, optimize,<br/>scientific contract v1, reference evaluations,<br/>mast power, mast placement, site catalogue<br/>polar 80 m + global exploratory terrain"]
        ra["relay-adapter :8015<br/>FastAPI · skyline_relay_adapter<br/>relay candidates + link evaluation"]
        rv["rover-science :8016<br/>FastAPI · skyline_rover_science<br/>south-pole study sites only"]
        se["scientificengine :8003<br/>INT-4 adapter<br/>profile: legacy"]
    end

    subgraph stubs["Stubs (off critical path)"]
        ds["ds :8001<br/>/analyze echo stub"]
        ml["ml :8002<br/>/predict echo stub, ADR-0003"]
    end

    assets[("Shared raw assets (read-only)<br/>SPICE kernels + DEMs,<br/>SHA-256 pinned")]
    caches[("Named volumes<br/>horizon / intermediate caches")]

    browser -->|"GET pages, JSON, .bin"| nginx
    nginx --- static
    nginx -->|"/api/*"| go
    go -->|"/api/mission-science/*"| ms
    go -->|"/api/relay-engineering/*"| ra
    go -->|"/api/relay-engineering/compare<br/>(environment leg)"| ms
    go -->|"/api/rover-science/*"| rv
    go -->|"/api/scientificengine"| se
    go -->|"/api/run"| ds
    go -.->|"/api/run, run_ml"| ml
    rv -->|"ROVER_RELAY_COMPARE_URL<br/>stationary relay replay"| go

    ms --- assets
    ra --- assets
    rv --- assets
    ms --- caches
    ra --- caches
    rv --- caches
    se --- caches
```

## 3. Offline data path (static-first)

The default path ([ADR-0001](../decisions/0001-static-first-hybrid-architecture.md)): the site works with no server running, because every baseline number is computed ahead of time.

```mermaid
flowchart LR
    subgraph inputs["Pinned inputs"]
        k[("SPICE kernels")]
        dem[("LOLA DEMs")]
        sites["ds/pipeline/sites.py<br/>CR1, GR1, SR1, Apollo 11,<br/>Shackleton ridge (+ parked sites)"]
        orbits["relay_orbits.json"]
    end

    subgraph pipe["ds/pipeline (Python 3.12, uv) · algorithm 0.4.0"]
        fetch["fetch.py<br/>download + checksums.json"]
        terrain["terrain.py<br/>horizon / skyline"]
        sun["sun.py · moon.py<br/>SPICE Sun & Earth tracks"]
        vis["visibility.py<br/>partial disk, 1 s event edges"]
        island["island.py<br/>local heightmap"]
        space["space.py<br/>ephemeris + texture bake"]
        pick["pick.py<br/>hill-top pick (PGDA 69)"]
        relay["relay_check.py<br/>orbit propagation check"]
        run["run.py<br/>365 days, 1 min step, 2 m observer"]
    end

    subgraph data["frontend/data (committed)"]
        siteJson["&lt;site&gt;.json"]
        terrBin["terrain/*.bin + .json"]
        moonJson["moon/space.json, ephemeris.json"]
        feeds["feeds/{mast,power,relay}/<br/>&lt;site&gt;.json + scenarios/*.json"]
    end

    subgraph build["frontend build (pnpm build)"]
        sync["scripts/sync-data.mjs<br/>split → summary + lazy tracks"]
        client["scripts/buildScientificClient.mjs<br/>schema → TS client"]
        vite["Vite + TanStack Start<br/>static pre-render"]
    end

    out[("dist → Nginx")]
    report["ds/validation/relay-orbits.md"]

    k & dem --> fetch --> terrain
    sites --> run
    terrain & sun --> vis --> run
    run --> siteJson
    island --> terrBin
    space --> moonJson
    orbits --> relay --> report
    pick -.-> run

    siteJson & terrBin & moonJson & feeds --> sync
    sync -->|"src/data/generated/<br/>*.summary.json, *.tracks.json, sites.json"| vite
    client --> vite
    vite --> out
```

## 4. Gateway routing table

```mermaid
flowchart LR
    subgraph nginx["Nginx location → proxy_read_timeout"]
        n1["= /api/mission-science/v1/mast-power-evaluations · 610 s"]
        n2["= /api/mission-science/v1/mast-placement-evaluations · 610 s"]
        n3["/api/mission-science/ · 100 s"]
        n4["/api/relay-engineering/ · 100 s"]
        n5["/api/rover-science/ · 610 s"]
        n6["/api/ · 30 s"]
    end

    subgraph go["Go handlers → upstream · deadline"]
        g1["/api/mission-science/v1/*<br/>allow-list: GET sites, capabilities, site-catalog;<br/>POST evaluate, scientific-evaluations,<br/>reference-evaluations,<br/>mast-power-evaluations, mast-placement-evaluations<br/>90 s (mast routes 10 min)<br/>checks response contract version"]
        g2["GET /api/relay-engineering/candidates"]
        g3["POST /api/relay-engineering/compare<br/>POST /api/relay-engineering/v1/relay-feed"]
        g4["POST /api/rover-science/v1/reachability-evaluations<br/>envelope validation"]
        g5["POST /api/scientificengine"]
        g6["POST /api/run<br/>JSON only, 1 MiB, unknown fields rejected,<br/>REQUEST_TIMEOUT 20 s"]
        g7["GET /livez · GET /healthz"]
    end

    subgraph up["Upstreams"]
        ms["mission-science :8014"]
        ra["relay-adapter :8015"]
        rv["rover-science :8016"]
        se["scientificengine :8003 /analyze"]
        ds["ds :8001 /analyze"]
        ml["ml :8002 /predict"]
    end

    n1 & n2 & n3 --> g1 --> ms
    n4 --> g2 --> ra
    n4 --> g3
    g3 -->|"/v1/evaluate"| ra
    g3 -->|"/v1/evaluate"| ms
    n5 --> g4 -->|"/v1/reachability-evaluations"| rv
    n6 --> g5 --> se
    n6 --> g6 --> ds
    g6 -.-> ml
```

## 5. Live check: scientific evaluation

`frontend/src/components/planner/LiveCheck.tsx` → `src/lib/missionScience.ts` / `scientificContract.ts`. Since commit `ae61eff`, an answer that arrives after its run was cancelled is dropped.

The request carries `localResolutionM`, which picks the terrain: 80 for the south-pole sites, 1895.21 for every other site ([section 14](#14-site-routing-polar-or-global-terrain)). The per-site reference page (`/analyze/$siteId`, `components/dynamicSiteReference.tsx`) follows the same path through `src/lib/referenceScience.ts`, but posts to `/v1/reference-evaluations` for one UTC day at a time, and fills the year one day after another in the background.

```mermaid
sequenceDiagram
    autonumber
    actor U as Planner
    participant FE as LiveCheck (React)
    participant NX as Nginx
    participant GO as Go gateway
    participant MS as mission-science
    participant FS as SPICE + DEM (ro)
    participant C as cache volume

    U->>FE: open Result → "check live"
    FE->>NX: GET /api/mission-science/v1/capabilities
    NX->>GO: proxy
    GO->>MS: GET /v1/capabilities
    MS-->>FE: supported sites, profiles
    FE->>NX: POST /api/mission-science/v1/scientific-evaluations<br/>(AbortSignal)
    NX->>GO: proxy (100 s)
    GO->>GO: allow-list route, 90 s deadline
    GO->>MS: POST /v1/scientific-evaluations
    MS->>C: horizon cache lookup
    alt cache miss
        MS->>FS: load kernels + terrain
        MS->>C: store horizon
    end
    MS-->>GO: skyline-scientific-response/1.0.0
    GO->>GO: verify contract version
    GO-->>FE: response (or typed scientific error)
    alt run cancelled meanwhile
        FE->>FE: discard stale answer
    else current run
        FE->>FE: zod-parse, compare with static baseline
        FE-->>U: live vs. pre-computed result
    end
```

## 6. Relay comparison (Go orchestrates two services)

```mermaid
sequenceDiagram
    autonumber
    participant FE as Relay scenario page
    participant GO as Go gateway<br/>relayEngineering.go
    participant RA as relay-adapter
    participant MS as mission-science

    FE->>GO: GET /api/relay-engineering/candidates
    GO->>RA: GET /v1/candidates
    RA-->>FE: relay candidates (IM Table 3 states)

    FE->>GO: POST /api/relay-engineering/compare
    GO->>GO: validate environment + relay request
    par relay leg
        GO->>RA: POST /v1/evaluate
        RA-->>GO: relay link windows (simultaneous-hop)
    and environment leg
        GO->>MS: POST /v1/evaluate
        MS-->>GO: direct-to-Earth windows
    end
    GO->>GO: align SPICE clocks (≤ 1 µs), merge,<br/>build RelayFeed v1 + scenario manifest
    GO-->>FE: direct vs. assisted availability
```

## 7. Mast power and placement (long-running)

```mermaid
sequenceDiagram
    autonumber
    participant FE as Mast scenario page
    participant NX as Nginx (610 s)
    participant GO as Go gateway (10 min)
    participant MS as mission-science

    FE->>NX: POST /v1/mast-power-evaluations<br/>site, heights 0/2/10/30 m, panel geometry
    NX->>GO: proxy
    GO->>MS: forward
    MS->>MS: height-specific terrain/SPICE eval,<br/>panel exposure (horizontal, vertical, tracking)<br/>cold ~17-19 s, memoized ~2.4 s
    MS-->>FE: skyline-mast-power-response/1.0.0

    FE->>NX: POST /v1/mast-placement-evaluations<br/>bounded search region
    NX->>GO: proxy
    GO->>MS: forward
    MS->>MS: exhaustive grid, DEM slope/elevation footprints,<br/>hard feasibility, 6-objective Pareto ranks<br/>~42-73 s at CR1
    MS-->>FE: skyline-mast-placement-response/1.0.0 (MastFeed)
```

## 8. Rover reachability

```mermaid
sequenceDiagram
    autonumber
    participant FE as Rover scenario page
    participant GO as Go gateway
    participant RV as rover-science
    participant RA as relay-adapter
    participant MS as mission-science

    FE->>GO: POST /api/rover-science/v1/reachability-evaluations
    alt ROVER_SCIENCE_URL unset
        GO-->>FE: typed "unavailable" error
    else configured
        GO->>GO: validate envelope (schema 0.1.0, proposed)
        GO->>RV: POST /v1/reachability-evaluations
        RV->>RV: DEM cells → observer engine →<br/>bounded time-expanded graph
        opt stationary relay admission
            RV->>GO: POST /api/relay-engineering/compare
            GO->>RA: /v1/evaluate
            GO->>MS: /v1/evaluate
            GO-->>RV: RelayFeed
        end
        RV-->>FE: reachable cells, relay admission<br/>(mobile relay unsupported)
    end
```

## 9. Scenario feed lifecycle

Feeds are computed once by a live service, written as immutable, content-addressed files, and then served statically.

```mermaid
flowchart LR
    subgraph exporters["Export scripts"]
        em["missionScience/scripts/<br/>exportMastFeed.py · exportPowerFeed.py ·<br/>exportScientificFeed.py"]
        er["relayAdapter/scripts/<br/>exportRelayFeed.py"]
    end

    live["Live services via Go<br/>(authoritative routes)"]
    files[("frontend/data/feeds/<br/>{mast,power,relay}/&lt;site&gt;.json<br/>…/scenarios/&lt;kind&gt;-&lt;sha256&gt;.json")]
    schemas["contracts/feeds/*.schema.json<br/>(from zod: feed-schemas.ts)"]
    fixtures[("frontend/fixtures/feeds/<br/>invented, dev-only")]

    subgraph app["Frontend: src/lib/feeds.ts + scenarios.ts"]
        load["load feed by path"]
        gate{"production build<br/>and file missing?"}
        parse["zod parse"]
        match{"site + period match,<br/>not a fixture?"}
        show["render panel"]
        soon["'Coming next: …'"]
        reject["reject as scenario result"]
    end

    em --> live
    er --> live
    live --> em & er
    em & er -->|"write immutable JSON"| files
    schemas -.->|"validate"| files
    files --> load
    fixtures -.->|"DEV + ?fixtures"| load
    load --> gate
    gate -->|yes| soon
    gate -->|no| parse --> match
    match -->|yes| show
    match -->|no| reject
```

## 10. Frontend structure

```mermaid
flowchart TB
    root["routes/__root.tsx · Shell"]

    subgraph routes["Routes (TanStack Router, file-based)"]
        home["/ Home<br/>three doors, one per audience"]
        explore["/explore<br/>scrolling chapters, Moon to ridge"]
        lesson["/understand<br/>lesson and simulation"]
        lab["/understand/lab"]
        analyze["/analyze<br/>planner: Set up → Result → Dates"]
        report["/analyze/$siteId<br/>per-site report"]
        scen["/analyze/scenario/$piece<br/>mast · relay · rover"]
        exp["/explore/$siteId<br/>3D landscape"]
        method["/method"]
        sites["/sites<br/>landing-site catalogue"]
    end

    subgraph comps["Components"]
        moon["ParallaxMoon · HorizonMoon · moonGlobe<br/>SpaceScene · SpaceChapter"]
        story["story.tsx · lessons.tsx · lab/*"]
        plan["planner/*<br/>SetupStep, ResultStep, DatesStep,<br/>LiveCheck, NextSteps, DeeperAnalysis"]
        charts["Panorama · Lanes · YearChart ·<br/>MonthTimeline · DayProfile · Intervals"]
        panels["PowerPanels · RelayPanels · FeedFrame"]
        island["SiteIsland · TerrainImage · explore/Landscape"]
    end

    subgraph lib["src/lib (pure logic, Vitest-covered)"]
        data["data.ts · useTracks<br/>summary + lazy tracks + terrain .bin"]
        time["time · mission · sky · target · moonLight"]
        prof["profiles.ts · investigation.ts · scenarios.ts"]
        feeds["feeds.ts · feed-schemas.ts (zod)"]
        live["missionScience.ts · scientificContract.ts<br/>(+ .generated.ts)"]
        spaceLib["space.ts · landscape.ts"]
    end

    gen[("src/data/generated/*")]
    api["/api/* via Nginx"]

    root --> routes
    home & explore --> moon & story & charts
    sites --> data
    lesson & lab --> story
    analyze --> plan & charts
    report --> charts & panels
    scen --> panels & plan
    exp --> island
    plan --> prof & live & time
    charts --> data & time
    panels --> feeds
    moon --> spaceLib
    island --> data
    data & feeds & spaceLib --> gen
    live --> api
```

## 11. Contracts and schema flow

```mermaid
flowchart LR
    subgraph py["Python (source of truth for science contracts)"]
        pyd["pydantic models<br/>scientificModels, mastPowerModels,<br/>mastPlacementModels, roverModels,<br/>relay schemas"]
        exp1["exportScientificSchemas.py ·<br/>exportSchemas.py · exportRoverSchemas.py"]
    end

    subgraph ts["TypeScript (source of truth for feed contracts)"]
        zod["feed-schemas.ts (zod)"]
        exp2["scripts/export-contracts.ts"]
    end

    contracts[("contracts/<br/>scientificRequest/Response,<br/>mastPower*, mastPlacement*,<br/>relayFeedV1, *Manifest,<br/>proposals/rover*, siteCatalog,<br/>feeds/*")]
    gen["scripts/buildScientificClient.mjs →<br/>scientificContract.generated.ts"]
    goChk["Go gateway<br/>checks response version strings"]
    examples[("examples/*.computed.json<br/>examples/*.fixture.json")]
    tests["schema tests<br/>(pytest, Vitest, go test)"]

    pyd --> exp1 --> contracts
    zod --> exp2 --> contracts
    contracts --> gen
    contracts -.-> goChk
    contracts --> tests
    examples --> tests
```

## 12. Deployment: Compose services, volumes, profiles

```mermaid
flowchart TB
    host(("host :8080"))

    subgraph profDefault["default profile"]
        fe["frontend<br/>Nginx :80<br/>health: /mission-science.html"]
        be["backend<br/>Go :8080<br/>health: /healthz"]
        ms["mission-science :8014<br/>health: kernelsPresent && terrainPresent"]
        ra["relay-adapter :8015<br/>health: filesPresent"]
        ds["ds :8001<br/>health: /healthz"]
        ml["ml :8002<br/>health: /healthz"]
    end

    subgraph profRover["default profile, rover image"]
        rv["rover-science :8016<br/>same image as mission-science,<br/>different uvicorn entrypoint"]
    end

    subgraph profLegacy["profile: legacy"]
        se["scientificengine :8003<br/>health: missionReady<br/>start_period 300 s"]
    end

    raw[("SKYLINE_MISSION_ASSET_ROOT<br/>→ /app/data/raw (ro)<br/>7 kernels + 2 polar DEMs,<br/>optional global LDEM_16")]
    states[("relayAdapter/data/states<br/>(ro)")]
    int4[("external/int4 checkout<br/>→ /science (ro)")]
    v1[("mission-science-cache")]
    v2[("relay-adapter-cache")]
    v3[("rover-science-cache")]
    v4[("scientificengine-cache<br/>scientificengine-mission-cache")]

    host --> fe
    fe -->|"depends_on healthy"| be
    be -->|"depends_on healthy"| ms & ra & ds & ml
    be -.->|"depends_on, required: false"| se

    raw --> ms & ra & rv
    states --> ra
    int4 --> se
    ms --- v1
    ra --- v2
    rv --- v3
    se --- v4
```

## 13. Planner user journey

```mermaid
stateDiagram-v2
    [*] --> Explore: land on /
    Explore --> Lesson: pick a lesson
    Lesson --> Explore
    Explore --> SetUp: "Plan a landing" (/analyze)

    state "Analyze planner" as Planner {
        SetUp: Set up · sites, profile, stay, touchdown
        Result: Result · Sun / Earth / Both lanes,<br/>At touchdown column, next steps
        Dates: Dates · year availability strip,<br/>landing windows
        SetUp --> Result
        Result --> Dates
        Dates --> Result
        Result --> LiveCheck: optional live run
        LiveCheck --> Result
    }

    Result --> MastScenario: Sun limits missed
    Result --> RelayScenario: Earth limits missed
    Result --> RoverScenario: optional reach
    Result --> SiteReport: open /analyze/$siteId
    SiteReport --> Explore3D: "Explore in 3D"
    MastScenario --> Result
    RelayScenario --> Result
    RoverScenario --> Result
```

## 14. Site routing: polar or global terrain

The catalogue decides how each site is computed. `frontend/data/catalogue/sites.json` (13 sites, exported from `services/missionScience/src/skyline_mission_science/siteCatalog.json` by `exportSiteCatalogue.py`) gives every site a `liveEvaluation` status and a `terrainResolutionM`. The `/sites` page lists them, and `src/lib/missionScience.ts` turns them into requests.

```mermaid
flowchart TB
    cat[("siteCatalog.json<br/>19 entries")]
    cat --> q1{"liveEvaluation<br/>starts with 'supported'?"}
    q1 -->|"no: unresolved or unverified<br/>coordinates, Earth test sites"| un["unsupported<br/>no request is sent"]
    q1 -->|yes| q2{"terrainResolutionM"}
    q2 -->|"80"| polar["Polar terrain<br/>LDEM_80S_80MPP 1-50 km<br/>LDEM_60S_240MPP 50-400 km"]
    q2 -->|"1895.21"| global["Global terrain, exploratory<br/>LDEM_16 1-400 km<br/>refused near the poles"]
    polar --> q3{"CR1, GR1 or SR1?"}
    q3 -->|yes| addons["Add-ons allowed:<br/>mast power, mast placement,<br/>rover reach, relay"]
    q3 -->|"no (Shackleton ridge)"| live["Live check, no add-ons"]
    global --> live2["Live check,<br/>labelled exploratory"]
```

| Group | Sites | Terrain | What runs |
| --- | --- | --- | --- |
| Study sites | Connecting Ridge (CR1), de Gerlache Rim (GR1), Shackleton Rim (SR1) | 80 m polar | Precomputed year, live check, every add-on |
| Polar comparison | Shackleton connecting ridge | 80 m polar | Precomputed year, live check |
| Apollo 11 | Apollo 11, Tranquility Base | 118 m global for the year, 1.9 km global for live checks | Precomputed year, live check |
| Other agencies' landings | Chang'e-4 (LROC 2019), Chang'e-6, SLIM (LROC 2024), Luna-25 impact | 118 m global for the year, 1.9 km global for live checks | Precomputed year, live check labelled exploratory |
| Other agencies' landings near 69°S | Chandrayaan-3, Luna-25 target | 60 m and 240 m polar for the year, 1.9 km global for live checks | Precomputed year, live check labelled exploratory |
| Unresolved | Chang'e-4 (Liu 2019), SLIM (PGDA surface coordinate) | none | Listed with the reason, never computed |

The table's "for the year" terrain is the offline pipeline's (`ds/pipeline/moon.py`, `terrain_for`): the 20 m to 240 m polar maps poleward of 75°S, the 60 m polar map to 100 km and the 240 m map to 200 km between 60° and 75°S, and the 118 m global map elsewhere, read across the ±180° seam when a site needs it.

The engine itself switches on the request's `localResolutionM` (`engine.py:52-57`), not on the site. The add-on services enforce their own limits: mast power, mast placement and rover reach refuse any site outside CR1, GR1 and SR1, and accept only 20 or 80 m terrain. [docs/science/engine.md](../science/engine.md) describes the calculation on each kind of terrain.
