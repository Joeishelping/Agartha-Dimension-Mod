"""Generates the add-on's pixel-art textures. Run: python3 tools/gen_textures.py"""
import random
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RP = ROOT / "resource_pack"
BP = ROOT / "behavior_pack"
rnd = random.Random(7)


def save(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def cloud():
    img = Image.new("RGBA", (16, 16))
    for x in range(16):
        for y in range(16):
            v = 236 + rnd.randint(0, 19)
            img.putpixel((x, y), (v, min(255, v + 4), 255, 205 + rnd.randint(0, 25)))
    return img


def gate_keystone():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(4, 14), (12, 14), (14, 4), (8, 1), (2, 4)], fill=(236, 232, 222, 255), outline=(170, 160, 140, 255))
    d.polygon([(6, 12), (10, 12), (11, 6), (8, 4), (5, 6)], fill=(140, 215, 255, 255))
    d.point([(8, 7), (7, 8), (9, 8), (8, 9)], fill=(255, 255, 255, 255))
    d.line((3, 4, 8, 1), fill=(250, 205, 60, 255))
    d.line((8, 1, 13, 4), fill=(250, 205, 60, 255))
    return img


def portal_frames(n=8):
    """Swirling icy portal: n stacked 16x16 frames for a flipbook texture."""
    import math
    img = Image.new("RGBA", (16, 16 * n))
    for f in range(n):
        ph = f / n * 2 * math.pi
        for x in range(16):
            for y in range(16):
                dx, dy = x - 7.5, y - 7.5
                r = math.hypot(dx, dy)
                a = math.atan2(dy, dx)
                s = 0.5 + 0.5 * math.sin(a * 3 + r * 0.9 - ph * 2)
                g = 0.5 + 0.5 * math.sin(x * 0.7 + y * 0.4 + ph)
                v = 0.55 * s + 0.45 * g
                img.putpixel((x, y + 16 * f), (int(150 + 100 * v), int(200 + 55 * v), 255, int(150 + 80 * v)))
    return img


def jarl_axe():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.line((3, 14, 11, 4), fill=(110, 75, 45, 255), width=2)
    d.polygon([(9, 1), (15, 3), (15, 9), (11, 6)], fill=(170, 225, 255, 255), outline=(70, 120, 170, 255))
    d.line((12, 3, 14, 7), fill=(240, 252, 255, 255))
    d.point([(4, 13), (6, 11)], fill=(200, 160, 60, 255))
    return img


def mead_horn():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pts = [(2, 3), (5, 2), (9, 4), (12, 8), (14, 13), (12, 13), (10, 9), (6, 6), (3, 6)]
    d.polygon(pts, fill=(230, 210, 170, 255), outline=(120, 90, 50, 255))
    d.line((2, 3, 3, 6), fill=(230, 170, 40, 255), width=2)
    d.line((7, 4, 6, 6), fill=(180, 140, 60, 255))
    d.line((10, 6, 9, 8), fill=(180, 140, 60, 255))
    return img


def snowflake():
    img = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((1, 1, 6, 6), fill=(255, 255, 255, 230))
    return img


def aurora():
    """Vertical aurora curtain strip: violet crown, teal middle, bright green hem."""
    img = Image.new("RGBA", (8, 64))
    for y in range(64):
        t = y / 63  # 0 top .. 1 bottom
        if t < 0.35:
            c = (150, 90, 230)
            k = t / 0.35
            c = tuple(int(a + (b2 - a) * k) for a, b2 in zip(c, (60, 220, 210)))
        else:
            k = (t - 0.35) / 0.65
            c = tuple(int(a + (b2 - a) * k) for a, b2 in zip((60, 220, 210), (90, 255, 140)))
        alpha = (t ** 1.3) * (1 - max(0, t - 0.92) * 12)
        for x in range(8):
            edge = 1 - abs(x - 3.5) / 4.5
            img.putpixel((x, y), c + (max(0, int(255 * alpha * edge)),))
    return img


def mist():
    import math
    img = Image.new("RGBA", (32, 32))
    for x in range(32):
        for y in range(32):
            d = math.hypot(x - 15.5, y - 15.5) / 16
            img.putpixel((x, y), (255, 255, 255, max(0, int(255 * (1 - d) ** 2))))
    return img


