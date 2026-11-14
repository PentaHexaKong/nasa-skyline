# Curated site candidates

**Only the rows marked `verified` or `computed` have a checked coordinate.** Values marked "approx." are from general knowledge and must be checked against the cited primary source before they go into `ds/pipeline/sites.py`. Record the source, frame and date for each.

Status key: `todo` → `verified` (point and source recorded) → `computed` (pipeline run exists).

## Polar: Artemis candidate regions (NASA, 28 Oct 2024; still the crewed-landing reference after the Feb 2026 restructure)

For each region we pick **one documented point** (e.g. the highest-illumination point inside the USGS grid, according to the PGDA map) and record why we chose it.

| Region | Point | Status |
| --- | --- | --- |
| Peak near Cabeus B | TBD | todo |
| Haworth | TBD | todo |
| Malapert Massif | **86.0011°S, 2.0550°E** (`malapert-massif`): the pixel of highest 18.6-year average Sun visibility (0.819, PGDA product 69, `AVGVISIB_85S_060M_201608`) inside a **7.5 km-radius disc around 86°S, 0°E**. Centre: [LROC image 1294](https://lroc.im-ldi.com/images/1294) calls 86°S, 0°E "the heart of the Artemis 3 landing region". Radius: NASA says each region is about 15 by 15 km ([NASA release](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/)). **The disc is a stand-in:** the USGS region grids ([ScienceBase 671a6fa8d34efed5620f89f8](https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8)) answered HTTP 403 (Cloudflare challenge) to scripted requests, so no published polygon was read. Checked 2026-11-14. Rerun: `uv run python -m pipeline.pick malapert-massif` | not in the app; `uv run python -m pipeline.run malapert-massif` computes it |
| Mons Mouton Plateau | TBD | todo |
| Mons Mouton | TBD | todo |
| Nobile Rim 1 | TBD | todo |
| Nobile Rim 2 | TBD | todo |
| de Gerlache Rim 2 | TBD | todo |
| Slater Plain | TBD | todo |

## Polar: flown and planned missions

| Site | Approx. | Source to verify | Status |
| --- | --- | --- | --- |
| IM-1 Odysseus (Feb 2024), near Malapert A | **80.13°S, 1.44°E**, elevation 2,579 m (source). Our LOLA DEM reads 2,592 m at that point. The source does not state its frame (assumed ME) or precision (2 decimals) | [NASA/LRO, Feb 2024](https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/) | not in the app; `uv run python -m pipeline.run im1-malapert` computes it |
| IM-2 Athena (Mar 2025), Mons Mouton | **84.7906°S, 29.1957°E** (final resting place, on its side in a 20 m crater; intended site was 84.78°S, 29.13°E). Our LOLA DEM reads 5,321.9 m above the 1737.4 km sphere there | [LROC image 1408](https://lroc.im-ldi.com/images/1408), [LROC image 1401](https://lroc.im-ldi.com/images/1401) | not in the app; `uv run python -m pipeline.run im2-mons-mouton` computes it |
| Connecting Ridge (ESA Lunar Lander study region CR1) | **89.4679°S, 222.589°E** (`connecting-ridge`; published as -89.4679, -137.411): centre of the Region of Interest, in the ME/PA frame (DE421). A region centre, not a landing point. Checked against the arXiv PDF 2026-11-14. Nearby, `shackleton-ridge` (89.4749°S, 222.5569°E) is the PGDA 69 Sun maximum on the same ridge, about 200 m away; `pipeline.pick shackleton-ridge` reproduces it | [De Rosa et al. 2012](https://doi.org/10.1016/j.pss.2012.08.002), Table 2 ([arXiv 1208.5587](https://arxiv.org/abs/1208.5587), PDF p. 55) | computed (`connecting-ridge`, 2026-11-14 to 2027-11-14) |
| de Gerlache Rim (ESA Lunar Lander study region GR1) | **88.6952°S, 291.7154°E** (`de-gerlache-rim`; published as -88.6952, -68.2846): region centre, ME/PA (DE421). Checked 2026-11-14 | [De Rosa et al. 2012](https://doi.org/10.1016/j.pss.2012.08.002), Table 2 ([arXiv 1208.5587](https://arxiv.org/abs/1208.5587), PDF p. 55) | computed (`de-gerlache-rim`, 2026-11-14 to 2027-11-14) |
| Shackleton Rim (ESA Lunar Lander study region SR1) | **89.7755°S, 203.552°E** (`shackleton-rim`; published as -89.7755, -156.448): region centre, ME/PA (DE421). Checked 2026-11-14 | [De Rosa et al. 2012](https://doi.org/10.1016/j.pss.2012.08.002), Table 2 ([arXiv 1208.5587](https://arxiv.org/abs/1208.5587), PDF p. 55) | computed (`shackleton-rim`, 2026-11-14 to 2027-11-14) |

## Contrast sites (O1: Apollo and other countries)

| Site | Approx. | Why | Status |
| --- | --- | --- | --- |
| Apollo 11 (Tranquility Base) | **0.67416°N, 23.47314°E**, elevation -1926 m, uncertainty 0.3 m: Apollo 11 LM, mean observed position in the ME system, [LROC Coordinates of Lunar Anthropogenic Features, 28 July 2016](https://www.lroc.asu.edu/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf), fetched and read 2026-11-14 | Equatorial near side: Earth always up, Sun high | not in the app; `uv run python -m pipeline.run apollo11` computes it |
| Chandrayaan-3 (Shiv Shakti point, ISRO) | ~69.37°S, 32.32°E (approx.) | Mid-high latitude, another country's program | todo |
| Chang'e-4 (Von Kármán crater, CNSA) | TBD | Far side: Earth never visible, which motivates relays | todo |
| Blue Ghost M1 (Mare Crisium, Mar 2025) | TBD | A successful CLPS landing | todo |

## Point record format (for `sites.json`)

```json
{
  "id": "malapert-massif-p1",
  "name": "Malapert Massif (point 1)",
  "category": "artemis_region",
  "latitude_deg": 0,
  "longitude_deg_east": 0,
  "frame": "MOON_ME",
  "observer_height_m": 2.0,
  "source": "URL + date",
  "selection_rationale": "why this point",
  "status": "todo"
}
```
