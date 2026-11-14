# Research references

Every external source used while shaping the extension (planned relays, rover reach, power and masts) and the space scene, collected during research. Facts drawn from them, with "as of" dates, live in [data/sources.md](../data/sources.md#relays-rovers-and-surface-temperature), [ADR-0005](../decisions/0005-relay-coverage-and-rover-reach.md) and [scope.md](scope.md). Datasets the pipeline reads (LOLA, SPICE kernels, PGDA) and site sources are in [data/sources.md](../data/sources.md) and [data/sites.md](../data/sites.md).

Reliability key: **P** primary (agency, operator, peer-reviewed or archived paper), **S** secondary (press, aggregator, Wikipedia), **U** unverified or single-source claim. Schedules slip: re-check before quoting.

## Relay services and orbits

| Source | What it gave us | Key |
| --- | --- | --- |
| [SSTL Lunar Pathfinder Service Guide](https://www.sstl.co.uk/getmedia/edaaa697-405c-458d-8394-97f83130d54a/Lunar-Pathfinder-Service-Guide-V2-2.pdf) | Pathfinder orbit elements (indicative), link rates | P |
| [SSTL lunar mission services](https://sstl.co.uk/what-we-do/lunar-mission-services) | Pathfinder status ("due 2027") | P |
| [SSTL Lunar Pathfinder Mission Builder](https://sstl.co.uk/what-we-do/lunar-mission-services/lunar-pathfinder) | Existing public single-relay coverage tool | P |
| [ESA/SSTL slides, Jan 2024](https://bsgn.esa.int/wp-content/uploads/2024/02/02-SSTL-Lunar-ESTEC-Jan-2024-V3.pdf) | Earlier schedule; ESA–NASA access | P |
| [Firefly Blue Ghost Mission 2](https://fireflyspace.com/blue-ghost-mission-2) | Elytra role and NET 2027 | P |
| [Brack et al., AAS 25-758, IM Lunar Data Network design (NTRS)](https://ntrs.nasa.gov/api/citations/20250006883/downloads/AAS_25_758_LDN_design_v7.pdf) | Five-satellite orbits, per satellite | P |
| [NASA: leveraging lunar relays](https://www.nasa.gov/technology/space-comms/near-space-network/leveraging-lunar-relays) | IM contract, users, schedule | P |
| [IM Q2 2026 results summary (Investing.com)](https://www.investing.com/news/company-news/intuitive-machines-q2-2026-slides-record-revenue-18b-backlog-93CH-4858373) | Altus-1 on IM-3 ~Q1 2027 | S |
| [ESA/Telespazio Moonlight status, Feb 2026](https://ioag.org/Cislunar2026/Tuesday/02%20Lunar/1110%20Moonlight%20Programme%20Development%20Status_ESA%20TPZ_final.pdf) | Moonlight periods, semi-major axes, schedule | P |
| [Via Satellite, Jul 2026](https://www.satellitetoday.com/space-economy/2026/07/27/building-the-connectivity-backbone-for-the-next-era-of-lunar-exploration/) | Moonlight funding context | S |
| [NASA LCRNS](https://www.nasa.gov/goddard/esc/lcrns) | Programme scope | P |
| [NASA LunaNet and LCRNS slides, Mar 2025](https://ntrs.nasa.gov/api/citations/20250002120/downloads/LunaNet%20%20and%20NASA%20LCRNS%20-MGAconf%205Mar2025.pdf) | Coverage results (17–43% / 80–86% / 100%); orbits "defined by the provider"; LGAT | P |
| [UN ICG Lunar PNT presentation, Jun 2024](https://www.unoosa.org/documents/pdf/icg/2024/WG-B_Lunar_PNT_Jun24/LunarPNT_Jun24_01_02.pdf) | IOC phases; south-pole service volume | P |
| [NESC Academy LunaNet material](https://nescacademy.nasa.gov/downloadFile/1208) | Notional two-relay southern ELFO setup | P |
| [Tulip-shaped orbits for south-pole PNT and DTE relay (arXiv)](https://arxiv.org/pdf/2607.10482) | LCRNS sizing requirements (as cited) | P |
| [ELFO navigation constellation (arXiv 2510.16030)](https://arxiv.org/html/2510.16030v2) | Frozen-orbit Walker constellation coverage | P |
| [Lee and Cheung, JPL IPN Progress Report 42-175](https://ipnpr.jpl.nasa.gov/progress_report/42-175/175F.html) | South-pole coverage analysis with terrain | P |
| [Grebow, Ozimek, Howell, Folta 2008 (JSR)](https://engineering.purdue.edu/people/kathleen.howell.1/Publications/Journals/2008_JSR_GreOziHowFol.pdf) | Libration-point relays, STK workflow | P |
| [Trabacchin and Colombatti 2025, *Aerospace*](https://openpolar.no/Record/ftmdpi:oai:mdpi.com:%2F2226-4310%2F12%2F4%2F289%2F) | Constellation for continuous south-pole contact | P |
| [Complete Lunar Exploration Coverage Analysis](https://openpolar.no/Record/ftciteseerx:oai:CiteSeerX.psu:10.1.1.541.5524) | Coverage analysis background | P |
| [Joint age and coverage-optimal cislunar relaying (arXiv 2411.05655)](https://arxiv.org/pdf/2411.05655) | NSGA-II Pareto front on satellite count, data freshness and coverage for 40–90°S (accessed 2026-11-14) | P |
| [He et al., LPO and DRO constellation optimisation](https://research.buaa.edu.cn/en/publications/multi-objective-optimization-of-lunar-communicationnavigation-con/) | Multi-objective design using a precomputed orbit database (accessed 2026-11-14) | P |
| [Yang et al., constellation reconfiguration](https://re.public.polimi.it/retrieve/0e9c16ab-d3cf-4674-b38c-8816a876bd59/YANGS01-25.pdf) | Multi-objective extension from the south pole to the southern hemisphere (accessed 2026-11-14) | P |
| [Iiyama and Gao, LunaNet staged development](https://kdricemt.github.io/research/constellation) | Pareto-optimal staged architectures; project summary, not the paper (accessed 2026-11-14) | S |
| [NASA abstract on orbits for a lunar PNT constellation](https://ntrs.nasa.gov/api/citations/20240000536/downloads/Updated%20ION%20Joint%20Navigation%20Conference%20Abstract.docx) | Trade axes beyond coverage: satellite count, signal error, insertion and station-keeping costs (accessed 2026-11-14) | P |
| [WPI student GMAT project](https://users.wpi.edu/~msmith7/STEM_I.html) | GMAT illustration only | U |
| [Wikipedia: Queqiao-2](https://en.wikipedia.org/wiki/Queqiao-2) | Queqiao-2 status and conflicting orbits | S |
| [SpaceNews on Queqiao-2](https://spacenews.com/?p=357675) | Queqiao-2 launch | S |
| [SpaceNews on Crescent Space Parsec](https://spacenews.com/?p=147580) | Parsec announcement (status unknown) | S |

## Existing tools and how planning is done today

| Source | What it gave us | Key |
| --- | --- | --- |
| [NASA Glenn Lunar Site Analysis Software (LEW-20529-1)](https://software.nasa.gov/software/LEW-20529-1) | Terrain-mask illumination and communication; US release only | P |
| [Moon Trek line of sight (NTRS 20220010585)](https://ntrs.nasa.gov/citations/20220010585) | Terrain-aware link planning | P |
| [Characterizing sites with Moon Trek (JpGU 2020)](https://confit.atlas.jp/guide/event/jpgu2020/subject/PPS02-P12/date) | Moon Trek capabilities | P |
| [Celestial Mapping System abstract, LSIC 2025](https://ntrs.nasa.gov/api/citations/20250009664/downloads/CMS_Abstract_LSIC2025.pdf) | 3D line of sight; Moon Trek 2D limit | P |
| [NASA Lunar Site Selection (NTRS, 2023)](https://ntrs.nasa.gov/api/citations/20230016267/downloads/Lunar%20Site%20Selection.pdf) | Earth visibility as a site criterion | P |
| [Artemis base camp siting criteria deck](https://docs.google.com/presentation/d/1qThuKA1AqsDu07t4blwmiTCECd3IPgBI/htmlpresent) | Thresholds (illumination > 65%, DTE ≥ 50%) | U |
| [Sánchez-Lozano and Peña-Asensio 2024, MCDM site evaluation (arXiv 2406.19863)](https://arxiv.org/pdf/2406.19863) | Multi-criteria ranking of 1,247 locations | P |
| [Artemis III sites by mapping and algorithms (phys.org)](https://phys.org/news/2024-09-artemis-iii-sites-algorithm-techniques.amp) | Press on the MCDM paper | S |
| [NASA: Overview of mission planning for VIPER](https://www.nasa.gov/wp-content/uploads/2022/05/overview_of_mission_planning_for_the_viper_rover.pdf) | Site criteria; per-pixel lighting and Earth; safe havens | P |
| [VIPER planning, SpaceOps 2022](https://ntrs.nasa.gov/api/citations/20220008301/downloads/2022-06-02-spaceops-viper-planning.pdf) | Traverse rules | P |
| [Ennico-Smith et al., VIPER traverse planning (SSR 2023)](https://ntrs.nasa.gov/api/citations/20230004239/downloads/SSR2023-VIPER-Planning-Ennico.pdf) | Traverse planning method | P |
| [VIPER presentation, 2024](https://ntrs.nasa.gov/api/citations/20240007332/downloads/viper-2024-06-07.pdf) | Planning tools | P |
| [VIPER presentation, Apr 2025](https://ntrs.nasa.gov/api/citations/20250004148/downloads/viper-2025-04-24.pdf) | Planning update | P |
| [VIPER presentation, Apr 2026](https://ntrs.nasa.gov/api/citations/20260002876/downloads/viper-2026-04-29_v2.pdf) | Planning update | P |
| [VERVE, SpaceOps 2025](https://ntrs.nasa.gov/api/citations/20250003387/downloads/SpaceOps2025_VERVE_Final2.pdf) | 3D operations tool with shadows and DTE | P |
| [NASA PGDA product 69](https://pgda.gsfc.nasa.gov/products/69) | Average illumination and Earth visibility maps | P |

## Rover route planning

| Source | What it gave us | Key |
| --- | --- | --- |
| [Miao and Wei 2026, DIC3D-A* (*Remote Sensing* 18, 310)](https://www.mdpi.com/2072-4292/18/2/310) | Time-dependent A* with illumination constraints | P |
| [3ST-A* for Chang'E-7 (*Remote Sensing* 2025)](https://mdpi.com/2072-4292/17/9/1589) | Illumination preprocessing + modified A* | P |
| [Otten, CMU thesis](https://www.ri.cmu.edu/app/uploads/2018/01/thesis_otten.pdf) | Sun-synchronous routes with DTE constraints | P |
| [Otten, ICRA 2015](https://www.ri.cmu.edu/app/uploads/2018/01/ICRA2015_Otten_3109.pdf) | Same, conference version | P |
| [Planning for sun-synchronous lunar polar roving (figshare)](https://openpolar.no/Record/ftcarnmellonufig:oai:figshare.com:article%2F6721082) | Same topic | P |
| [TUM thesis on energy-aware traverse optimisation](https://mediatum.ub.tum.de/doc/1523360/1523360.pdf) | Thermal and illumination models for traverses | P |
| [A* with DWA for south-pole rovers (*JDSE* 2023)](https://journal.hep.com.cn/jdse/EN/1160129040759710506) | Navigation under weak communication | P |

## Power: vertical masts and grids

| Source | What it gave us | Key |
| --- | --- | --- |
| [NASA VSAT annual review, Sept 2023](https://ntrs.nasa.gov/api/citations/20230012849/downloads/GCD%20Annual%20Review%20VSAT%20September%202023%20Final.pdf) | VSAT goals, masts up to 20 m | P |
| [NASA BEACON executive summary](https://ntrs.nasa.gov/api/citations/20240015887/downloads/BEACON%20Exec%20Summary.pdf) | 10 kW near the south pole target | P |
| [Lockheed Martin: vertical solar arrays](https://www.lockheedmartin.com/en-us/news/features/2025/powering-the-moon--vertical-solar-arrays-charge-the-way-.html) | VSAT contractor work | P |
| [Astrobotic lunar surface power](https://www.astrobotic.com/lunar-delivery/lunar-surface-power/) | LunaGrid and VSAT | P |
| [Astrobotic VSAT-XL (SatNow)](https://www.satnow.com/news/details/3613-astrobotic-advances-xl-solar-arrays-for-lunar-power-infrastructure) | 30 m+, 50 kW mast | S |
| [LunaGrid announcement (SatNow)](https://www.satnow.com/news/details/126-astrobotic-announces-lunagrid-a-commercial-power-service-for-the-poles-of-the-moon) | Grid concept and goals | S |
| [LunaGrid feature (Leonard David)](https://www.leonarddavid.com/moon-power-needed-plug-into-lunagrid/) | Cable and charging; 1 km cable figure | U |
| [Astrobotic VSAT in TVAC (SatNews, Jul 2024)](https://news.satnews.com/2024/07/20/astrobotics-lunagrids-vertical-solar-array-technology-vsat-enters-tvac) | Testing status | S |
| [Blue Origin Power Tower (Universe Magazine)](https://universemagazine.com/en/solar-power-plant-for-the-moon-blue-origin-unveils-the-power-tower/) | 20 m, > 10 kW mast | S |

## Earth-side ground stations

| Source | What it gave us | Key |
| --- | --- | --- |
| [NASA pauses lunar ground station acquisition (DCD)](https://www.datacenterdynamics.com/en/news/nasa-puts-acquisition-plans-for-lunar-communications-ground-stations-on-hold/) | LEGS procurement on hold | S |
| [NASA SCaN presentation, Nov 2023](https://science.nasa.gov/wp-content/uploads/2024/08/day2-1010-2023-11-14-scan-presentation-to-planetary-science-advisory-committee-896c28.pdf) | LEGS plan | P |
| [Matjiesfontein LEGS site](https://www.matjiesfontein.com/nasa-lunar-communications-facility-matjiesfontein) | South Africa site | S |
| [LEGS brochure](https://essp.larc.nasa.gov/EVI-6/pdf_files/LEGS%20Brochure%20r20.pdf) | LEGS overview | P |
| [Lunar and Cislunar 101 (NTRS)](https://ntrs.nasa.gov/api/citations/20230015802/downloads/Lunar%20and%20Cislunar%20101.pdf) | Ground segment background | P |

## Lighting and landing

| Source | What it gave us | Key |
| --- | --- | --- |
| [NESC Artemis lighting paper (IAASS 2023)](https://ntrs.nasa.gov/api/citations/20230006313/downloads/IAASS%202023%20Paper_Final_24apr23.pdf) | Sun ≤ ~7° at candidate sites | P |
| [NASA Artemis lighting considerations brief](https://www.nasa.gov/wp-content/uploads/2023/03/artemis-lighting-considerations-overview-technical-brief-ochmo.pdf) | Low-sun constraints, cross-sun approach | P |
| [NESC: visual experience at the south pole](https://nasa.gov/centers-and-facilities/nesc/characterizing-the-visual-experience-of-astronauts-at-the-lunar-south-pole) | Lighting context | P |
| [NESC lunar lighting overview](https://ntrs.nasa.gov/api/citations/20220008695/downloads/NESC_lunar_lighting_NE_overview_submit3.pptx.pdf) | Sun angles 2–6° | P |
| [Artemis HLS update 2024](https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf) | Site requirements (latitude, lighting, slope, DTE) | P |
| [Artemis overview 2025](https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf) | Surface and approach lighting requirements | P |

## Surface temperature and ground truth

| Source | What it gave us | Key |
| --- | --- | --- |
| [Diviner seasonal polar products (2020)](https://www.diviner.ucla.edu/single-post/2020/07/20/new-diviner-seasonal-polar-data-products) | 240 m polar temperatures | P |
| [Diviner south-polar products on PDS (2022)](https://www.diviner.ucla.edu/single-post/new-diviner-south-polar-data-products-released-on-pds) | Finer seasonal bins | P |
| [Diviner on PDS Geosciences](https://pds-geosciences.wustl.edu/missions/lro/diviner.htm) | Archive | P |
| [Diviner derived bundle](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/) | Polar product files | P |
| [Diviner data page](https://www.diviner.ucla.edu/data) | Global maps | P |
| [Williams et al. 2019, seasonal polar temperatures](https://ui.adsabs.harvard.edu/abs/2019JGRE..124.2505W) | Method and citation | P |
| [NASA SVS Diviner south-pole temperatures](https://svs.gsfc.nasa.gov/cgi-bin/details.cgi?aid=3690) | Visual reference | P |
| [ISRO: first in-situ polar temperature (ChaSTE)](https://www.isro.gov.in/India_Bags_Credit_First-Ever_In-Situ_Measurement.html) | 355 K on a 6° slope vs ~330 K predicted | P |
| [EurekAlert on ChaSTE](https://www.eurekalert.org/news-releases/1075734) | Night low ~105 K | S |
| [ISRO Chandrayaan-3 data release](https://www.isro.gov.in/Release_of_Chandrayaan-3_science_data_to_the_Scientific_Community.html) | PRADAN archive | P |
| [Apollo heat flow (Nagihara 2018)](https://www.depts.ttu.edu/artsandsciences/images/faculty_staff/geosciences/seiich_nagihara/moon/Nagihara2018reserchJE005579.pdf) | Apollo 15/17 heat flow | P |
| [Apollo heat flow experiment (NTRS 19780005001)](https://ntrs.nasa.gov/citations/19780005001) | Original results | P |
| [Blue Ghost LISTER heat flow (EGU26-6066)](https://meetingorganizer.copernicus.org/EGU26/EGU26-6066.html) | Preliminary 13–14 mW/m² | P (abstract) |

## Rovers, landers and Artemis schedule

| Source | What it gave us | Key |
| --- | --- | --- |
| [SpaceNews: Yutu-2 likely immobile](https://spacenews.com/yutu-2-rover-likely-immobile-on-the-moon-after-historic-lunar-far-side-mission/) | Yutu-2 status | S |
| [Space.com: Chang'e-6 mini rover](https://www.space.com/china-change-6-mini-moon-rover-training-video) | Jinchan rover | S |
| [Wikipedia: IM-2](https://en.wikipedia.org/wiki/IM-2) | IM-2 outcome, MAPP not deployed | S |
| [SpacePolicyOnline: IM-2 ends](https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/) | IM-2 end | S |
| [Spaceflight Now: ispace Resilience crash](https://spaceflightnow.com/2025/06/06/ispaces-resilience-lander-crash-lands-on-the-moon/) | Tenacious lost | S |
| [NASA Moon Base phases](https://www.nasa.gov/moonbase-phases/) | VIPER late 2027 | P |
| [NASA Moon Base rover update](https://www.nasa.gov/missions/moon-base/nasa-provides-progress-update-on-moon-base-rovers/) | VIPER, LTV, FLIP, MAPP schedules | P |
| [NASA selects Blue Origin to deliver VIPER](https://www.nasa.gov/news-release/nasa-selects-blue-origin-to-deliver-viper-rover-to-moons-south-pole/) | VIPER delivery | P |
| [Blue Moon MK1 coverage](https://spaceanddefense.io/?p=27948) | MK1 to the Shackleton connecting ridge | S |
| [Spaceflight Now: New Glenn return to flight](https://spaceflightnow.com/2026/06/30/blue-origin-outlines-return-to-flight-logistics-for-its-new-glenn-rockets/) | Grounding after May 2026 | S |
| [SpacePolicyOnline: Chang'e-7 postponed](https://spacepolicyonline.com/?p=90081) | Chang'e-7 status | S |
| [ABC News: Chang'e-7 postponed](https://abcnews.com/Technology/wireStory/china-abruptly-postpones-ambitious-change-7-lunar-mission-launch-135881478) | Same | S |
| [RTHK: Chang'e-8 timing](https://news.rthk.hk/rthk/en/component/k2/1801665-20250424.htm) | ~2029 | S |
| [Chandrayaan-5 / LUPEX overview](https://vajiramandravi.com/current-affairs/chandrayaan-5-mission/) | ~2028 | U |
| [Wikipedia: IM-3](https://en.wikipedia.org/wiki/IM-3) | IM-3 timing | S |
| [NASA Artemis III](https://www.nasa.gov/mission/artemis-iii/) | Earth-orbit test 2027; landing on Artemis IV | P |
| [SpacePolicyOnline: Artemis III, IV, V](https://spacepolicyonline.com/news/nasa-is-full-steam-ahead-on-artemis-iii-iv-and-v/) | Artemis IV ~2028 | S |

## Space scene imagery

Per-file provenance is in `frontend/public/space/textures.json` and [data/sources.md](../data/sources.md#space-scene-web-app-earth-sun-and-star-backdrop).

| Source | Used for | Key |
| --- | --- | --- |
| [NASA SVS CGI Moon Kit (4720)](https://svs.gsfc.nasa.gov/4720) | Moon colour and relief | P |
| [NASA GIBS WMS](https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi) | Blue Marble NG (shaded relief + bathymetry), Black Marble, land/water | P |
| [NASA Earth Observatory: The Blue Marble 2002](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) | Classic cloud map (`cloud_combined_2048.jpg`) | P |
| [NASA SVS Deep Star Maps 2020 (4851)](https://svs.gsfc.nasa.gov/4851) | Star sky | P |
| [NASA SDO latest images](https://sdo.gsfc.nasa.gov/assets/img/latest/latest_2048_HMII.jpg) | Sun disc (HMI intensitygram) | P |
| [NASA SVS 3615](https://svs.gsfc.nasa.gov/cgi-bin/details.cgi?aid=3615), [SVS 30763 Blue Marble 2015](https://svs.gsfc.nasa.gov/30763) | Tried, not used | P |
| [shadedrelief.com cloud maps](https://www.shadedrelief.com/natural3/pages/clouds.html), [NEO Blue Marble archive](https://neo.gsfc.nasa.gov/archive/bluemarble) | Background on the cloud map's origin | S |

## Hill sites

| Source | Used for | Key |
| --- | --- | --- |
| [LROC image 1294](https://lroc.im-ldi.com/images/1294) | Malapert Massif region heart (86°S, 0°E) | P |
| [LROC image 1247](https://lroc.im-ldi.com/images/1247) | Shackleton–de Gerlache ridge anchor and length | P |
| USGS ScienceBase item 671a6fa8d34efed5620f89f8 ([DOI 10.5066/P1MEQ6UK](https://doi.org/10.5066/P1MEQ6UK)) | Artemis III region outlines (not yet downloaded) | P |
