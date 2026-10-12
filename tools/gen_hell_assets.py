"""Generates Hell's models and pixel art: the Devil's geometry and skin, the
climbing souls' ghostly skin, the Hellmouth portal flipbook and the Heart
Scarab icon. Run: python3 tools/gen_hell_assets.py

The Devil's skin is resource_pack/textures/entity/devil.png. Replace it with
your own art to change his look (keep the same size and layout: each part's
place on the sheet is printed by this script and visible in the generated
file)."""
import json
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RP = ROOT / "resource_pack"
rnd = random.Random(666)


def save(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    print("wrote", path.relative_to(ROOT))


# ---------------------------------------------------------------------------
# The Devil: geometry with automatic box-UV packing, and a painted skin
# ---------------------------------------------------------------------------

TEX_W, TEX_H = 128, 128

# (bone, parent, pivot, rotation, [(part, origin, size)])
BONES = [
    ("root", None, [0, 0, 0], None, []),
    ("robe", "root", [0, 24, 0], None, [("robe", [-6, 0, -4], [12, 24, 8]), ("hem", [-6.5, 0, -4.5], [13, 3, 9])]),
    ("body", "root", [0, 24, 0], None, [("torso", [-5, 24, -3], [10, 13, 6]), ("collar", [-5.5, 34, -3.5], [11, 4, 7])]),
    ("head", "body", [0, 37, 0], None, [("head", [-4, 37, -4], [8, 9, 8])]),
    ("hornR", "head", [-4, 44, 0], None, [("horn1", [-6, 43, -1.5], [3, 3, 3]), ("horn2", [-8, 45, -1], [2.5, 3, 2.5]), ("horn3", [-9, 48, -0.5], [2, 3, 2]), ("horn4", [-8.5, 51, -0.25], [1.5, 3, 1.5])]),
    ("hornL", "head", [4, 44, 0], None, [("horn1", [3, 43, -1.5], [3, 3, 3]), ("horn2", [5.5, 45, -1], [2.5, 3, 2.5]), ("horn3", [7, 48, -0.5], [2, 3, 2]), ("horn4", [7, 51, -0.25], [1.5, 3, 1.5])]),
    ("rightArm", "body", [-6, 35, 0], None, [("arm", [-9, 19, -2], [3, 16, 4]), ("claw", [-9, 17, -2], [3, 2, 4])]),
    ("leftArm", "body", [6, 35, 0], None, [("arm", [6, 19, -2], [3, 16, 4]), ("claw", [6, 17, -2], [3, 2, 4])]),
    ("wingR", "body", [-2, 34, 3], [0, -24, 0], [("wing", [-15, 14, 3], [13, 32, 1]), ("wingbone", [-4, 40, 2.5], [2, 6, 2])]),
    ("wingL", "body", [2, 34, 3], [0, 24, 0], [("wing", [2, 14, 3], [13, 32, 1]), ("wingbone", [2, 40, 2.5], [2, 6, 2])]),
]

PAL = None
PALETTE = {
    "robe": ((26, 8, 10), (48, 12, 16)),
    "hem": ((140, 100, 30), (190, 140, 50)),
    "torso": ((18, 16, 20), (34, 30, 36)),
    "collar": ((40, 10, 14), (70, 16, 20)),
    "head": ((22, 18, 22), (40, 32, 38)),
    "horn1": ((40, 34, 30), (70, 60, 52)), "horn2": ((60, 52, 44), (90, 78, 64)),
    "horn3": ((90, 78, 60), (130, 110, 80)), "horn4": ((170, 130, 50), (220, 170, 70)),
    "arm": ((20, 16, 20), (36, 30, 36)), "claw": ((10, 8, 10), (24, 20, 22)),
    "wing": ((14, 10, 14), (34, 16, 22)), "wingbone": ((40, 30, 34), (60, 46, 50)),
}


def pack():
    """Shelf-packs every cube's box UV onto the sheet. Returns {(bone, i): (u, v)}."""
    cubes = []
    for bone, _, _, _, parts in BONES:
        for i, (part, origin, size) in enumerate(parts):
            w, h, d = (math.ceil(s) for s in size)
            cubes.append(((bone, i), 2 * (w + d), d + h))
    cubes.sort(key=lambda c: -c[2])
    placed, x, y, shelf = {}, 0, 0, 0
    for key, cw, ch in cubes:
        if x + cw > TEX_W:
            x, y, shelf = 0, y + shelf, 0
        placed[key] = (x, y)
        x += cw
        shelf = max(shelf, ch)
    assert y + shelf <= TEX_H, "Devil skin sheet overflow"
    return placed


def devil(palette=None, skin="devil", write_geo=True):
    """The Devil's model (also worn by the Furies and the Watcher, with their own skins)."""
    global PAL
    PAL = palette or PALETTE
    uv = pack()
    img = Image.new("RGBA", (TEX_W, TEX_H), (0, 0, 0, 0))
    bones = []
    for bone, parent, pivot, rot, parts in BONES:
        b = {"name": bone, "pivot": pivot}
        if parent:
            b["parent"] = parent
        if rot:
            b["rotation"] = rot
        cubes = []
        for i, (part, origin, size) in enumerate(parts):
            u, v = uv[(bone, i)]
            cubes.append({"origin": origin, "size": size, "uv": [u, v]})
            paint(img, part, u, v, [math.ceil(s) for s in size])
        if cubes:
            b["cubes"] = cubes
        bones.append(b)
    geo = {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {"identifier": "geometry.agartha.devil", "texture_width": TEX_W, "texture_height": TEX_H,
                            "visible_bounds_width": 4, "visible_bounds_height": 4.5, "visible_bounds_offset": [0, 2, 0]},
            "bones": bones,
        }],
    }
    if write_geo:
        path = RP / "models/entity/devil.geo.json"
        path.write_text(json.dumps(geo, indent=2) + "\n")
        print("wrote", path.relative_to(ROOT))
    save(img, RP / f"textures/entity/{skin}.png")


