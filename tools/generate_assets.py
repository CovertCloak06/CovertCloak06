#!/usr/bin/env python3
"""
Generate all geometry + textures for the Chocobos & Chickabos add-on.

Single source of truth: the bone/cube tables below describe each model once.
From that data we emit:
  * Bedrock geometry JSON  (models/entity/chocobo.geo.json, chickabo.geo.json)
  * One texture per colour variant for both adult and baby (box-UV matched)
  * The Gysahl Green item icon
  * Behavior + Resource pack icons

Because the textures are painted from the exact same UV coordinates that the
geometry uses, the model and skin can never drift out of sync.
"""

import json
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "Chocobos_RP")
BP = os.path.join(ROOT, "Chocobos_BP")

TEX_W, TEX_H = 128, 64

# ---------------------------------------------------------------------------
# Colour palettes per variant: (body, body_shadow, body_light, accent, accent_shadow)
# accent = beak / legs / feet
# ---------------------------------------------------------------------------
ACCENT = (0xE8, 0x82, 0x1E)
ACCENT_DARK = (0xB5, 0x63, 0x1A)
SADDLE = (0x6B, 0x47, 0x2A)
SADDLE_DARK = (0x4A, 0x30, 0x1C)

PALETTES = {
    "yellow": ((0xF2, 0xD0, 0x2C), (0xC9, 0xA4, 0x1E), (0xFC, 0xE8, 0x8A)),
    "black":  ((0x32, 0x32, 0x3C), (0x16, 0x16, 0x1C), (0x50, 0x50, 0x5E)),
    "red":    ((0xC8, 0x3A, 0x2B), (0x8E, 0x28, 0x1D), (0xE0, 0x64, 0x4F)),
    "blue":   ((0x3A, 0x78, 0xC8), (0x28, 0x56, 0x99), (0x6B, 0xA0, 0xE0)),
    "green":  ((0x4C, 0xA6, 0x4C), (0x35, 0x7A, 0x35), (0x79, 0xC7, 0x79)),
    "gold":   ((0xE8, 0xB8, 0x24), (0xB8, 0x8A, 0x10), (0xFF, 0xE2, 0x7A)),
}
# gold gets a richer accent
ACCENT_BY_VARIANT = {
    "gold": ((0xD9, 0xA0, 0x12), (0xA8, 0x78, 0x0A)),
}

