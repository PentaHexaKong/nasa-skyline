import numpy as np


def visible_fraction(clearance_deg: np.ndarray, radius_deg: np.ndarray) -> np.ndarray:
    """Share of a disk's area above a locally straight horizon.

    clearance = centre elevation minus horizon elevation at the centre's azimuth.
    """
    x = np.clip(-np.asarray(clearance_deg) / np.asarray(radius_deg), -1.0, 1.0)
    return (np.arccos(x) - x * np.sqrt(1.0 - x * x)) / np.pi