def paint(img, part, u, v, size):
    w, h, d = size
    lo, hi = PAL[part]
    faces = {
        "top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d),
        "east": (u, v + d, d, h), "front": (u + d, v + d, w, h),
        "west": (u + d + w, v + d, d, h), "back": (u + 2 * d + w, v + d, w, h),
    }
    for name, (x0, y0, fw, fh) in faces.items():
        for x in range(fw):
            for y in range(fh):
                t = rnd.random() * 0.6 + (y / max(1, fh)) * 0.4
                c = tuple(int(lo[k] + (hi[k] - lo[k]) * (1 - t if part.startswith("horn") else t)) for k in range(3))
                img.putpixel((x0 + x, y0 + y), c + (255,))
    fx, fy, _, _ = faces["front"]
    if part == "head":
        # Burning eyes, a cruel mouth, a widow's peak.
        eye, eye2 = PAL.get("eyes", ((255, 120, 20), (255, 200, 60)))
        for ex in (1, 5):
            img.putpixel((fx + ex, fy + 4), eye + (255,))
            img.putpixel((fx + ex + 1, fy + 4), eye2 + (255,))
            img.putpixel((fx + ex, fy + 3), (90, 10, 10, 255))
        for mx in range(2, 6):
            img.putpixel((fx + mx, fy + 7), (90, 10, 14, 255))
        img.putpixel((fx + 2, fy + 6), (200, 190, 170, 255))
        img.putpixel((fx + 5, fy + 6), (200, 190, 170, 255))
        for k in range(3):
            img.putpixel((fx + 3 + (k % 2), fy + k), (10, 8, 10, 255))
    elif part in ("robe", "torso", "collar"):
        # A gilded seam down the front, and runes on the robe.
        for y in range(h):
            img.putpixel((fx + w // 2, fy + y), (170, 125, 45, 255))
        if part == "robe":
            for k in range(6):
                rx, ry = fx + 1 + (k * 5) % (w - 2), fy + 3 + k * 3
                img.putpixel((rx, ry), (160, 30, 30, 255))
                img.putpixel((rx, ry + 1), (160, 30, 30, 255))
    elif part == "wing":
        # Leathery membranes with red veins.
        bx, by, bw, bh = faces["front"]
        for k in range(4):
            x0 = bx + 1 + k * 3
            for y in range(bh):
                xx = min(bx + bw - 1, x0 + y // 9)
                img.putpixel((xx, by + y), (90, 14, 20, 255))
        bx, by, bw, bh = faces["back"]
        for k in range(4):
            x0 = bx + 1 + k * 3
            for y in range(bh):
                xx = min(bx + bw - 1, x0 + y // 9)
                img.putpixel((xx, by + y), (70, 12, 16, 255))
    elif part == "claw":
        for x in range(w):
            img.putpixel((fx + x, fy + h - 1), (200, 190, 170, 255))


# ---------------------------------------------------------------------------
# The climbing souls: a translucent, hollow-eyed ghost on the humanoid layout
# ---------------------------------------------------------------------------

def soul():
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    base_regions = [(0, 0, 32, 16), (16, 16, 24, 16), (40, 16, 16, 16), (0, 16, 16, 16), (32, 48, 16, 16), (16, 48, 16, 16)]
    for x0, y0, w, h in base_regions:
        for x in range(w):
            for y in range(h):
                v = rnd.randint(-12, 12)
                a = 130 + rnd.randint(-20, 30)
                img.putpixel((x0 + x, y0 + y), (150 + v, 190 + v, 210 + v, a))
    # Rags (overlay layer), torn at the edges.
    for x0, y0, w, h in [(16, 32, 24, 16), (40, 32, 16, 16), (0, 32, 16, 16), (48, 48, 16, 16), (0, 48, 16, 16)]:
        for x in range(w):
            for y in range(h):
                if rnd.random() < 0.35 + y / h * 0.4:
                    continue
                v = rnd.randint(-10, 10)
                img.putpixel((x0 + x, y0 + y), (90 + v, 110 + v, 125 + v, 150))
    # Hollow eyes and an open mouth on the face (head front: 8..16, 8..16).
    for (x, y) in [(9, 11), (10, 11), (13, 11), (14, 11), (9, 12), (10, 12), (13, 12), (14, 12), (11, 14), (12, 14), (11, 15), (12, 15)]:
        img.putpixel((x, y), (10, 14, 20, 230))
    save(img, RP / "textures/entity/soul.png")


# ---------------------------------------------------------------------------
# The Hellmouth portal and the Heart Scarab
# ---------------------------------------------------------------------------

def hell_portal(n=8):
    img = Image.new("RGBA", (16, 16 * n))
    for f in range(n):
        ph = f / n * 2 * math.pi
        for x in range(16):
            for y in range(16):
                dx, dy = x - 7.5, y - 7.5
                r = math.hypot(dx, dy)
                a = math.atan2(dy, dx)
                s = 0.5 + 0.5 * math.sin(a * 2 - r * 1.1 + ph * 2)
                g = 0.5 + 0.5 * math.sin(x * 0.5 - y * 0.8 - ph)
                vv = 0.6 * s + 0.4 * g
                img.putpixel((x, y + 16 * f), (int(60 + 170 * vv), int(5 + 50 * vv * vv), int(10 + 20 * vv), int(200 + 50 * vv)))
    return img


def heart_scarab():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((4, 4, 11, 13), fill=(20, 18, 22, 255), outline=(190, 140, 50, 255))
    d.ellipse((5, 1, 10, 5), fill=(24, 20, 26, 255), outline=(190, 140, 50, 255))
    d.line((7.5, 5, 7.5, 13), fill=(190, 140, 50, 255))
    d.ellipse((6, 7, 9, 10), fill=(200, 20, 30, 255))
    for (a, b) in [((4, 6), (1, 4)), ((11, 6), (14, 4)), ((4, 9), (1, 10)), ((11, 9), (14, 10)), ((5, 12), (2, 14)), ((10, 12), (13, 14))]:
        d.line((*a, *b), fill=(60, 50, 40, 255))
    return img


FURY = {
    "robe": ((40, 40, 44), (70, 70, 74)), "hem": ((30, 30, 32), (50, 50, 54)),
    "torso": ((150, 146, 140), (190, 186, 178)), "collar": ((60, 60, 64), (90, 90, 94)),
    "head": ((160, 156, 150), (200, 196, 188)),
    "horn1": ((40, 70, 40), (60, 100, 60)), "horn2": ((50, 80, 46), (70, 110, 64)),
    "horn3": ((60, 90, 52), (84, 120, 70)), "horn4": ((70, 100, 60), (100, 140, 80)),
    "arm": ((150, 146, 140), (186, 182, 174)), "claw": ((30, 26, 26), (50, 44, 44)),
    "wing": ((8, 8, 10), (24, 22, 26)), "wingbone": ((60, 56, 56), (90, 86, 86)),
    "eyes": ((250, 250, 250), (200, 230, 255)),
}
WATCHER = {k: ((4, 4, 6), (14, 12, 16)) for k in PALETTE}
WATCHER["eyes"] = ((255, 255, 255), (230, 230, 230))


def damned():
    """The Damned: charred, cracked with fire, hollow-eyed, on the humanoid skin layout."""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    for x0, y0, w, h in [(0, 0, 32, 16), (16, 16, 24, 16), (40, 16, 16, 16), (0, 16, 16, 16), (32, 48, 16, 16), (16, 48, 16, 16)]:
        for x in range(w):
            for y in range(h):
                v = rnd.randint(0, 14)
                c = (22 + v, 16 + v // 2, 14 + v // 2, 255)
                if rnd.random() < 0.08:
                    c = (200 + rnd.randint(0, 55), 60 + rnd.randint(0, 50), 10, 255)  # cracks of fire
                elif rnd.random() < 0.12:
                    c = (110 + rnd.randint(0, 30), 30, 28, 255)  # raw flesh
                img.putpixel((x0 + x, y0 + y), c)
    # Ribs on the chest (body front: 20..28, 20..32).
    for y in (22, 24, 26):
        for x in range(21, 27):
            img.putpixel((x, y), (200, 190, 170, 255))
    # Burning eye sockets and a gaping mouth (head front 8..16, 8..16).
    for (x, y) in [(9, 11), (10, 11), (13, 11), (14, 11)]:
        img.putpixel((x, y), (255, 140, 20, 255))
    for (x, y) in [(9, 12), (10, 12), (13, 12), (14, 12)]:
        img.putpixel((x, y), (120, 20, 10, 255))
    for x in range(10, 14):
        for y in (14, 15):
            img.putpixel((x, y), (10, 4, 4, 255))
    # Rags on the overlay.
    for x0, y0, w, h in [(16, 32, 24, 16), (0, 32, 16, 16), (0, 48, 16, 16)]:
        for x in range(w):
            for y in range(h):
                if rnd.random() < 0.45 + y / h * 0.4:
                    continue
                v = rnd.randint(0, 12)
                img.putpixel((x0 + x, y0 + y), (40 + v, 30 + v, 26 + v, 255))
    save(img, RP / "textures/entity/damned.png")


# The hellhound: a quadruped of our own (head toward -z).
HOUND_W, HOUND_H = 64, 64
HOUND_BONES = [
    ("root", None, [0, 0, 0], [], None),
    ("body", "root", [0, 12, 0], [("body", [-4, 9, -7], [8, 8, 16]), ("ridge", [-1, 17, -6], [2, 2, 12])], None),
    ("head", "body", [0, 15, -7], [("head", [-4, 12, -14], [8, 7, 7]), ("snout", [-2.5, 12, -18], [5, 4, 4]), ("ear", [-4, 19, -11], [2, 3, 1]), ("ear", [2, 19, -11], [2, 3, 1])], None),
    ("jaw", "head", [0, 12, -14], [("jaw", [-2.5, 10, -18], [5, 2, 4])], None),
    ("leg0", "body", [-2.5, 10, -5], [("leg", [-4, 0, -6.5], [3, 10, 3])], None),
    ("leg1", "body", [2.5, 10, -5], [("leg", [1, 0, -6.5], [3, 10, 3])], None),
    ("leg2", "body", [-2.5, 10, 6], [("leg", [-4, 0, 4.5], [3, 10, 3])], None),
    ("leg3", "body", [2.5, 10, 6], [("leg", [1, 0, 4.5], [3, 10, 3])], None),
    ("tail", "body", [0, 15, 9], [("tail", [-1, 8, 9], [2, 7, 2])], [30, 0, 0]),
]
HOUND_PAL = {
    "body": ((14, 10, 10), (34, 20, 18)), "ridge": ((180, 170, 150), (220, 210, 190)),
    "head": ((14, 10, 10), (30, 18, 16)), "snout": ((20, 12, 12), (40, 22, 20)), "ear": ((10, 8, 8), (24, 14, 14)),
    "jaw": ((60, 14, 14), (90, 20, 20)), "leg": ((12, 10, 10), (30, 20, 18)), "tail": ((14, 10, 10), (30, 18, 16)),
}


def hellhound():
    cubes = []
    for bone, _, _, parts, _ in HOUND_BONES:
        for i, (part, origin, size) in enumerate(parts):
            w, h, d = (math.ceil(s) for s in size)
            cubes.append(((bone, i), 2 * (w + d), d + h))
    cubes.sort(key=lambda c: -c[2])
    uv, x, y, shelf = {}, 0, 0, 0
    for key, cw, ch in cubes:
        if x + cw > HOUND_W:
            x, y, shelf = 0, y + shelf, 0
        uv[key] = (x, y)
        x += cw
        shelf = max(shelf, ch)
    assert y + shelf <= HOUND_H
    img = Image.new("RGBA", (HOUND_W, HOUND_H), (0, 0, 0, 0))
    global PAL
    PAL = HOUND_PAL
    bones = []
    for bone, parent, pivot, parts, rot in HOUND_BONES:
        b = {"name": bone, "pivot": pivot}
        if parent:
            b["parent"] = parent
        if rot:
            b["rotation"] = rot
        cs = []
        for i, (part, origin, size) in enumerate(parts):
            u, v = uv[(bone, i)]
            cs.append({"origin": origin, "size": size, "uv": [u, v]})
            paint(img, part, u, v, [math.ceil(s) for s in size])
            if part == "body":  # glowing scars along the flanks
                for k in range(0, 16, 3):
                    img.putpixel((u + k % 16, v + 16 + 3), (220, 70, 10, 255))
                    img.putpixel((u + 24 + k % 8, v + 16 + 5), (220, 70, 10, 255))
            if part == "head":  # burning eyes
                fx, fy = u + 7, v + 7
                img.putpixel((fx + 1, fy + 2), (255, 140, 20, 255))
                img.putpixel((fx + 6, fy + 2), (255, 140, 20, 255))
            if part == "jaw":  # teeth
                fx, fy = u + 4, v + 4
                for k in range(0, 5, 2):
                    img.putpixel((fx + k, fy), (230, 220, 200, 255))
        if cs:
            b["cubes"] = cs
        bones.append(b)
    geo = {"format_version": "1.12.0", "minecraft:geometry": [{"description": {"identifier": "geometry.agartha.hellhound", "texture_width": HOUND_W, "texture_height": HOUND_H, "visible_bounds_width": 3, "visible_bounds_height": 2.5, "visible_bounds_offset": [0, 0.75, 0]}, "bones": bones}]}
    path = RP / "models/entity/hellhound.geo.json"
    path.write_text(json.dumps(geo, indent=2) + "\n")
    print("wrote", path.relative_to(ROOT))
    save(img, RP / "textures/entity/hellhound.png")


if __name__ == "__main__":
    devil()
    devil(FURY, "fury", write_geo=False)
    devil(WATCHER, "watcher", write_geo=False)
    damned()
    hellhound()
    soul()
    save(hell_portal(), RP / "textures/blocks/agartha_hell_portal.png")
    save(heart_scarab(), RP / "textures/items/heart_scarab.png")