# ---------------------------------------------------------------------------
# Model definitions. Each cube: origin, size, uv, kind ("body"|"accent"),
# optional "eyes": True to paint a face on its north side.
# ---------------------------------------------------------------------------
CHOCOBO_BONES = [
    {"name": "body", "pivot": [0, 12, 0],
     "cubes": [{"origin": [-4, 9, -6], "size": [8, 8, 12], "uv": [0, 0], "kind": "body"}]},
    {"name": "tail", "parent": "body", "pivot": [0, 15, 6], "rotation": [-45, 0, 0],
     "cubes": [{"origin": [-3, 13, 6], "size": [6, 6, 2], "uv": [36, 22], "kind": "body"}]},
    {"name": "wing_left", "parent": "body", "pivot": [4, 16, -2],
     "cubes": [{"origin": [4, 11, -3], "size": [1, 5, 7], "uv": [0, 22], "kind": "body"}]},
    {"name": "wing_right", "parent": "body", "pivot": [-4, 16, -2],
     "cubes": [{"origin": [-5, 11, -3], "size": [1, 5, 7], "uv": [18, 22], "kind": "body"}]},
    {"name": "neck", "parent": "body", "pivot": [0, 16, -4], "rotation": [18, 0, 0],
     "cubes": [{"origin": [-2, 16, -6], "size": [4, 7, 4], "uv": [42, 0], "kind": "body"}]},
    {"name": "head", "parent": "neck", "pivot": [0, 23, -5],
     "cubes": [{"origin": [-3, 23, -9], "size": [6, 6, 6], "uv": [60, 0], "kind": "body", "eyes": True}]},
    {"name": "beak", "parent": "head", "pivot": [0, 24, -9],
     "cubes": [{"origin": [-1.5, 24, -13], "size": [3, 2, 4], "uv": [86, 0], "kind": "accent"}]},
    {"name": "crest", "parent": "head", "pivot": [0, 29, -4], "rotation": [-35, 0, 0],
     "cubes": [
         {"origin": [-0.5, 29, -6], "size": [1, 5, 4], "uv": [102, 0], "kind": "body"},
         {"origin": [-0.5, 29, -4], "size": [1, 5, 4], "uv": [102, 10], "kind": "body"},
         {"origin": [-0.5, 29, -2], "size": [1, 4, 3], "uv": [114, 0], "kind": "body"},
     ]},
    {"name": "leg_left", "parent": "body", "pivot": [2, 9, 0],
     "cubes": [{"origin": [1, 2, -1], "size": [2, 7, 2], "uv": [54, 22], "kind": "accent"}]},
    {"name": "leg_right", "parent": "body", "pivot": [-2, 9, 0],
     "cubes": [{"origin": [-3, 2, -1], "size": [2, 7, 2], "uv": [64, 22], "kind": "accent"}]},
    {"name": "foot_left", "parent": "leg_left", "pivot": [2, 2, 0],
     "cubes": [{"origin": [0, 1, -3], "size": [4, 1, 5], "uv": [74, 22], "kind": "accent"}]},
    {"name": "foot_right", "parent": "leg_right", "pivot": [-2, 2, 0],
     "cubes": [{"origin": [-4, 1, -3], "size": [4, 1, 5], "uv": [94, 22], "kind": "accent"}]},
    {"name": "saddle", "parent": "body", "pivot": [0, 17, 0],
     "cubes": [
         {"origin": [-4, 17, -3], "size": [8, 2, 8], "uv": [0, 36], "kind": "saddle"},
         {"origin": [-4, 19, 3], "size": [8, 2, 1], "uv": [34, 36], "kind": "saddle"},
         {"origin": [-2, 19, -3], "size": [4, 2, 1], "uv": [86, 36], "kind": "saddle"},
         {"origin": [4, 13, -1], "size": [1, 4, 6], "uv": [54, 36], "kind": "saddle"},
         {"origin": [-5, 13, -1], "size": [1, 4, 6], "uv": [70, 36], "kind": "saddle"},
     ]},
]

CHICKABO_BONES = [
    {"name": "body", "pivot": [0, 7, 0],
     "cubes": [{"origin": [-3, 5, -3], "size": [6, 5, 7], "uv": [0, 0], "kind": "body"}]},
    {"name": "tail", "parent": "body", "pivot": [0, 8, 4], "rotation": [-45, 0, 0],
     "cubes": [{"origin": [-2, 7, 4], "size": [4, 3, 2], "uv": [24, 14], "kind": "body"}]},
    {"name": "wing_left", "parent": "body", "pivot": [3, 8, -1],
     "cubes": [{"origin": [3, 6, -2], "size": [1, 3, 4], "uv": [0, 14], "kind": "body"}]},
    {"name": "wing_right", "parent": "body", "pivot": [-3, 8, -1],
     "cubes": [{"origin": [-4, 6, -2], "size": [1, 3, 4], "uv": [12, 14], "kind": "body"}]},
    {"name": "head", "parent": "body", "pivot": [0, 10, -3],
     "cubes": [{"origin": [-3, 9, -7], "size": [6, 6, 6], "uv": [28, 0], "kind": "body", "eyes": True}]},
    {"name": "beak", "parent": "head", "pivot": [0, 10, -7],
     "cubes": [{"origin": [-1, 10, -9], "size": [2, 2, 2], "uv": [54, 0], "kind": "accent"}]},
    {"name": "crest", "parent": "head", "pivot": [0, 15, -4], "rotation": [-25, 0, 0],
     "cubes": [{"origin": [-0.5, 15, -4], "size": [1, 3, 3], "uv": [64, 0], "kind": "body"}]},
    {"name": "leg_left", "parent": "body", "pivot": [1.5, 5, 0],
     "cubes": [{"origin": [0.5, 2, -1], "size": [2, 3, 2], "uv": [38, 14], "kind": "accent"}]},
    {"name": "leg_right", "parent": "body", "pivot": [-1.5, 5, 0],
     "cubes": [{"origin": [-2.5, 2, -1], "size": [2, 3, 2], "uv": [48, 14], "kind": "accent"}]},
    {"name": "foot_left", "parent": "leg_left", "pivot": [1.5, 2, 0],
     "cubes": [{"origin": [0, 1, -2], "size": [3, 1, 4], "uv": [58, 14], "kind": "accent"}]},
    {"name": "foot_right", "parent": "leg_right", "pivot": [-1.5, 2, 0],
     "cubes": [{"origin": [-3, 1, -2], "size": [3, 1, 4], "uv": [74, 14], "kind": "accent"}]},
]


