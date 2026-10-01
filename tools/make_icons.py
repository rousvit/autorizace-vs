"""Vygeneruje ikony aplikace (kapka vody s paragrafem) do docs/icons/."""
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "icons"
BLUE_TOP = (18, 120, 214)
BLUE_BOTTOM = (8, 76, 150)
FONT = "C:/Windows/Fonts/georgiab.ttf"


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(BLUE_TOP, BLUE_BOTTOM))
        for x in range(size):
            px[x, y] = c
    return img


def drop_polygon(cx, cy, r, k=1.95, steps=120):
    """Kapka: kruh dole, špička nahoře ve vzdálenosti k·r od středu, napojená tečnami."""
    import math
    phi = math.asin(1 / k)          # úhel bodu dotyku tečny nad vodorovnou osou
    pts = [(cx, cy - k * r)]
    sweep = math.pi + 2 * phi
    for i in range(steps + 1):
        a = phi - sweep * i / steps  # od pravého bodu dotyku dolů kolem až k levému
        pts.append((cx + r * math.cos(a), cy - r * math.sin(a)))
    return pts


def render(size, safe=1.0, rounded=True):
    s = 4 * size  # převzorkování kvůli hladkým hranám
    bg = gradient(s)
    mask = Image.new("L", (s, s), 0)
    md = ImageDraw.Draw(mask)
    if rounded:
        md.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=255)
    else:
        md.rectangle([0, 0, s - 1, s - 1], fill=255)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)
    r = s * 0.235 * safe
    cx, cy = s / 2, s * 0.5 + r * 0.48
    d.polygon(drop_polygon(cx, cy, r), fill=(255, 255, 255, 255))
    font = ImageFont.truetype(FONT, int(r * 1.3))
    d.text((cx, cy + r * 0.04), "§", font=font, fill=BLUE_BOTTOM + (255,), anchor="mm")
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    render(192).save(OUT / "icon-192.png")
    render(512).save(OUT / "icon-512.png")
    render(512, safe=0.78, rounded=False).save(OUT / "icon-maskable-512.png")
    render(180, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")
    render(32).save(OUT / "favicon-32.png")
    print("ikony →", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
