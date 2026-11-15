"""Skyline -> Sun -> visibility -> metrics JSON for one site and period."""

import argparse
import datetime as dt
import json
from pathlib import Path

import numpy as np
from skyline_mission_science.visibility import eventIntervals

from . import fetch, moon
from .sites import SITES, Site
from .sun import ME_FRAME, Ephemeris, utc_to_et
from .terrain import MOON_RADIUS_M, horizon_at, skyline
from .visibility import visible_fraction

ALGORITHM_VERSION = '0.5.0'
COMMS_MARGIN_DEG = 0.0
TRACK_STEP_MIN = 10  # spacing of the stored daily Sun tracks, for the chart only
EARTH_STEP_MIN = 10  # sampling of Earth's position; Earth moves slowly, edges are refined to 1 s
EARTH_TRACK_STEP_MIN = 60  # spacing of the stored daily Earth tracks
# Results ship with the web app; it reads them at build time.
WEB_DATA = Path(__file__).resolve().parents[2] / "frontend" / "data"


class Model:
    """Everything that is fixed for a site: its skyline and the ephemeris."""

    def __init__(self, site: Site, az_step_deg: float, max_km: float):
        self.site = site
        self.kernels = fetch.fetch(fetch.MOON_KERNELS)
        self.terrain = moon.terrain_for(site)
        self.skyline, self.ground_m = skyline(
            self.terrain.layers, site.lat_deg, site.lon_deg_east, site.observer_height_m,
            az_step_deg, max_km, radius_m=MOON_RADIUS_M,
        )
        self.eph = Ephemeris(self.kernels)

    def sun(self, et):
        """Azimuth, geometric elevation (no atmosphere) and angular radius of the Sun's disc."""
        s = self.site
        return self.eph.target("SUN", et, s, self.ground_m + s.observer_height_m)

    def earth(self, et):
        """Azimuth, geometric elevation and angular radius of Earth's disc."""
        s = self.site
        return self.eph.target("EARTH", et, s, self.ground_m + s.observer_height_m)

    def earth_clearance(self, et, margin_deg: float = 0.0) -> np.ndarray:
        """Elevation of Earth's centre above the skyline at its azimuth, less the margin."""
        az, el, _ = self.earth(et)
        return el - horizon_at(self.skyline, az) - margin_deg

    def earth_fraction(self, et) -> np.ndarray:
        az, el, rad = self.earth(et)
        return visible_fraction(el - horizon_at(self.skyline, az), rad)

    def sunMargin(self, et):
        az, el, rad = self.sun(et)
        return el + rad - horizon_at(self.skyline, az)

    def daylightMargin(self, et):
        _, el, rad = self.sun(et)
        return el + rad

    def earthLimbMargin(self, et):
        az, el, rad = self.earth(et)
        return el + rad - horizon_at(self.skyline, az)

    def direct(self, et) -> np.ndarray:
        az, el, rad = self.sun(et)
        return visible_fraction(el - horizon_at(self.skyline, az), rad)

    def daylit(self, et) -> np.ndarray:
        _, el, rad = self.sun(et)
        return visible_fraction(el, rad)


def spans(margin, et: np.ndarray, lit: np.ndarray, et_end: float, eventCadenceS=None) -> list[tuple[float, float]]:
    '''Intervals from the shared extrema-aware detector using a signed visibility margin.'''
    times = np.asarray(et, dtype=float)
    if times.ndim != 1 or not len(times) or np.any(np.diff(times) <= 0) or et_end < times[-1] or et_end <= times[0]:
        raise ValueError('Event samples must be ordered inside a nonempty half-open window')
    if np.asarray(lit).shape != times.shape:
        raise ValueError('Visibility samples and event timestamps disagree')
    origin = float(times[0])
    cadence = float(eventCadenceS or (np.diff(times).max() if len(times) > 1 else et_end - origin))
    intervals = []
    # Bound search memory independently of mission length and merge clipped daily pieces.
    for chunkStart in np.arange(origin, et_end, 86400.):
        chunkEnd = min(chunkStart + 86400., et_end)
        initial = times[(times >= chunkStart) & (times <= chunkEnd)] - chunkStart
        result = eventIntervals(lambda offsets: margin(chunkStart + offsets), chunkEnd - chunkStart, cadence, 1., sampleTimesS=initial)
        for left, right in result['intervalsS']:
            interval = (chunkStart + left, chunkStart + right)
            if intervals and intervals[-1][1] == interval[0]:
                intervals[-1] = (intervals[-1][0], interval[1])
            else:
                intervals.append(interval)
    return intervals


def minutes_in(periods, day_start: float) -> float:
    day_end = day_start + 86400
    return round(sum(max(0.0, min(b, day_end) - max(a, day_start)) for a, b in periods) / 60, 1)