# ---------------------------------------------------------------------------
# Geometry emission
# ---------------------------------------------------------------------------
def build_geometry(identifier, bones, bounds):
    out_bones = []
    for b in bones:
        bone = {"name": b["name"], "pivot": b["pivot"]}
        if "parent" in b:
            bone["parent"] = b["parent"]
        if "rotation" in b:
            bone["rotation"] = b["rotation"]
        bone["cubes"] = [{"origin": c["origin"], "size": c["size"], "uv": c["uv"]}
                         for c in b["cubes"]]
        out_bones.append(bone)
    return {
        "format_version": "1.16.0",
        "minecraft:geometry": [
            {
                "description": {
                    "identifier": identifier,
                    "texture_width": TEX_W,
                    "texture_height": TEX_H,
                    "visible_bounds_width": bounds[0],
                    "visible_bounds_height": bounds[1],
                    "visible_bounds_offset": bounds[2],
                },
                "bones": out_bones,
            }
        ],
    }


# ---------------------------------------------------------------------------
# Texture painting
# ---------------------------------------------------------------------------
def shade(draw, x, y, w, h, base, light, dark):
    """Fill a rect with a simple top-light / bottom-dark vertical shade."""
    if w <= 0 or h <= 0:
        return
    for row in range(h):
        if h >= 4 and row < max(1, h // 4):
            col = light
        elif h >= 4 and row >= h - max(1, h // 4):
            col = dark
        else:
            col = base
        draw.rectangle([x, y + row, x + w - 1, y + row], fill=col + (255,))


def paint_cube(draw, cube, body, body_l, body_d, accent, accent_d):
    u, v = cube["uv"]
    w, h, d = [int(round(s)) for s in cube["size"]]
    fp_w = 2 * (w + d)
    fp_h = h + d
    if cube["kind"] == "accent":
        shade(draw, u, v, fp_w, fp_h, accent, _lighten(accent), accent_d)
    elif cube["kind"] == "saddle":
        shade(draw, u, v, fp_w, fp_h, SADDLE, _lighten(SADDLE), SADDLE_DARK)
    else:
        shade(draw, u, v, fp_w, fp_h, body, body_l, body_d)


def _lighten(c, amt=24):
    return tuple(min(255, x + amt) for x in c)


def paint_eyes(draw, cube, baby):
    """Paint a face on the north side of the given cube's box-UV footprint."""
    u, v = cube["uv"]
    w, h, d = [int(round(s)) for s in cube["size"]]
    # north face top-left within the box-UV unwrap
    nx, ny = u + d, v + d
    dark = (0x1A, 0x12, 0x10, 255)
    white = (0xFF, 0xFF, 0xFF, 255)
    if baby:
        # big cute eyes
        for ex in (nx + 1, nx + w - 3):
            draw.rectangle([ex, ny + 1, ex + 1, ny + 2], fill=dark)
            draw.point((ex, ny + 1), fill=white)
    else:
        for ex in (nx + 1, nx + w - 3):
            draw.rectangle([ex, ny + 2, ex + 1, ny + 3], fill=dark)
            draw.point((ex, ny + 2), fill=white)


def build_texture(bones, palette, accent, accent_d, baby):
    body, body_d, body_l = palette
    img = Image.new("RGBA", (TEX_W, TEX_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for b in bones:
        for c in b["cubes"]:
            paint_cube(draw, c, body, body_l, body_d, accent, accent_d)
    # eyes last so they sit on top
    for b in bones:
        for c in b["cubes"]:
            if c.get("eyes"):
                paint_eyes(draw, c, baby)
    return img


# ---------------------------------------------------------------------------
# Item + pack icons
# ---------------------------------------------------------------------------
def build_gysahl_icon():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    leaf = (0x4F, 0xA8, 0x3A)
    leaf_d = (0x37, 0x7A, 0x28)
    leaf_l = (0x76, 0xC9, 0x55)
    root = (0xF2, 0xE8, 0xC8)
    root_d = (0xCF, 0xC2, 0x96)
    # leafy green tops
    for (x, y) in [(7, 1), (5, 2), (9, 2), (6, 3), (8, 3), (7, 3)]:
        d.rectangle([x, y, x + 1, y + 2], fill=leaf)
    d.rectangle([6, 3, 9, 6], fill=leaf)
    d.point((6, 3), fill=leaf_l)
    d.point((9, 5), fill=leaf_d)
    d.rectangle([7, 4, 8, 6], fill=leaf_l)
    # pale root bulb
    d.ellipse([5, 6, 10, 13], fill=root)
    d.ellipse([5, 6, 10, 13], outline=root_d)
    d.rectangle([7, 13, 8, 15], fill=root_d)  # little tail
    return img


def build_gysahl_seeds_icon():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    seed = (0x6F, 0xA8, 0x3A)
    seed_d = (0x47, 0x6E, 0x22)
    husk = (0xC9, 0xB8, 0x7A)
    pts = [(4, 9), (7, 5), (9, 10), (6, 11), (10, 6), (3, 6), (8, 8), (11, 9), (5, 7)]
    for i, (x, y) in enumerate(pts):
        c = seed if i % 2 == 0 else husk
        d.rectangle([x, y, x + 1, y + 1], fill=c)
        d.point((x, y), fill=seed_d if c == seed else husk)
    return img


def build_crop_textures():
    """4 growth stages for the Gysahl crop (16x16, drawn bottom-up)."""
    leaf = (0x4F, 0xA8, 0x3A, 255)
    leaf_d = (0x37, 0x7A, 0x28, 255)
    leaf_l = (0x76, 0xC9, 0x55, 255)
    root = (0xF2, 0xE8, 0xC8, 255)
    imgs = []
    # (top_y of growth, has_root, has_tops) per stage — smaller top_y = taller
    stages = [(13, False, False), (10, False, False), (6, False, True), (2, True, True)]
    for top_y, has_root, has_tops in stages:
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        # central clump of stalks
        for sx in (5, 7, 9, 11):
            jitter = (sx % 3)
            d.line([(sx, 15), (sx - 1 + jitter, top_y + 2)], fill=leaf, width=1)
            d.line([(sx + 1, 15), (sx + jitter, top_y + 3)], fill=leaf_d, width=1)
        # leafy crown
        d.ellipse([4, top_y, 12, top_y + 6], fill=leaf)
        d.ellipse([4, top_y, 12, top_y + 6], outline=leaf_d)
        d.point((6, top_y + 1), fill=leaf_l)
        d.point((9, top_y + 1), fill=leaf_l)
        if has_tops:
            for tx in (5, 8, 11):
                d.line([(tx, top_y + 2), (tx, top_y - 2)], fill=leaf_l, width=1)
        if has_root:
            d.ellipse([6, 12, 10, 15], fill=root)  # pale root peeking at soil
        imgs.append(img)
    return imgs


def build_pack_icon(tag=""):
    img = Image.new("RGBA", (128, 128), (0x8E, 0xC7, 0xF0, 255))
    d = ImageDraw.Draw(img)
    # ground
    d.rectangle([0, 96, 128, 128], fill=(0x6F, 0xB8, 0x4A, 255))
    yellow = (0xF2, 0xD0, 0x2C, 255)
    yellow_d = (0xC9, 0xA4, 0x1E, 255)
    accent = (0xE8, 0x82, 0x1E, 255)
    # crest feathers
    for i, x in enumerate((52, 60, 68)):
        d.polygon([(x, 14 + i % 2 * 2), (x - 6, 40), (x + 6, 40)], fill=yellow_d)
    # head
    d.ellipse([40, 30, 88, 78], fill=yellow)
    d.ellipse([40, 30, 88, 78], outline=yellow_d, width=2)
    # beak
    d.polygon([(36, 52), (54, 46), (54, 60)], fill=accent)
    # eye
    d.ellipse([60, 44, 72, 56], fill=(255, 255, 255, 255))
    d.ellipse([64, 47, 70, 53], fill=(0x1A, 0x12, 0x10, 255))
    # neck/body hint
    d.rectangle([56, 76, 76, 104], fill=yellow)
    d.rectangle([56, 76, 76, 104], outline=yellow_d)
    if tag:
        d.rectangle([0, 0, 128, 14], fill=(0, 0, 0, 90))
        d.text((4, 3), tag, fill=(255, 255, 255, 255))
    return img


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print("  wrote", os.path.relpath(path, ROOT))


def main():
    # --- geometry ---
    write_json(os.path.join(RP, "models/entity/chocobo.geo.json"),
               build_geometry("geometry.chocobo", CHOCOBO_BONES, [3, 3.5, [0, 1.5, 0]]))
    write_json(os.path.join(RP, "models/entity/chickabo.geo.json"),
               build_geometry("geometry.chickabo", CHICKABO_BONES, [2, 2, [0, 1, 0]]))

    # --- textures ---
    tex_dir = os.path.join(RP, "textures/entity/chocobo")
    os.makedirs(tex_dir, exist_ok=True)
    for name, palette in PALETTES.items():
        acc, acc_d = ACCENT_BY_VARIANT.get(name, (ACCENT, ACCENT_DARK))
        adult = build_texture(CHOCOBO_BONES, palette, acc, acc_d, baby=False)
        baby = build_texture(CHICKABO_BONES, palette, acc, acc_d, baby=True)
        adult.save(os.path.join(tex_dir, "chocobo_%s.png" % name))
        baby.save(os.path.join(tex_dir, "chickabo_%s.png" % name))
        print("  wrote textures for variant:", name)

    # --- item icons ---
    item_dir = os.path.join(RP, "textures/items")
    os.makedirs(item_dir, exist_ok=True)
    build_gysahl_icon().save(os.path.join(item_dir, "gysahl_green.png"))
    build_gysahl_seeds_icon().save(os.path.join(item_dir, "gysahl_seeds.png"))
    print("  wrote item icons: gysahl_green.png, gysahl_seeds.png")

    # --- crop block textures ---
    block_dir = os.path.join(RP, "textures/blocks")
    os.makedirs(block_dir, exist_ok=True)
    for i, im in enumerate(build_crop_textures()):
        im.save(os.path.join(block_dir, "gysahl_crop_stage_%d.png" % i))
    print("  wrote crop stage textures (4)")

    # --- pack icons ---
    build_pack_icon("BP").save(os.path.join(BP, "pack_icon.png"))
    build_pack_icon("RP").save(os.path.join(RP, "pack_icon.png"))
    print("  wrote pack icons")


if __name__ == "__main__":
    print("Generating Chocobo assets...")
    main()
    print("Done.")
