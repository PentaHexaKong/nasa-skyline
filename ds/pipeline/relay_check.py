"""Can the cited relay orbits be used? Writes validation/relay-orbits.md. A feasibility check, not app data.

Run from ds/:
    uv run python -m pipeline.relay_check

Conventions: ME frame for lander geometry, J2000 for propagation, azimuth clockwise from local north, degrees, km, UTC.
"""

import json
import math
from pathlib import Path

import numpy as np
import spiceypy as sp

from pipeline import fetch
from pipeline.sun import ME_FRAME, MOON_RADIUS_KM
from pipeline.terrain import horizon_at

ROOT = Path(__file__).resolve().parents[2]
ORBITS = Path(__file__).with_name("relay_orbits.json")
REPORT = ROOT / "ds" / "validation" / "relay-orbits.md"
MOON_SITES = ["connecting-ridge", "de-gerlache-rim", "shackleton-rim"]  # the app sites, whose pipeline output is in frontend/data

MU_MOON = 4902.800066  # GRAIL, km3/s2
MU_EARTH = 398600.435
MU_SUN = 132712440041.9
J2_MOON = 2.033e-4
STEP_S = 600.0
LUNAR_MONTH_S = 27.3217 * 86400
PAPER_MASK_DEG = 5.0  # AAS 25-758's elevation mask


def load_kernels() -> None:
    sp.kclear()
    for name in fetch.MOON_KERNELS:
        sp.furnsh(str(fetch.DATA / name))


def network() -> dict:
    return next(r for r in json.loads(ORBITS.read_text())["relays"] if r["id"] == "im-lunar-data-network")


def pathfinder() -> dict:
    return next(r for r in json.loads(ORBITS.read_text())["relays"] if r["id"] == "lunar-pathfinder")


def network_states() -> np.ndarray:
    return np.array([s["r_km"] + s["v_km_s"] for s in network()["satellites"]])


def epoch() -> float:
    return sp.str2et(network()["epoch_utc"])


def _moon_to(name: str, et: float) -> np.ndarray:
    return sp.spkpos(name, float(et), "J2000", "NONE", "MOON")[0]


def earth_moon_axes(et: float) -> np.ndarray:
    """Rows are x (Moon to Earth), y, z (Moon's orbit normal) in J2000."""
    state = sp.spkezr("EARTH", et, "J2000", "NONE", "MOON")[0]
    x = state[:3] / np.linalg.norm(state[:3])
    z = np.cross(state[:3], state[3:])
    z /= np.linalg.norm(z)
    return np.array([x, np.cross(z, x), z])


def elements(state: np.ndarray, et: float, axes: np.ndarray) -> dict:
    """Osculating elements of a J2000 state, expressed in the given axes."""
    rp, e, i, raan, argp, m = sp.oscelt(np.r_[axes @ state[:3], axes @ state[3:]], et, MU_MOON)[:6]
    return {
        "a_km": rp / (1 - e), "e": e, "i_deg": math.degrees(i),
        "raan_deg": math.degrees(raan), "argp_deg": math.degrees(argp), "m_deg": math.degrees(m),
    }


def state_from_elements(el: dict, et: float, axes: np.ndarray) -> np.ndarray:
    angles = [math.radians(el[k]) for k in ("i_deg", "raan_deg", "argp_deg", "m_deg")]
    s = sp.conics([el["a_km"] * (1 - el["e"]), el["e"], *angles, et, MU_MOON], et)
    return np.r_[axes.T @ s[:3], axes.T @ s[3:]]


def _acceleration(r, earth, sun, pole):
    rn = np.linalg.norm(r, axis=1, keepdims=True)
    z = (r @ pole)[:, None] / rn
    a = -MU_MOON * r / rn**3
    a += 1.5 * J2_MOON * MU_MOON * MOON_RADIUS_KM**2 / rn**4 * ((5 * z**2 - 1) * r / rn - 2 * z * pole)
    for p, mu in ((earth, MU_EARTH), (sun, MU_SUN)):
        d = p - r
        a += mu * (d / np.linalg.norm(d, axis=1, keepdims=True) ** 3 - p / np.linalg.norm(p) ** 3)
    return a


