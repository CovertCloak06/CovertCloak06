#!/usr/bin/env python3
"""Draw a side-view preview of every Chocobo colour variant + a Chickabo chick.
Output: docs/preview.png  (documentation only; not part of the add-on)."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ACCENT = (0xE8, 0x82, 0x1E, 255)
ACCENT_D = (0xB5, 0x63, 0x1A, 255)
VARIANTS = [
    ("Yellow", (0xF2, 0xD0, 0x2C, 255), (0xC9, 0xA4, 0x1E, 255)),
    ("Black",  (0x3A, 0x3A, 0x46, 255), (0x1A, 0x1A, 0x20, 255)),
    ("Red",    (0xC8, 0x3A, 0x2B, 255), (0x8E, 0x28, 0x1D, 255)),
    ("Blue",   (0x3A, 0x78, 0xC8, 255), (0x28, 0x56, 0x99, 255)),
    ("Green",  (0x4C, 0xA6, 0x4C, 255), (0x35, 0x7A, 0x35, 255)),
    ("Gold",   (0xE8, 0xB8, 0x24, 255), (0xB8, 0x8A, 0x10, 255)),
]


def draw_chocobo(d, ox, oy, s, body, body_d, baby=False):
    """Draw a left-facing chocobo. (ox,oy) = ground point under the body centre."""
    acc, acc_d = ACCENT, ACCENT_D
    if baby:
        # round chick: big head, stubby legs, no neck
        d.rectangle([ox - 10*s, oy - 9*s, ox - 6*s, oy], fill=acc)
        d.rectangle([ox + 4*s, oy - 9*s, ox + 8*s, oy], fill=acc)
        d.ellipse([ox - 16*s, oy - 26*s, ox + 14*s, oy - 6*s], fill=body, outline=body_d)
        # head
        hx, hy = ox - 6*s, oy - 30*s
        d.polygon([(hx + 6*s, hy - 8*s), (hx + 2*s, hy - 22*s), (hx + 11*s, hy - 16*s)], fill=body_d)  # sprout
        d.ellipse([hx - 14*s, hy - 14*s, hx + 12*s, hy + 12*s], fill=body, outline=body_d)
        d.polygon([(hx - 20*s, hy), (hx - 11*s, hy - 5*s), (hx - 11*s, hy + 5*s)], fill=acc)  # beak
        d.ellipse([hx - 8*s, hy - 7*s, hx, hy + 1*s], fill=(255, 255, 255, 255))
        d.ellipse([hx - 6*s, hy - 5*s, hx - 2*s, hy - 1*s], fill=(0x16, 0x10, 0x0E, 255))
        return

    # legs
    for lx in (-8, 6):
        d.rectangle([ox + lx*s, oy - 22*s, ox + (lx+4)*s, oy], fill=acc, outline=acc_d)
        d.rectangle([ox + (lx-3)*s, oy - 2*s, ox + (lx+6)*s, oy], fill=acc_d)  # foot
    # tail fan
    for i, ang in enumerate((-14, -4, 6)):
        bx = ox + 24*s
        d.polygon([(bx, oy - 26*s), (bx + (10+i*2)*s, oy - (40+ang)*s),
                   (bx + 4*s, oy - 30*s)], fill=body_d)
    # body
    d.ellipse([ox - 26*s, oy - 44*s, ox + 30*s, oy - 14*s], fill=body, outline=body_d)
    # neck
    d.polygon([(ox - 18*s, oy - 36*s), (ox - 6*s, oy - 38*s),
               (ox - 12*s, oy - 66*s), (ox - 22*s, oy - 62*s)], fill=body)
    # head
    hx, hy = ox - 22*s, oy - 70*s
    # crest
    for i, dx in enumerate((2, 6, 10)):
        d.polygon([(hx + dx*s, hy - 6*s), (hx + (dx+10)*s, hy - (24 - i*3)*s),
                   (hx + (dx+4)*s, hy - 8*s)], fill=body_d)
    d.ellipse([hx - 14*s, hy - 14*s, hx + 12*s, hy + 12*s], fill=body, outline=body_d)
    # beak
    d.polygon([(hx - 24*s, hy), (hx - 12*s, hy - 6*s), (hx - 12*s, hy + 6*s)], fill=acc)
    d.polygon([(hx - 24*s, hy + 1*s), (hx - 12*s, hy + 2*s), (hx - 12*s, hy + 7*s)], fill=acc_d)
    # eye
    d.ellipse([hx - 8*s, hy - 8*s, hx + 2*s, hy + 2*s], fill=(255, 255, 255, 255))
    d.ellipse([hx - 5*s, hy - 5*s, hx - 1*s, hy - 1*s], fill=(0x16, 0x10, 0x0E, 255))


def main():
    cols, rows = 4, 2
    cw, ch = 200, 210
    pad_top = 44
    W, H = cols * cw, rows * ch + pad_top
    img = Image.new("RGBA", (W, H), (0x2B, 0x2F, 0x3A, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, pad_top], fill=(0x1E, 0x21, 0x29, 255))
    d.text((16, 14), "CHOCOBOS & CHICKABOS  -  colour variants", fill=(0xF2, 0xD0, 0x2C, 255))

    cells = [(n, b, bd, False) for (n, b, bd) in VARIANTS]
    cells.append(("Chickabo (chick)", VARIANTS[0][1], VARIANTS[0][2], True))
    cells.append(("+ breeds & rides!", None, None, None))

    for idx, cell in enumerate(cells):
        c, r = idx % cols, idx // cols
        cx0, cy0 = c * cw, pad_top + r * ch
        d.rectangle([cx0 + 4, cy0 + 4, cx0 + cw - 4, cy0 + ch - 4],
                    fill=(0x3A, 0x40, 0x4E, 255), outline=(0x53, 0x5B, 0x6B, 255))
        name = cell[0]
        if cell[1] is None:
            d.text((cx0 + 40, cy0 + ch // 2), name, fill=(0xBB, 0xC4, 0xD4, 255))
            continue
        ground = cy0 + ch - 30
        draw_chocobo(d, cx0 + cw // 2 + 18, ground, 1.9, cell[1], cell[2], baby=cell[3])
        tw = d.textlength(name)
        d.text((cx0 + (cw - tw) / 2, cy0 + ch - 22), name, fill=(0xE8, 0xEC, 0xF2, 255))

    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    out = os.path.join(ROOT, "docs", "preview.png")
    img.save(out)
    print("wrote", out)


if __name__ == "__main__":
    main()
