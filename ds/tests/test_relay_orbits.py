import json
import math

import numpy as np
import pytest

from pipeline import fetch, relay_check as rc
from pipeline.sun import MOON_RADIUS_KM

DOC = json.loads(rc.ORBITS.read_text())


def test_every_relay_is_cited_and_labelled():
    for relay in DOC["relays"]:
        assert relay["source"]["url"].startswith("https://")
        assert len(relay["source"]["sha256"]) == 64
        assert relay["label"] in ("indicative", "preliminary design")
    assert DOC["synthetic"] is False


def test_pathfinder_values_agree_with_each_other():
    el = rc.pathfinder()["elements"]
    assert MOON_RADIUS_KM + (el["periselene_alt_km"] + el["aposelene_alt_km"]) / 2 == pytest.approx(el["a_km"], abs=1)
    assert (el["aposelene_alt_km"] - el["periselene_alt_km"]) / (2 * el["a_km"]) == pytest.approx(el["e"], abs=0.005)
    assert 2 * math.pi * math.sqrt(el["a_km"] ** 3 / rc.MU_MOON) / 3600 == pytest.approx(10.84, abs=0.01)


def test_network_tables_agree_except_the_flagged_ldn1_radius():
    for sat in rc.network()["satellites"]:
        gap = abs(np.linalg.norm(sat["r_km"]) - rc._radius(sat["elements"]))
        if sat["id"] == "LDN-1":
            assert gap > 200  # published mismatch, recorded under known_issues; fails loudly if the data is ever corrected
        else:
            assert gap < 6


@pytest.fixture(scope="module")
def kernels():
    if not all((fetch.DATA / n).exists() for n in fetch.MOON_KERNELS):
        pytest.skip("Moon kernels not fetched")
    rc.load_kernels()
    return rc.epoch()


def test_table3_in_earth_moon_axes_gives_table2(kernels):
    axes = rc.earth_moon_axes(kernels)
    offsets = []
    for sat, state in zip(rc.network()["satellites"], rc.network_states()):
        got, want = rc.elements(state, kernels, axes), sat["elements"]
        assert got["i_deg"] == pytest.approx(want["i_deg"], abs=0.02)
        assert got["m_deg"] == pytest.approx(want["m_deg"], abs=0.05)
        assert got["argp_deg"] == pytest.approx(want["argp_deg"], abs=0.25)
        offsets.append((got["raan_deg"] - want["raan_deg"]) % 360)
    assert max(offsets) - min(offsets) < 0.05  # one constant offset: Table 2's RAAN zero point differs, its spacing does not


def test_propagation_reproduces_the_paper_at_the_south_pole(kernels):
    positions = rc.propagate(rc.network_states(), kernels, int(60 * 86400 / rc.STEP_S), dt=120.0)
    in_view = rc.sats_in_view(positions, kernels, -90, 0)
    assert np.all(in_view >= 2)
    assert 0.91 <= np.mean(in_view >= 4) <= 0.99
    lowest = np.linalg.norm(positions, axis=2).min(0) - MOON_RADIUS_KM
    assert lowest.min() > 1300 and lowest.max() < 2000


def test_longest_gap_counts_the_longest_run_without_contact():
    assert rc.longest_gap_h(np.array([True, False, False, True, False])) == pytest.approx(2 * rc.STEP_S / 3600)
    assert rc.longest_gap_h(np.array([True, True])) == 0