def propagate(states: np.ndarray, et0: float, samples: int, dt: float = 60.0) -> np.ndarray:
    """Positions (samples, sats, 3) in J2000, every STEP_S.

    RK4 with Moon point mass + J2, Earth and Sun. The paper's own model goes to degree 50 with solar pressure.
    # ponytail: J2 only reproduces the paper's 60-day statistics; add higher degrees if exact window times ever matter.
    """
    pole = sp.pxform(ME_FRAME, "J2000", et0)[:, 2]
    r, v = states[:, :3].copy(), states[:, 3:].copy()
    every = int(STEP_S / dt)
    out = []
    for n in range(((samples - 1) * every) + 1):
        if n % every == 0:
            out.append(r.copy())
        t = et0 + n * dt
        a, b, c = [(_moon_to("EARTH", x), _moon_to("SUN", x)) for x in (t, t + dt / 2, t + dt)]
        k1r, k1v = v, _acceleration(r, *a, pole)
        k2r, k2v = v + dt / 2 * k1v, _acceleration(r + dt / 2 * k1r, *b, pole)
        k3r, k3v = v + dt / 2 * k2v, _acceleration(r + dt / 2 * k2r, *b, pole)
        k4r, k4v = v + dt * k3v, _acceleration(r + dt * k3r, *c, pole)
        r = r + dt / 6 * (k1r + 2 * k2r + 2 * k3r + k4r)
        v = v + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
    return np.array(out)


def _times(et0: float, samples: int) -> np.ndarray:
    return et0 + np.arange(samples) * STEP_S


def _rotations(times: np.ndarray) -> np.ndarray:
    return np.array([sp.pxform("J2000", ME_FRAME, float(t)) for t in times])


def _az_el(pos_me: np.ndarray, observer: np.ndarray):
    up = observer / np.linalg.norm(observer)
    east = np.cross([0.0, 0.0, 1.0], up)
    east /= np.linalg.norm(east)
    north = np.cross(up, east)
    d = pos_me - observer
    return (
        np.degrees(np.arctan2(d @ east, d @ north)) % 360,
        np.degrees(np.arcsin((d @ up) / np.linalg.norm(d, axis=-1))),
    )


def _observer(lat: float, lon: float, height_km: float = 0.0) -> np.ndarray:
    return np.array(sp.latrec(MOON_RADIUS_KM + height_km, math.radians(lon), math.radians(lat)))


def _sees_earth(pos: np.ndarray, earth: np.ndarray) -> np.ndarray:
    d = earth - pos
    d = d / np.linalg.norm(d, axis=-1, keepdims=True)
    along = -(pos * d).sum(-1)
    return ~((along > 0) & (np.linalg.norm(pos + along[..., None] * d, axis=-1) < MOON_RADIUS_KM))


def sats_in_view(positions: np.ndarray, et0: float, lat: float, lon: float, mask_deg: float = PAPER_MASK_DEG) -> np.ndarray:
    """Satellites above the mask from a spherical Moon, no terrain, as in the paper."""
    rot = _rotations(_times(et0, len(positions)))
    _, el = _az_el(np.einsum("tij,tsj->tsi", rot, positions), _observer(lat, lon))
    return (el >= mask_deg).sum(1)


def longest_gap_h(contact: np.ndarray) -> float:
    best = run = 0
    for c in contact:
        run = 0 if c else run + 1
        best = max(best, run)
    return best * STEP_S / 3600


def site_contact(site_id: str, positions: np.ndarray, et0: float):
    """(direct-to-Earth flags, per-satellite lander-to-relay-to-Earth flags), using the site's real skyline."""
    doc = json.loads((ROOT / "frontend" / "data" / f"{site_id}.json").read_text())
    s = doc["site"]
    obs = _observer(s["lat_deg"], s["lon_deg_east"], (s["ground_height_m"] + s["observer_height_m"]) / 1000)
    sky = np.array(doc["skyline"]["elevation_deg"])
    times = _times(et0, len(positions))
    rot = _rotations(times)
    earth = np.array([_moon_to("EARTH", t) for t in times])
    az, el = _az_el(np.einsum("tij,tj->ti", rot, earth), obs)
    direct = el > horizon_at(sky, az)
    az, el = _az_el(np.einsum("tij,tsj->tsi", rot, positions), obs)
    lander_link = el > horizon_at(sky, az)  # a ray clears terrain at any range past it, so the skyline applies as is
    return direct, lander_link & _sees_earth(positions, earth[:, None, :]), doc


