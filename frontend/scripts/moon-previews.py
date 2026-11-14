"""Small first-look copies of the Moon's globe textures, so the landing page Moon appears before the full maps arrive.

    py -3 frontend/scripts/moon-previews.py      (needs Pillow; run from the repo root)

Reads the full textures in frontend/public/moon/ (made by ds/pipeline/globe.py from NASA SVS and LOLA data; see
globe.json) and writes downscaled JPEG copies to frontend/public/moon/preview/, with previews.json recording each
source file's sha256, the size and the JPEG quality. Display only: the page swaps in the full maps as soon as they
arrive, and nothing is measured from these images.
"""

import hashlib
import json
from pathlib import Path

from PIL import Image

MOON = Path(__file__).resolve().parents[1] / "public" / "moon"
OUT = MOON / "preview"
# (source, output, size, JPEG quality). Colour keeps 2K so the first look holds up on a large screen; the relief maps
# only shade it, so they can be smaller.
PREVIEWS = [
    ("color-4k.jpg", "color-2k.jpg", (2048, 1024), 80),
    ("normal-2k.jpg", "normal-1k.jpg", (1024, 512), 85),
    ("cap-normal-2k.jpg", "cap-normal-512.jpg", (512, 512), 85),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    OUT.mkdir(exist_ok=True)
    entries = []
    for src, dst, size, quality in PREVIEWS:
        image = Image.open(MOON / src).convert("RGB")
        image.resize(size, Image.LANCZOS).save(OUT / dst, "JPEG", quality=quality, optimize=True, progressive=True)
        entries.append(
            {
                "file": f"preview/{dst}",
                "from": src,
                "from_sha256": sha256(MOON / src),
                "size_px": list(size),
                "jpeg_quality": quality,
                "resample": "Lanczos",
            }
        )
    note = "Display-only first-look copies of the globe textures; the page replaces them with the full maps once loaded."
    (MOON / "previews.json").write_text(json.dumps({"note": note, "previews": entries}, indent=2) + "\n")
    print("\n".join(f"{e['file']}: {(OUT / Path(e['file']).name).stat().st_size // 1024} KB" for e in entries))


if __name__ == "__main__":
    main()
