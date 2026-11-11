"""Check the generated brand assets without starting the application."""
from io import BytesIO
from pathlib import Path
import json
import tempfile
import unittest
import xml.etree.ElementTree as ET

import cairosvg
from PIL import Image

BRAND = Path(__file__).resolve().parent
DESKTOP = BRAND.parents[1] / 'src/desktop/assets'
SIZES = (16, 24, 32, 48, 64, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512, 1024)
ICO_SIZES = {(n, n) for n in (16, 24, 32, 48, 64, 128, 256)}


class BrandTests(unittest.TestCase):
    """Verify vector portability, generated dimensions and installable formats."""

    def test_vectors_are_standalone(self):
        """Reject fonts, scripts, linked images and external resource references."""
        sources = list((BRAND / 'svg').glob('*.svg'))
        self.assertEqual(len(sources), 13)
        for source in sources:
            root = ET.parse(source).getroot()
            self.assertIn('viewBox', root.attrib)
            self.assertTrue(root.find('{http://www.w3.org/2000/svg}title').text)
            for element in root.iter():
                self.assertNotIn(element.tag.rsplit('}', 1)[-1],
                                 ('text', 'script', 'image', 'foreignObject'))
                for attribute, value in element.attrib.items():
                    if attribute.endswith('href'):
                        self.assertTrue(value.startswith('#'))

    def test_sidebar_logo_is_tightly_cropped_and_theme_contrasted(self):
        """Keep sidebar wordmarks edge-tight and legible against shell canvases."""
        namespace = '{http://www.w3.org/2000/svg}'
        themes = {
            'light': ('#252524', '#f4f4ef', '#faf8ee'),
            'dark': ('#f7f5ec', '#1c1b19', '#252524'),
        }
        for mode, (foreground, shell_background, icon_background) in themes.items():
            source = BRAND / 'svg' / f'sidebar-logo-{mode}.svg'
            root = ET.parse(source).getroot()
            fills = {element.attrib.get('fill') for element in root.findall(f'{namespace}g')}
            self.assertIn(foreground, fills)
            image = Image.open(BytesIO(cairosvg.svg2png(url=str(source), output_width=1200))).convert('RGBA')
            left, top, right, bottom = image.getchannel('A').getbbox()
            self.assertLessEqual(left, 2, mode)
            self.assertLessEqual(top, 2, mode)
            self.assertGreaterEqual(right, image.width - 2, mode)
            self.assertGreaterEqual(bottom, image.height - 2, mode)
            icon = BRAND / 'svg' / f'app-icon-{mode}.svg'
            self.assertEqual((DESKTOP / source.name).read_bytes(), source.read_bytes())
            self.assertEqual((DESKTOP / icon.name).read_bytes(), icon.read_bytes())
            self.assertIn(f'fill="{icon_background}"', icon.read_text())
            self.assertIn(f'stop-color="{foreground}"', icon.read_text())
            luminance = lambda color: sum(
                coefficient * (channel / 255 if channel <= 10 else ((channel / 255 + .055) / 1.055) ** 2.4)
                for coefficient, channel in zip((.2126, .7152, .0722), bytes.fromhex(color[1:]))
            )
            for background in (shell_background, icon_background):
                ratio = (max(luminance(foreground), luminance(background)) + .05) / (min(luminance(foreground), luminance(background)) + .05)
                self.assertGreaterEqual(ratio, 4.5, (mode, background))

    def test_retired_renderer_icon_slots_are_absent(self):
        """Ensure generation cannot leave unconsumed legacy renderer app icons."""
        renderer = BRAND.parents[1] / 'src/desktop/renderer'
        for name in ('39d2a95259cf5b4e63a9.png', '516936c3bbe4adb7f85d.png'):
            self.assertFalse((renderer / name).exists(), name)

    def test_desktop_font_exports_are_reproducible(self):
        """Produce byte-identical WOFF2 exports from the same source font."""
        from generate import DESKTOP_FONTS, export_woff2

        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory)
            for source, output, _ in DESKTOP_FONTS:
                first = destination / f'first-{output}'
                second = destination / f'second-{output}'
                export_woff2(BRAND / 'fonts' / source, first)
                export_woff2(BRAND / 'fonts' / source, second)
                self.assertEqual(first.read_bytes(), second.read_bytes(), source)

    def test_wordmark_uses_plex_outlines(self):
        """Match the first wordmark glyph against the bundled IBM Plex Serif font."""
        from fontTools.pens.svgPathPen import SVGPathPen
        from fontTools.pens.transformPen import TransformPen
        from fontTools.ttLib import TTFont

        font = TTFont(BRAND / 'fonts/IBMPlexSerif-Regular.ttf')
        glyphs = font.getGlyphSet()
        glyph = glyphs[font.getBestCmap()[ord('W')]]
        namespace = '{http://www.w3.org/2000/svg}'
        for mode in ('light', 'dark'):
            pen = SVGPathPen(glyphs)
            scale = 150 / font['head'].unitsPerEm
            glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, 380, 168)))
            root = ET.parse(BRAND / 'svg' / f'logo-{mode}.svg').getroot()
            wordmark = root.findall(f'{namespace}g')[1]
            self.assertEqual(wordmark.find(f'{namespace}path').attrib['d'], pen.getCommands())

    def test_png_dimensions(self):
        """Verify every square variant has the promised dimensions and alpha."""
        for mode in ('light', 'dark'):
            for kind in ('mark', 'app-icon', 'maskable'):
                for size in SIZES:
                    with Image.open(BRAND / 'raster' / f'{kind}-{mode}-{size}.png') as image:
                        self.assertEqual(image.size, (size, size))
                        self.assertEqual(image.mode, 'RGBA')
                        if kind == 'maskable':
                            self.assertEqual(image.getchannel('A').getextrema(), (255, 255))
                        else:
                            self.assertEqual(image.getpixel((0, 0))[3], 0)

    def test_maskable_safe_zone(self):
        """Require visible ribbon pixels to stay inside the central 40% circle."""
        for mode in ('light', 'dark'):
            with Image.open(BRAND / 'raster' / f'maskable-{mode}-512.png') as image:
                background = image.getpixel((0, 0))[:3]
                for y in range(512):
                    for x in range(512):
                        if (x-256)**2 + (y-256)**2 > 204.8**2:
                            delta = sum(abs(a-b) for a, b in zip(image.getpixel((x, y))[:3], background))
                            self.assertLessEqual(delta, 6, (mode, x, y))

    def test_manifest_icons_exist(self):
        """Resolve each manifest icon relative to the deployable web directory."""
        manifest = json.loads((BRAND / 'web/manifest.webmanifest').read_text())
        self.assertEqual(manifest['display'], 'standalone')
        self.assertEqual(len(manifest['icons']), 4)
        for icon in manifest['icons']:
            with Image.open(BRAND / 'web' / icon['src']) as image:
                self.assertEqual(icon['sizes'], f'{image.width}x{image.height}')
                self.assertEqual(icon['type'], 'image/png')
                self.assertIn(icon['purpose'], ('any', 'maskable'))
        with Image.open(BRAND / 'web/apple-touch-icon.png') as image:
            self.assertEqual(image.size, (180, 180))
            self.assertEqual(image.getchannel('A').getextrema(), (255, 255))

    def test_icon_containers_and_desktop_copies(self):
        """Decode ICO frames and ICNS and compare deployed icons with their source."""
        for mode in ('light', 'dark'):
            ico = BRAND / 'raster' / f'app-icon-{mode}.ico'
            with Image.open(ico) as image:
                self.assertEqual(image.info['sizes'], ICO_SIZES)
                for size in ICO_SIZES:
                    self.assertEqual(image.ico.getimage(size).size, size)
            with Image.open(BRAND / 'raster' / f'app-icon-{mode}.icns') as image:
                self.assertEqual(image.size, (1024, 1024))
                image.load()
        with Image.open(BRAND / 'web/favicon.ico') as image:
            self.assertEqual(image.info['sizes'], ICO_SIZES)
        for extension in ('ico', 'icns'):
            self.assertEqual((DESKTOP / f'icon.{extension}').read_bytes(),
                             (BRAND / 'raster' / f'app-icon-light.{extension}').read_bytes())
        self.assertEqual((DESKTOP / 'icon.png').read_bytes(),
                         (BRAND / 'raster/app-icon-light-512.png').read_bytes())
        self.assertEqual((DESKTOP / 'logo-light.svg').read_bytes(),
                         (BRAND / 'svg/logo-light.svg').read_bytes())


if __name__ == '__main__':
    unittest.main(verbosity=2)