def interval_share(doc: dict, et0: float, samples: int) -> float:
    """Direct share over the same window, from the pipeline's saved Earth intervals."""
    t0, t1 = et0, et0 + samples * STEP_S
    spans = [(sp.str2et(a.rstrip("Z")), sp.str2et(b.rstrip("Z"))) for a, b in doc["earth_intervals"]]
    return sum(max(0.0, min(b, t1) - max(a, t0)) for a, b in spans) / (t1 - t0)


def table(head: list[str], rows: list[list]) -> list[str]:
    return ["| " + " | ".join(head) + " |", "|" + " --- |" * len(head), *("| " + " | ".join(map(str, r)) + " |" for r in rows)]


def pct(x: float) -> str:
    return f"{100 * x:.1f} %"


def main() -> None:
    load_kernels()
    et0 = epoch()
    axes = earth_moon_axes(et0)
    sats = network()["satellites"]
    states = network_states()
    samples = int(LUNAR_MONTH_S / STEP_S)
    out = [
        "# Validation: planned relay orbits",
        "",
        "Generated by `python -m pipeline.relay_check`, from `pipeline/relay_orbits.json`.",
        "",
        "Geometric line of sight from planned, unflown orbits. Not a radio link, capacity or guaranteed contact. A feasibility check; these numbers are not yet in the app.",
        "",
        "## 1. Frames: Lunar Data Network Table 3 (ICRF) against Table 2",
        "",
        "Table 3 states converted to elements in Earth-Moon axes at the epoch. `r` is the radius from each table.",
        "",
    ]
    rows = []
    for sat, state in zip(sats, states):
        got, want = elements(state, et0, axes), sat["elements"]
        rows.append([
            sat["id"], f"{got['a_km']:.1f} / {want['a_km']}", f"{got['e']:.3f} / {want['e']}", f"{got['i_deg']:.2f} / {want['i_deg']}",
            f"{got['argp_deg']:.2f} / {want['argp_deg']}", f"{got['m_deg']:.2f} / {want['m_deg']}", f"{(got['raan_deg'] - want['raan_deg']) % 360:.2f}",
            f"{np.linalg.norm(state[:3]):.1f} / {_radius(want):.1f}",
        ])
    out += table(["Satellite", "a km", "e", "i deg", "w deg", "M deg", "RAAN offset deg", "r km"], rows)

    long = propagate(states, et0, int(60 * 86400 / STEP_S))
    alt = np.linalg.norm(long, axis=2).min(0) - MOON_RADIUS_KM
    out += [
        "",
        "## 2. Propagation: can we reproduce the paper's 60 days?",
        "",
        f"Moon J2, Earth, Sun. Spherical Moon, {PAPER_MASK_DEG:g} deg mask, no terrain, as in the paper, which reports at least two in view at all times, at least four for 91-97 % of the time, and lowest perilunes of about 1400-1900 km across its grid of more than 400 points.",
        "",
        f"Lowest perilune altitude per satellite: {', '.join(f'{a:.0f}' for a in alt)} km.",
        "",
    ]
    rows = []
    for lat, lon in ((-90, 0), (-85, 0), (-85, 180), (-75, 90), (-75, 270)):
        n = sats_in_view(long, et0, lat, lon)
        rows.append([f"{lat}, {lon}", pct(np.mean(n >= 2)), pct(np.mean(n >= 4))])
    out += table(["Lat, lon", "At least 2 in view", "At least 4 in view"], rows)

    grid = [(o, m) for o in range(0, 360, 30) for m in range(0, 360, 30)]
    base = pathfinder()["elements"]
    pf_states = np.array([
        state_from_elements({"a_km": base["a_km"], "e": base["e"], "i_deg": base["i_deg"], "argp_deg": base["argp_deg"], "raan_deg": o, "m_deg": m}, et0, axes)
        for o, m in grid
    ])
    pf = propagate(pf_states, et0, samples)
    out += [
        "",
        "## 3. Lunar Pathfinder against its guide's coverage map",
        "",
        "Share of 14 days with Pathfinder above the horizon, no terrain, over 144 starting orbits (12 RAAN x 12 mean anomaly, assumed Earth-Moon axes). The guide's Figure 8 colour scale tops out at 75 %, reached in the far south, and is lowest in the far north.",
        "",
    ]
    rows = []
    for lat, lon in ((-90, 0), (-85, 30), (-60, 0), (60, -75), (90, 0)):
        c = np.array([sats_in_view(pf[: int(14 * 86400 / STEP_S), [j]], et0, lat, lon, 0.0).mean() for j in range(len(grid))])
        rows.append([f"{lat}, {lon}", pct(np.median(c)), f"{pct(c.min())} to {pct(c.max())}"])
    out += table(["Lat, lon", "Median", "Range"], rows)

    net = propagate(states, et0, samples)
    alt_state = np.array([state_from_elements({**sats[0]["elements"], "raan_deg": (sats[0]["elements"]["raan_deg"] + 241.49) % 360}, et0, axes)])
    ldn1_alt = propagate(alt_state, et0, samples)
    out += [
        "",
        "## 4. What the orbits do at our sites",
        "",
        f"One lunar month from the network's epoch ({network()['epoch_utc']} UTC), {STEP_S / 60:g} min sampling. Lander sees the relay above the real skyline while the relay sees Earth. Earth rule: centre above the skyline. Share is time in contact; gap is the longest stretch without contact. Pathfinder is the median and range over the same 144 starting orbits.",
        "",
    ]
    rows, checks = [], []
    for site_id in MOON_SITES:
        direct, net_link, doc = site_contact(site_id, net, et0)
        _, alt_link, _ = site_contact(site_id, ldn1_alt, et0)
        _, pf_link, _ = site_contact(site_id, pf, et0)
        with_pf = pf_link | direct[:, None]
        pf_share = with_pf.mean(0)
        pf_gap = [longest_gap_h(with_pf[:, j]) for j in range(len(grid))]
        with_one = net_link[:, 0] | direct
        with_alt = alt_link[:, 0] | direct
        with_all = net_link.any(1) | direct
        rows.append([
            doc["site"]["name"], pct(direct.mean()), f"{longest_gap_h(direct):.1f} h",
            f"{pct(np.median(pf_share))} ({pct(pf_share.min())} to {pct(pf_share.max())})",
            f"{np.median(pf_gap):.1f} h ({min(pf_gap):.1f} to {max(pf_gap):.1f})",
            f"{pct(with_one.mean())} / {pct(with_alt.mean())}", f"{longest_gap_h(with_one):.1f} / {longest_gap_h(with_alt):.1f} h",
            pct(with_all.mean()), f"{longest_gap_h(with_all):.1f} h",
        ])
        checks.append([doc["site"]["name"], pct(direct.mean()), pct(interval_share(doc, et0, samples))])
    out += table(
        ["Site", "Direct", "Gap", "+ Pathfinder", "Gap", "+ LDN-1 only (Table 3 / Table 2)", "Gap", "+ all 5", "Gap"], rows,
    )
    out += ["", "Direct share against the pipeline's saved 1 s Earth intervals, same window:", ""]
    out += table(["Site", "This check", "Pipeline"], checks)

    drift = np.linalg.norm(net[-1, 0] - ldn1_alt[-1, 0])
    out += [
        "",
        "## Limits",
        "",
        "- Good for shares and gap lengths, not clock times. Pathfinder's starting position is unknown, and a 241 km disagreement in LDN-1's published start grows to "
        f"{drift:.0f} km after a lunar month.",
        "- Valid near the network's design epoch; the paper's check runs 60 days without maneuvers. The real orbits and launch dates will differ.",
        "- No crater-floor site is tested here, where nearby terrain would block more relay passes, so do not generalise from these sites.",
        "- The network was designed to cover the south polar region, so polar sites reaching 100 % with all five is the design doing its job, not a finding about those sites. All five are not due until 2028 (Intuitive Machines, Q3 2026 earnings call, as of 2026-11-14).",
    ]
    REPORT.write_text("\n".join(out) + "\n")
    print(f"wrote {REPORT}")


def _radius(el: dict) -> float:
    m = math.radians(el["m_deg"])
    e = m
    for _ in range(50):
        e -= (e - el["e"] * math.sin(e) - m) / (1 - el["e"] * math.cos(e))
    return el["a_km"] * (1 - el["e"] * math.cos(e))


if __name__ == "__main__":
    main()
