from dataclasses import dataclass


@dataclass(frozen=True)
class Site:
    id: str
    name: str
    lat_deg: float
    lon_deg_east: float
    observer_height_m: float
    source: str
    # Published direct-sun gap, used only as a validation reference.
    reference: str
    body: str = "moon"  # longitudes are deg E in [0, 360), ME frame


SITES = {
    s.id: s
    for s in [
        Site(
            "im2-mons-mouton",
            "IM-2 Athena, Mons Mouton",
            -84.7906,
            29.1957,
            2.0,
            "Final resting place of IM-2 Athena (Mar 2025) from LROC images 1408 and 1401 (lroc.im-ldi.com/images/1408, /1401); intended site was 84.78 S, 29.13 E.",
            "South-pole case: 5.2 deg from the pole, the Sun never climbs more than the colatitude plus the 1.54 deg axial tilt (about 7 deg) above the flat horizon, so shadows and short sunlit spells decide power, and Earth rises over rough polar terrain.",
            "moon",
        ),
        Site(
            "im1-malapert",
            "IM-1 Odysseus, near Malapert A",
            -80.13,
            1.44,
            2.0,
            "NASA/LRO, Feb 2024 (nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander), rounded to 0.01 deg; frame assumed ME.",
            "Rough polar terrain at 80 S near Malapert Massif: a flown-mission case that is not as far poleward as Mons Mouton.",
            "moon",
        ),
        Site(
            "apollo11",
            "Apollo 11, Tranquility Base",
            0.67416,
            23.47314,
            2.0,
            "Apollo 11 LM, mean observed position in the ME frame, LROC Coordinates of Lunar Anthropogenic Features, 28 Jul 2016 (uncertainty 0.3 m); checked 2026-11-14.",
            "Equatorial near-side contrast: Earth is always above the horizon (tidal locking) and the Sun climbs high.",
            "moon",
        ),
        Site(
            "malapert-massif",
            "Malapert Massif",
            -86.0011,
            2.0550,
            2.0,
            "Artemis III candidate region (NASA, 28 Oct 2024). Highest 18.6-year average Sun visibility (PGDA product 69, 0.819) inside a 7.5 km disc around 86 S, 0 E, the region heart per LROC image 1294; pipeline.pick, checked 2026-11-14. The disc stands in for the USGS region outline, which was not reachable.",
            "High ground in an Artemis III candidate region: hill-top power and Earth view.",
            "moon",
        ),
        Site(
            "shackleton-ridge",
            "Connecting Ridge (sunniest spot)",
            -89.4749,
            222.5569,
            2.0,
            "Highest 18.6-year average Sun visibility (PGDA product 69, 0.884) within 14 km of 89.684 S, 196.739 E, where the Shackleton - de Gerlache ridge meets the Shackleton rim (LROC image 1247; ridgeline about 14 km); pipeline.pick, checked 2026-11-14.",
            "High ground on the Shackleton - de Gerlache ridge: hill-top power and Earth view.",
            "moon",
        ),
        # De Rosa et al. 2012, Planetary and Space Science 74, doi:10.1016/j.pss.2012.08.002 (arXiv 1208.5587),
        # Table 2: centres of the ESA Lunar Lander Regions of Interest, ME/PA frame (DE421), longitude as
        # published (-180..180) converted to deg E in [0, 360). Checked against the arXiv PDF on 2026-11-14.
        Site(
            "connecting-ridge",
            "Connecting Ridge",
            -89.4679,
            222.589,
            2.0,
            "Centre of Region of Interest CR1 (89.4679 S, 137.411 W) in De Rosa et al. 2012, Table 2 (ESA Lunar Lander site study; doi:10.1016/j.pss.2012.08.002, arXiv 1208.5587), ME/PA frame (DE421); checked 2026-11-14. A region centre, not a landing point.",
            "The ridge between Shackleton and de Gerlache craters, named by De Rosa et al. 2012 among the south-polar areas with the longest sunlit periods.",
            "moon",
        ),
        Site(
            "de-gerlache-rim",
            "de Gerlache Rim",
            -88.6952,
            291.7154,
            2.0,
            "Centre of Region of Interest GR1 (88.6952 S, 68.2846 W) in De Rosa et al. 2012, Table 2 (ESA Lunar Lander site study; doi:10.1016/j.pss.2012.08.002, arXiv 1208.5587), ME/PA frame (DE421); checked 2026-11-14. A region centre, not a landing point.",
            "The rim of de Gerlache crater, named by De Rosa et al. 2012 among the south-polar areas with the longest sunlit periods.",
            "moon",
        ),
        Site(
            "shackleton-rim",
            "Shackleton Rim",
            -89.7755,
            203.552,
            2.0,
            "Centre of Region of Interest SR1 (89.7755 S, 156.448 W) in De Rosa et al. 2012, Table 2 (ESA Lunar Lander site study; doi:10.1016/j.pss.2012.08.002, arXiv 1208.5587), ME/PA frame (DE421); checked 2026-11-14. A region centre, not a landing point.",
            "The rim of Shackleton crater, 0.22 deg from the pole, named by De Rosa et al. 2012 among the south-polar areas with the longest sunlit periods.",
            "moon",
        ),
    ]
}
