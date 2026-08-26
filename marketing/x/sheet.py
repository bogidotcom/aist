#!/usr/bin/env python3
"""Contact sheets — quick visual review of a whole set."""
import sys, os, glob
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__))

def sheet(paths, cols, out, tile_w=520):
    tile_h = tile_w * 9 // 16
    rows = (len(paths) + cols - 1) // cols
    pad = 10
    W = cols * tile_w + pad * (cols + 1)
    H = rows * tile_h + pad * (rows + 1)
    canvas = Image.new("RGB", (W, H), (10, 11, 10))
    for n, p in enumerate(paths):
        im = Image.open(p).resize((tile_w, tile_h), Image.LANCZOS)
        x = pad + (n % cols) * (tile_w + pad)
        y = pad + (n // cols) * (tile_h + pad)
        canvas.paste(im, (x, y))
    canvas.save(out, quality=88)
    print(out, canvas.size, len(paths), "cards")

if __name__ == "__main__":
    kind = sys.argv[1]
    out = sys.argv[2]
    if kind == "global":
        lang = sys.argv[3]
        paths = sorted(glob.glob(f"{ROOT}/img/{lang}/*.png"))
        sheet(paths, 5, out)
    elif kind == "country":
        # one row of 8 per country-language set
        paths = []
        for d in sys.argv[3:]:
            paths += sorted(glob.glob(f"{ROOT}/img/c/{d}/*.png"),
                            key=lambda p: int(os.path.basename(p)[:-4]))
        sheet(paths, 4, out)
