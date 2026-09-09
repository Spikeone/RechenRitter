"""Build web assets from the raw itch.io packs in DownloadedRaw/.

  python tools/build-assets.py

- 32rogues: copies the three 32x32 tile sheets into assets/sprites/ unchanged.
- Rifts of the Nine Realms Biomes: 1344x768 PNGs (~1.2 MB each) are downscaled
  to 672x384 and saved as WebP (~40-80 KB each) into assets/bg/.
- Renders the PWA icons from the knight tile of rogues.png.

Idempotent: re-running overwrites the outputs. The raw zips stay git-ignored;
the built files under assets/ and icons/ are committed so GitHub Pages serves them.
"""
import io
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'DownloadedRaw'
SPRITES_OUT = ROOT / 'assets' / 'sprites'
BG_OUT = ROOT / 'assets' / 'bg'
ICONS_OUT = ROOT / 'icons'

ROGUES_ZIP = RAW / '32rogues-0.5.0.zip'
BIOMES_ZIP = RAW / 'Rifts of the Nine Realms Biomes.zip'

SHEETS = ['rogues.png', 'monsters.png', 'animals.png']

# output slug -> source name inside the biomes zip (without .png).
# Slugs are the contract with js/biomes.js — keep both in sync.
BACKGROUNDS = {
    'forest-1': 'forest_biome',
    'forest-2': 'forest_biome_1',
    'snow-1': 'snowy_winter_biome',
    'snow-2': 'snowy_winter_biome_1',
    'snow-boss': 'frozen_tundra_biome',
    'desert-1': 'desert_biome',
    'desert-2': 'desert_biome_1',
    'desert-boss': 'desert_boss_arena',
    'swamp-1': 'cursed_swamp',
    'swamp-2': 'cursed_swamp_1',
    'darkforest-1': 'dark_enchanted_forest',
    'darkforest-2': 'dark_enchanted_forest_1',
    'mountain-1': 'towering_mountain_biome',
    'mountain-2': 'towering_mountain_biome_1',
    'ocean-1': 'calm_ocean_biome',
    'ocean-2': 'stormy_ocean',
    'ocean-boss': 'stormy_ocean_1',
    'volcano-1': 'volcanic_biome',
    'volcano-2': 'volcanic_biome_1',
    'volcano-boss': 'volcanic_boss_arena',
    'arcane-1': 'mystical_magical_arena_background',
    'arcane-2': 'mystical_magical_arena_background_1',
    'ruins-1': 'post-apocalyptic_background',
    'ruins-2': 'post-apocalyptic_background_1',
    'void-1': 'Giant_circular_platform_floating_in_void',
    'void-2': 'neon_cyberpunk_background_1',
}

BG_WIDTH, BG_HEIGHT = 672, 384
BG_QUALITY = 80

# Knight tile in rogues.png (7 cols x 7 rows of 32x32), row 2 col a => (0, 1).
ICON_TILE = (0, 1)
ICON_BG = (26, 22, 37)
ICON_ACCENT = (120, 90, 200)


def die(msg):
    print('ERROR: ' + msg, file=sys.stderr)
    sys.exit(1)


def zip_entry(zf, wanted):
    """Zip entries carry folder prefixes and one file has a stray space."""
    for info in zf.infolist():
        name = Path(info.filename).name.strip()
        if name.lower() == wanted.lower():
            return info
    return None


def build_sheets():
    if not ROGUES_ZIP.exists():
        die('missing %s' % ROGUES_ZIP)
    SPRITES_OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ROGUES_ZIP) as zf:
        for sheet in SHEETS:
            info = zip_entry(zf, sheet)
            if info is None:
                die('%s not found in %s' % (sheet, ROGUES_ZIP.name))
            data = zf.read(info)
            (SPRITES_OUT / sheet).write_bytes(data)
            img = Image.open(io.BytesIO(data))
            print('  sprites/%-14s %4dx%-4d %6.1f KB (%d x %d tiles)'
                  % (sheet, img.width, img.height, len(data) / 1024,
                     img.width // 32, img.height // 32))
        lic = zip_entry(zf, 'LICENSE.txt')
        if lic:
            (SPRITES_OUT / '32rogues-LICENSE.txt').write_bytes(zf.read(lic))


def build_backgrounds():
    if not BIOMES_ZIP.exists():
        die('missing %s' % BIOMES_ZIP)
    BG_OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    with zipfile.ZipFile(BIOMES_ZIP) as zf:
        for slug, source in sorted(BACKGROUNDS.items()):
            info = zip_entry(zf, source + '.png')
            if info is None:
                die('background "%s" not found in %s' % (source, BIOMES_ZIP.name))
            img = Image.open(io.BytesIO(zf.read(info))).convert('RGB')
            img = img.resize((BG_WIDTH, BG_HEIGHT), Image.LANCZOS)
            out = BG_OUT / (slug + '.webp')
            img.save(out, 'WEBP', quality=BG_QUALITY, method=6)
            size = out.stat().st_size
            total += size
            print('  bg/%-16s %6.1f KB  <- %s' % (slug + '.webp', size / 1024, source))
    print('  backgrounds total: %.1f KB' % (total / 1024))


def build_icons():
    ICONS_OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SPRITES_OUT / 'rogues.png').convert('RGBA')
    col, row = ICON_TILE
    tile = sheet.crop((col * 32, row * 32, col * 32 + 32, row * 32 + 32))
    for name, size in (('icon-192.png', 192), ('icon-512.png', 512),
                       ('apple-touch-icon.png', 180)):
        canvas = Image.new('RGBA', (size, size), ICON_BG + (255,))
        draw = ImageDraw.Draw(canvas)
        pad = size // 12
        draw.rounded_rectangle([pad, pad, size - pad, size - pad],
                               radius=size // 8, outline=ICON_ACCENT + (255,),
                               width=max(2, size // 48))
        scaled = tile.resize((int(size * 0.62), int(size * 0.62)), Image.NEAREST)
        canvas.alpha_composite(scaled, ((size - scaled.width) // 2,
                                        (size - scaled.height) // 2))
        canvas.convert('RGB').save(ICONS_OUT / name, 'PNG', optimize=True)
        print('  icons/%-22s %dx%d' % (name, size, size))
    # favicon: same artwork, small
    fav = Image.open(ICONS_OUT / 'icon-192.png')
    fav.resize((32, 32), Image.LANCZOS).save(ROOT / 'favicon.png', 'PNG', optimize=True)
    print('  favicon.png              32x32')


if __name__ == '__main__':
    print('32rogues sheets ->')
    build_sheets()
    print('biome backgrounds ->')
    build_backgrounds()
    print('icons ->')
    build_icons()
    print('done.')