def longest_true_run(flags: list[bool]) -> tuple[int, int]:
    best, start = (0, -1), None
    for i, f in enumerate(flags + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            if i - start > best[0]:
                best = (i - start, start)
            start = None
    return best


def iso(et: float) -> str:
    import spiceypy as sp

    return sp.et2utc(et, "ISOC", 0) + "Z"


def total_seconds(periods) -> float:
    return sum(b - a for a, b in periods)


def longest_gap(periods, t0: float, t1: float) -> tuple[float, float, float]:
    """Longest stretch of [t0, t1) outside the periods: (start, end, seconds); (t0, t0, 0) when there is none."""
    best, cursor = (t0, t0), t0
    for a, b in periods + [(t1, t1)]:
        if a - cursor > best[1] - best[0]:
            best = (cursor, a)
        cursor = max(cursor, b)
    return best[0], best[1], best[1] - best[0]


def gap_fields(prefix: str, periods, t0: float, t1: float) -> dict:
    """Longest stretch of [t0, t1) outside the periods, as summary fields; truncated when it runs into the window edge."""
    a, b, seconds = longest_gap(periods, t0, t1)
    return {
        f"{prefix}_hours": round(seconds / 3600, 2),
        f"{prefix}_first": iso(a) if seconds else None,
        f"{prefix}_last": iso(b) if seconds else None,
        f"{prefix}_truncated": bool(seconds and (a <= t0 or b >= t1)),
    }


def stretch_fields(prefix: str, flags: list[bool], dates: list[str]) -> dict:
    """Longest run of true day flags as summary fields; truncated when it touches the first or last day of the window."""
    length, start = longest_true_run(flags)
    return {
        f"{prefix}_stretch_days": length,
        f"{prefix}_first_day": dates[start] if length else None,
        f"{prefix}_last_day": dates[start + length - 1] if length else None,
        f"{prefix}_truncated": bool(length and (start == 0 or start + length == len(flags))),
    }


def earth_section(model: Model, et0: float, et1: float, margin_deg: float = COMMS_MARGIN_DEG) -> dict:
    """Earth against the skyline. 10 min samples, edges bisected to 1 s, hourly tracks.

    Two rules: Earth's centre above the skyline plus the margin (the default), and any part of the disc above it.
    """
    et = np.arange(et0, et1, EARTH_STEP_MIN * 60)
    az, el, rad = model.earth(et)
    clearance = el - horizon_at(model.skyline, az)
    fraction = visible_fraction(clearance, rad)
    any_spans = spans(model.earthLimbMargin, et, fraction > 0, et1, eventCadenceS=3600.)
    centre_spans = spans(lambda t: model.earth_clearance(t, margin_deg), et, clearance - margin_deg > 0, et1, eventCadenceS=3600.)
    per_hour = EARTH_TRACK_STEP_MIN // EARTH_STEP_MIN
    hourly = np.arange(0, et.size, per_hour)
    return {
        "any_spans": any_spans,
        "centre_spans": centre_spans,
        "hourly_et": et[hourly],
        "hourly_az": az[hourly],
        "hourly_el": el[hourly],
        "hourly_fraction": fraction[hourly],
    }


def run(site: Site, start: str, days: int, step_min: float, az_step_deg: float = 0.25, max_km: float | None = None) -> dict:
    max_km = max_km or moon.FAR_KM
    model = Model(site, az_step_deg, max_km)
    et0 = utc_to_et(start + "T00:00:00")
    et1 = utc_to_et((dt.date.fromisoformat(start) + dt.timedelta(days=days)).isoformat() + "T00:00:00")
    if abs(et1 - et0 - days * 86400) > 0.01:
        raise ValueError("period contains a leap second; day bucketing assumes it does not")
    step = step_min * 60
    et = np.arange(et0, et1, step)
    az, el, rad = model.sun(et)
    direct = visible_fraction(el - horizon_at(model.skyline, az), rad)
    daylit = visible_fraction(el, rad)

    direct_spans = spans(model.sunMargin, et, direct > 0, et1, eventCadenceS=max(step, 3600.))
    daylit_spans = spans(model.daylightMargin, et, daylit > 0, et1, eventCadenceS=max(step, 3600.))
    intervals = [[iso(a), iso(b)] for a, b in direct_spans]
    earth = earth_section(model, et0, et1)

    day_idx = ((et - et0) // 86400).astype(int)
    stride = max(1, round(TRACK_STEP_MIN / step_min))
    on_track = (np.arange(et.size) % stride) == 0
    per_day = []
    for d in range(days):
        sel = day_idx == d
        up = sel & on_track & (el > -1.0)
        entry = {
            "date": (dt.date.fromisoformat(start) + dt.timedelta(days=d)).isoformat(),
            "daylight_min": minutes_in(daylit_spans, et0 + d * 86400),
            "direct_min": minutes_in(direct_spans, et0 + d * 86400),
            "track": {
                "t_min": np.round((et[up] - et0 - d * 86400) / 60, 1).tolist(),
                "az_deg": np.round(az[up], 2).tolist(),
                "el_deg": np.round(el[up], 2).tolist(),
                "direct_fraction": np.round(direct[up], 3).tolist(),
            },
        }
        day = (earth["hourly_et"] - et0) // 86400 == d
        entry["earth_min"] = minutes_in(earth["centre_spans"], et0 + d * 86400)
        entry["earth_any_min"] = minutes_in(earth["any_spans"], et0 + d * 86400)
        entry["earth_track"] = {
            "t_min": np.round((earth["hourly_et"][day] - et0 - d * 86400) / 60, 1).tolist(),
            "az_deg": np.round(earth["hourly_az"][day], 2).tolist(),
            "el_deg": np.round(earth["hourly_el"][day], 2).tolist(),
            "fraction": np.round(earth["hourly_fraction"][day], 3).tolist(),
        }
        per_day.append(entry)

    dates = [p["date"] for p in per_day]
    dark = [p["daylight_min"] > 0 and p["direct_min"] == 0 for p in per_day]
    no_direct = [p["direct_min"] == 0 for p in per_day]
    total_day = sum(p["daylight_min"] for p in per_day)
    total_direct = sum(p["direct_min"] for p in per_day)
    no_sun_all_day = int(sum(p["daylight_min"] == 0 for p in per_day))
    sun_all_day = int(sum(p["daylight_min"] >= 1439.9 for p in per_day))

    total_seconds_window = et1 - et0
    summary = {
        "direct_share_of_daylight": round(total_direct / total_day, 4) if total_day else None,
        "dark_days": int(sum(dark)),
        **stretch_fields("longest_dark", dark, dates),
        **stretch_fields("longest_no_direct", no_direct, dates),
        "night_days": no_sun_all_day,
        "all_day_sun_days": sun_all_day,
    }
    params = {
        "start": start,
        "days": days,
        "step_min": step_min,
        "track_step_min": step_min * stride,
        "az_step_deg": az_step_deg,
        "skyline_max_km": max_km,
    }
    site_block = {
        "id": site.id,
        "name": site.name,
        "lat_deg": site.lat_deg,
        "lon_deg_east": site.lon_deg_east,
        "observer_height_m": site.observer_height_m,
        "ground_height_m": round(model.ground_m, 1),
        "source": site.source,
        "reference": site.reference,
    }
    kernels = kernel_entries(model.kernels)
    skyline_block = {"az_step_deg": az_step_deg, "elevation_deg": np.round(model.skyline, 3).tolist()}

    centre_share = round(total_seconds(earth["centre_spans"]) / total_seconds_window, 4)
    any_share = round(total_seconds(earth["any_spans"]) / total_seconds_window, 4)
    summary |= {
        "earth_visible_share": centre_share,
        "earth_any_share": any_share,
        **gap_fields("longest_no_earth", earth["centre_spans"], et0, et1),
        **gap_fields("longest_no_earth_any", earth["any_spans"], et0, et1),
    }
    return {
        "kind": "lunar",
        "synthetic": False,
        "site": {**site_block, "body": "moon", "frame": ME_FRAME},
        "conventions": {
            "angles": "degrees",
            "azimuth": "clockwise from local north",
            "time": "UTC; intervals are [start, end)",
            "days": "UTC calendar days",
            'elevation': 'apparent LT+S, no atmospheric refraction',
            "longitude": "°E in [0, 360)",
            "direct_sun": "any part of the solar disk above the terrain skyline",
            "daylight": "any part of the solar disk above the flat horizon",
            "earth_visible": f"Earth's centre above the terrain skyline plus a {COMMS_MARGIN_DEG:g} deg margin (the default rule)",
            "earth_center": "Earth's centre above the terrain skyline",
            "earth_any": "any part of Earth's disc above the terrain skyline (reported as *_any)",
        },
        "params": {**params, "earth_step_min": EARTH_STEP_MIN, "earth_track_step_min": EARTH_TRACK_STEP_MIN},
        "provenance": {
            "algorithm_version": ALGORITHM_VERSION,
            "dem": model.terrain.provenance,
            "dem_product": model.terrain.product,
            "kernels": kernels,
            'frame': f'{ME_FRAME} body-fixed, 1737.4 km reference sphere, planetocentric site, LT+S aberration, no refraction',
            'event_detection': {
                'algorithm': 'skyline_mission_science.visibility.eventIntervals',
                'sunSearchCadenceS': max(step, 3600.), 'earthSearchCadenceS': 3600., 'maximumSearchChunkS': 86400.,
                'initialSunSampleCadenceS': step, 'numericalRootToleranceS': 1.,
                'possibleMissedEvents': True,
                'completenessAssumption': 'At most one minimum and maximum per search interval. Multiple extrema and skyline discontinuities remain uncertified.',
            },
            "known_limits": [
                moon.resolution_note(model.terrain, site, az_step_deg, max_km),
                'Directions include reception light time and stellar aberration (LT+S). Atmospheric refraction is excluded.',
                f'Observer height is {site.observer_height_m:g} m above the DEM surface.',
                f"Earth visibility is line of sight only: Earth's centre above the skyline plus a {COMMS_MARGIN_DEG:g} deg margin (default), with the any-part-of-the-6371 km-disc rule alongside as *_any. It is not a radio link, and says nothing about link budget, antenna pointing or DSN availability.",
                f"The window is {days} days from {start}, not the 18.6-year lunar nodal cycle; the Sun's grazing angles and the Earth libration vary across that cycle.",
                "The visible share of a disc treats the horizon as locally straight.",
                'Detected events use extrema searches and Brent refinement to 1 s. Multiple extrema and skyline discontinuities can still hide events.',
            ],
        },
        "skyline": skyline_block,
        "summary": summary,
        "earth": {
            "model": "Earth disc, radius 6371 km, LT+S",
            "rule": "centre above the skyline (default); any part of the disc reported as *_any",
            "margin_deg": COMMS_MARGIN_DEG,
            "visible_share": centre_share,
            "center_share": centre_share,
            "any_share": any_share,
        },
        "intervals": intervals,
        "earth_intervals": [[iso(a), iso(b)] for a, b in earth["centre_spans"]],
        "earth_intervals_any": [[iso(a), iso(b)] for a, b in earth["any_spans"]],
        "days": per_day,
    }


def kernel_entries(kernels: list[Path]) -> list[dict]:
    return [{"file": p.name, "sha256": fetch.checksum_of(p.name)} for p in kernels]


def moon_ephemeris(start: str, days: int, kernels: list[Path]) -> dict:
    """Hourly sub-solar and sub-Earth points on the Moon, ME frame, LT+S. Same for every Moon site."""
    eph = Ephemeris(kernels)
    et0 = utc_to_et(start + "T00:00:00")
    et = et0 + 3600.0 * np.arange(days * 24)
    sun_lat, sun_lon = eph.subpoint("SUN", et)
    earth_lat, earth_lon = eph.subpoint("EARTH", et)
    return {
        "start": start,
        "days": days,
        "step_h": 1,
        "frame": ME_FRAME,
        "subsolar_lat_deg": np.round(sun_lat, 2).tolist(),
        "subsolar_lon_deg_east": np.round(sun_lon, 2).tolist(),
        "subearth_lat_deg": np.round(earth_lat, 2).tolist(),
        "subearth_lon_deg_east": np.round(earth_lon, 2).tolist(),
        "provenance": {
            "algorithm_version": ALGORITHM_VERSION,
            "method": "SPICE subpnt, INTERCEPT/ELLIPSOID on the Moon (1737.4 km sphere), fixref ME frame, abcorr LT+S",
            "conventions": "degrees; longitude °E in [0, 360); UTC; samples at start + k h, k = 0 .. days*24 - 1",
            "kernels": kernel_entries(kernels),
        },
    }


def write_moon_ephemeris(start: str, days: int, out: Path) -> bool:
    """Write the shared Moon ephemeris unless the file there was made for the same start, days, algorithm version and kernels."""
    kernels = fetch.fetch(fetch.MOON_KERNELS)
    if out.exists():
        old = json.loads(out.read_text())
        made_with = old.get("provenance", {})
        if (
            old.get("start") == start
            and old.get("days") == days
            and made_with.get("algorithm_version") == ALGORITHM_VERSION
            and made_with.get("kernels") == kernel_entries(kernels)
        ):
            return False
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(moon_ephemeris(start, days, kernels), separators=(",", ":")))
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("site", choices=sorted(SITES))
    ap.add_argument("--start", default="2026-11-14")
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--step", type=float, default=1.0, help="minutes")
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    result = run(SITES[a.site], a.start, a.days, a.step)
    out = a.out or WEB_DATA / f"{a.site}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(result, separators=(",", ":"))
    out.write_text(payload)
    extra = {
        "ephemeris_written": write_moon_ephemeris(a.start, a.days, WEB_DATA / "moon" / "ephemeris.json"),
        "earth": result["earth"],
    }
    print(json.dumps({"out": str(out), **result["summary"], "ground_height_m": result["site"]["ground_height_m"], **extra}, indent=2))


if __name__ == "__main__":
    main()
