"""Copies the chosen tiles out of the downloaded packs under descriptive names."""
import shutil
import sys
from pathlib import Path

download_dir = Path(sys.argv[1])
target_dir = Path(sys.argv[2])
target_dir.mkdir(parents=True, exist_ok=True)

CHOSEN = {
    "tiny-dungeon": {
        96: "hero-warrior",
        112: "hero-archer",
        84: "hero-mage",
        99: "hero-support",
        109: "enemy-soldier",
        123: "enemy-runner",
        124: "enemy-armored",
        120: "enemy-flyer",
        111: "enemy-boss",
        116: "icon-ice",
        129: "icon-arcane",
    },
    "tiny-town": {
        118: "icon-archery",
        105: "icon-cannon",
        126: "tower-base",
        0: "grass",
        1: "grass-tuft",
        2: "grass-flowers",
        3: "tree-pine",
        16: "tree-round",
        5: "bush",
        29: "mushrooms",
        43: "stones",
    },
}

for pack, tiles in CHOSEN.items():
    for index, name in tiles.items():
        source = download_dir / pack / "Tiles" / f"tile_{index:04d}.png"
        shutil.copyfile(source, target_dir / f"{name}.png")
        print(f"{pack} tile {index:>3} -> {name}.png")
