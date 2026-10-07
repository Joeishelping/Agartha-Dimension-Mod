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


def runestone(top=False):
    img = Image.new("RGBA", (16, 16))
    for x in range(16):
        for y in range(16):
            v = 70 + rnd.randint(0, 25)
            img.putpixel((x, y), (v, v + 4, v + 12, 255))
    d = ImageDraw.Draw(img)
    glow = (110, 220, 255, 255)
    if top:
        d.ellipse((3, 3, 12, 12), outline=glow)
        d.point([(7, 7), (8, 8), (7, 8), (8, 7)], fill=glow)
    else:
        # Algiz-like rune.
        d.line((8, 2, 8, 13), fill=glow)
        d.line((8, 7, 4, 3), fill=glow)
        d.line((8, 7, 12, 3), fill=glow)
    d.rectangle((0, 0, 15, 15), outline=(50, 54, 64, 255))
    return img


def frost_rune():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(8, 1), (14, 8), (8, 15), (2, 8)], fill=(120, 200, 255, 255), outline=(40, 90, 170, 255))
    d.polygon([(8, 3), (11, 8), (8, 6)], fill=(220, 245, 255, 255))
    d.line((8, 5, 8, 12), fill=(255, 255, 255, 255))
    d.line((8, 8, 6, 6), fill=(255, 255, 255, 255))
    d.line((8, 8, 10, 6), fill=(255, 255, 255, 255))
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
save(runestone(), RP / "textures/blocks/agartha_runestone.png")
save(runestone(True), RP / "textures/blocks/agartha_runestone_top.png")
save(frost_rune(), RP / "textures/items/frost_rune.png")
save(jarl_axe(), RP / "textures/items/jarl_axe.png")
save(mead_horn(), RP / "textures/items/mead_horn.png")
save(snowflake(), RP / "textures/particle/agartha_snowflake.png")
icon = pack_icon()
save(icon, RP / "pack_icon.png")
save(icon, BP / "pack_icon.png")
print("textures written")