def allfather_skin():
    """Default 64x64 skin (standard Minecraft skin layout). Replace freely."""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    px = img.load()

    def faces(u, v, w, h, d):
        return {
            "top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d),
            "right": (u, v + d, d, h), "front": (u + d, v + d, w, h),
            "left": (u + d + w, v + d, d, h), "back": (u + 2 * d + w, v + d, w, h),
        }

    def paint(rect, fn):
        x0, y0, w, h = rect
        for x in range(w):
            for y in range(h):
                c = fn(x, y, w, h)
                if c:
                    px[x0 + x, y0 + y] = c

    SKIN, HAIR, GOLD = (232, 196, 170, 255), (246, 246, 250, 255), (250, 205, 60, 255)
    ROBE, TRIM, EYE = (238, 240, 248, 255), (70, 150, 220, 255), (90, 200, 255, 255)
    noise = lambda c, k: tuple(min(255, max(0, v + k)) for v in c[:3]) + (255,)

    head = faces(0, 0, 8, 8, 8)
    for name, r in head.items():
        if name == "front":
            def f(x, y, w, h):
                if y <= 1: return HAIR
                if y == 3 and x in (1, 2, 5, 6): return EYE if x in (2, 5) else (255, 255, 255, 255)
                if y >= 5 or (y == 4 and x in (0, 7)): return noise(HAIR, -6 * ((x + y) % 2))
                return SKIN
        elif name in ("top", "back"):
            def f(x, y, w, h): return noise(HAIR, -5 * ((x * 3 + y) % 3))
        else:
            def f(x, y, w, h): return HAIR if y < 5 or x < 4 else SKIN
        paint(r, f)
    # Crown on the hat layer.
    for name, r in faces(32, 0, 8, 8, 8).items():
        if name in ("front", "back", "left", "right"):
            paint(r, lambda x, y, w, h: GOLD if y == 1 or (y == 0 and x % 2 == 0) else None)

    def robe(x, y, w, h):
        if x == 0 or x == w - 1: return TRIM
        return noise(ROBE, -8 * ((x + y) % 3 == 0))
    for r in faces(16, 16, 8, 12, 4).values():
        paint(r, lambda x, y, w, h: GOLD if y in (6, 7) else robe(x, y, w, h))
    paint(faces(16, 32, 8, 12, 4)["front"], lambda x, y, w, h: noise(HAIR, -6 * ((x + y) % 2)) if y < 5 and 2 <= x <= 5 + (y < 3) else None)
    for u, v in ((40, 16), (32, 48)):
        for r in faces(u, v, 4, 12, 4).values():
            paint(r, lambda x, y, w, h: SKIN if y >= h - 2 else (TRIM if y == h - 3 else ROBE))
    for u, v in ((0, 16), (16, 48)):
        for r in faces(u, v, 4, 12, 4).values():
            paint(r, lambda x, y, w, h: GOLD if y == h - 1 else (TRIM if y == h - 2 else robe(x, y, w, h)))
    return img


def pack_icon():
    img = Image.new("RGBA", (128, 128))
    for y in range(128):
        t = y / 127
        c = (int(150 + 90 * t), int(200 + 50 * t), 255, 255)
        ImageDraw.Draw(img).line((0, y, 127, y), fill=c)
    d = ImageDraw.Draw(img)
    d.polygon([(10, 86), (64, 22), (118, 86)], fill=(235, 242, 255, 255), outline=(150, 170, 200, 255))
    d.polygon([(24, 86), (104, 86), (64, 120)], fill=(130, 190, 235, 255))
    d.rectangle((44, 70, 84, 86), fill=(110, 80, 55, 255))
    d.polygon([(40, 70), (64, 54), (88, 70)], fill=(70, 50, 40, 255))
    for cx in (16, 50, 90, 116):
        d.ellipse((cx - 22, 100, cx + 22, 124), fill=(255, 255, 255, 235))
    return img


save(cloud(), RP / "textures/blocks/agartha_cloud.png")
save(portal_frames(), RP / "textures/blocks/agartha_portal.png")
save(gate_keystone(), RP / "textures/items/gate_keystone.png")
save(jarl_axe(), RP / "textures/items/jarl_axe.png")
save(mead_horn(), RP / "textures/items/mead_horn.png")
save(snowflake(), RP / "textures/particle/agartha_snowflake.png")
save(aurora(), RP / "textures/particle/agartha_aurora.png")
save(mist(), RP / "textures/particle/agartha_mist.png")
save(allfather_skin(), RP / "textures/entity/allfather.png")
icon = pack_icon()
save(icon, RP / "pack_icon.png")
save(icon, BP / "pack_icon.png")
print("textures written")
