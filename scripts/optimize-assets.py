from pathlib import Path
from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(r"C:\Users\THIS PC\.codex\generated_images\01a0a4dc-91b5-7381-b0ef-109742bac3ba")
OUT = Path(__file__).resolve().parents[1] / "public" / "images"
OUT.mkdir(parents=True, exist_ok=True)

ASSETS = {
    "showup-event-default.webp": ("exec-7dec6da4-ce04-45b6-b2ce-a6af0a4a43d3.png", (1280, 720), 76),
    "showup-host-default.webp": ("exec-35cb4f42-0e17-4529-af39-9c0c85eec1d1.png", (1280, 720), 76),
    "showup-checkin-success.webp": ("exec-72070d6d-5742-4e11-bdf2-91760b00333f.png", (640, 640), 76),
    "showup-empty-events.webp": ("exec-6cb12872-b6db-4d33-8abd-9104211b7591.png", (960, 640), 76),
    "showup-social-card.webp": ("exec-f0076352-a6d4-4220-afca-126917e7b10d.png", (1200, 630), 78),
}

for name, (source, size, quality) in ASSETS.items():
    image = Image.open(ROOT / source).convert("RGB")
    image = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    image.save(OUT / name, "WEBP", quality=quality, method=6)

# Mirrored quadrants guarantee matching opposite edges while retaining natural fibers.
paper = Image.open(ROOT / "exec-cc16f249-4550-4e96-b365-69d09b255040.png").convert("RGB")
paper = ImageEnhance.Contrast(paper).enhance(0.36)
paper = ImageOps.fit(paper, (128, 128), method=Image.Resampling.LANCZOS)
tile = Image.new("RGB", (256, 256))
tile.paste(paper, (0, 0))
tile.paste(ImageOps.mirror(paper), (128, 0))
tile.paste(ImageOps.flip(paper), (0, 128))
tile.paste(ImageOps.flip(ImageOps.mirror(paper)), (128, 128))
tile.save(OUT / "paper-grain.webp", "WEBP", quality=58, method=6)

for path in sorted(OUT.glob("*.webp")):
    with Image.open(path) as image:
        print(f"{path.name}\t{image.width}x{image.height}\t{path.stat().st_size}")
