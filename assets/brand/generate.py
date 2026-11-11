"""Render the checked-in SVG artwork into brand, web and desktop assets.

The PWA bundle lands in assets/brand/web, ready to copy into a web root.
Desktop icons and the connection page logo are written to src/desktop/assets.
"""
from io import BytesIO
import json
from pathlib import Path
import shutil

import cairosvg
from fontTools.ttLib import TTFont
from PIL import Image

BRAND = Path(__file__).resolve().parent
DESKTOP = BRAND.parents[1] / 'src/desktop/assets'
DESKTOP_FONTS = (
    ('Figtree-VariableFont_wght.ttf', 'Figtree-VariableFont_wght.woff2', 'Figtree-OFL.txt'),
    ('IBMPlexSerif-Regular.ttf', 'IBMPlexSerif-Regular.woff2', 'IBMPlexSerif-OFL.txt'),
)
RETIRED_DESKTOP_FONTS = ('Figtree-VariableFont_wght.ttf', 'Manrope-VariableFont_wght.ttf')
SIZES = (16, 24, 32, 48, 64, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512, 1024)
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def export_woff2(source, destination):
    """Convert one source font into a deterministic WOFF2 desktop asset.

    Args:
        source: TrueType source font to convert.
        destination: Target WOFF2 path to write.
    Returns:
        None; the converted font is written to destination.
    """
    font = TTFont(source)
    font.flavor = 'woff2'
    font.recalcTimestamp = False
    font.save(destination)


class AssetBuilder:
    """Render one SVG collection into the repository's installable icon formats.

    Args:
        source: Directory containing self-contained SVG sources.
        destination: Directory receiving generated PNG and icon files.
    """

    def __init__(self, source, destination):
        """Store input and output directories.

        Args:
            source: Directory containing the SVG artwork.
            destination: Directory receiving generated raster files.
        """
        self.source = source
        self.destination = destination
        self.destination.mkdir(parents=True, exist_ok=True)

    def render(self, name, width, height=None):
        """Rasterize one SVG, preserving aspect ratio unless height is supplied.

        Args:
            name: SVG basename without its extension.
            width: Output width in pixels.
            height: Explicit height; None preserves the source aspect ratio.
        Returns:
            An RGBA Pillow image, including transparent margins.
        """
        data = cairosvg.svg2png(url=str(self.source / f'{name}.svg'),
                               output_width=width, output_height=height)
        return Image.open(BytesIO(data)).convert('RGBA')

    def build(self):
        """Generate the full collection and deployment copies.

        Returns:
            None; files are written to raster/ and web/ and to src/desktop/assets.
        """
        for mode in ('light', 'dark'):
            for size in SIZES:
                for kind in ('app-icon', 'mark', 'maskable'):
                    name = f'{kind}-{mode}'
                    # Transparent marks are centered in a square without stretching.
                    if kind == 'mark':
                        image = self.render(name, size)
                        canvas = Image.new('RGBA', (size, size))
                        canvas.alpha_composite(image, (0, (size-image.height)//2))
                        image = canvas
                    else:
                        image = self.render(name, size, size)
                    image.save(self.destination / f'{name}-{size}.png')
            for name, widths in ((f'logo-{mode}', (585, 1170, 2340)),
                                 (f'logo-stacked-{mode}', (440, 880, 1760))):
                for width in widths:
                    self.render(name, width).save(self.destination / f'{name}-{width}.png')
            self.render(f'app-icon-{mode}', 256).save(
                self.destination / f'app-icon-{mode}.ico',
                sizes=[(n, n) for n in ICO_SIZES])
            self.render(f'app-icon-{mode}', 1024).save(
                self.destination / f'app-icon-{mode}.icns')

        public = BRAND / 'web'
        web = public / 'brand'
        desktop = DESKTOP
        desktop_fonts = desktop / 'fonts'
        web.mkdir(parents=True, exist_ok=True)
        desktop.mkdir(parents=True, exist_ok=True)
        desktop_fonts.mkdir(parents=True, exist_ok=True)
        for source, destination, license_name in DESKTOP_FONTS:
            export_woff2(BRAND / 'fonts' / source, desktop_fonts / destination)
            shutil.copyfile(BRAND / 'licenses' / license_name, desktop_fonts / license_name)
        for name in RETIRED_DESKTOP_FONTS:
            (desktop_fonts / name).unlink(missing_ok=True)
        for name in ('logo-light', 'logo-dark', 'logo-stacked-light',
                     'logo-stacked-dark', 'mark-light', 'mark-dark'):
            shutil.copyfile(self.source / f'{name}.svg', web / f'{name}.svg')
        shutil.copyfile(self.source / 'favicon.svg', public / 'favicon.svg')
        self.render('favicon', 256).save(public / 'favicon.ico',
                                       sizes=[(n, n) for n in ICO_SIZES])
        for size in (16, 32, 48):
            self.render('favicon', size).save(public / f'favicon-{size}.png')
        # Apple supplies its own rounded mask: use a full-bleed, opaque tile.
        self.render('maskable-light', 180).save(public / 'apple-touch-icon.png')
        icons = []
        for mode in ('light', 'dark'):
            for purpose, kind in (('any', 'app-icon'), ('maskable', 'maskable')):
                for size in (192, 512):
                    name = f'{kind}-{mode}-{size}.png'
                    shutil.copyfile(self.destination / name, web / name)
                    if mode == 'light':
                        icons.append({'src': f'brand/{name}', 'sizes': f'{size}x{size}',
                                      'type': 'image/png', 'purpose': purpose})
        manifest = {'name': 'Whisperer', 'short_name': 'Whisperer',
                    'description': 'Ideas sound better here.', 'id': './',
                    'start_url': './', 'scope': './', 'display': 'standalone',
                    'background_color': '#faf8ee', 'theme_color': '#faf8ee',
                    'icons': icons}
        (public / 'manifest.webmanifest').write_text(json.dumps(manifest, indent=2) + '\n')
        for suffix, size in (('png', 512), ('ico', None), ('icns', None)):
            if size:
                self.render('app-icon-light', size).save(desktop / f'icon.{suffix}')
            else:
                shutil.copyfile(self.destination / f'app-icon-light.{suffix}',
                                desktop / f'icon.{suffix}')
        # macOS menu bar icons are black template images that the system tints for light and dark bars.
        for suffix, height in (('', 16), ('@2x', 32)):
            mark = self.render('mark-light', height * 3 // 2, height)
            template = Image.new('RGBA', mark.size)
            template.putalpha(mark.getchannel('A'))
            template.save(desktop / f'trayTemplate{suffix}.png')
        for name in ('logo-light', 'sidebar-logo-light', 'sidebar-logo-dark',
                     'app-icon-light', 'app-icon-dark'):
            shutil.copyfile(self.source / f'{name}.svg', desktop / f'{name}.svg')


if __name__ == '__main__':
    AssetBuilder(BRAND / 'svg', BRAND / 'raster').build()
