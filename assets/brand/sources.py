"""Write the editable SVG artwork with text converted to font-free outlines.

The wordmark uses IBM Plex Serif Regular and the tagline uses Figtree Regular.
Both are read from fonts/ only while building and are never referenced by the SVGs.
"""
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

BRAND = Path(__file__).resolve().parent
LIGHT_INK = '#252524'
DARK_INK = '#f7f5ec'
LIGHT_TILE = '#faf8ee'
WORDMARK = 'Whisperer'
TAGLINE = 'IDEAS SOUND BETTER HERE'

# The ribbon is redrawn by hand from the supplied design. The rear fold sits
# between the two front surfaces and fades out to suggest the twist.
LEFT = 'M 36 19 C 9 14 -7 38 3 67 C 23 122 81 186 155 190 C 117 174 109 117 98 82 C 88 47 67 22 36 19 Z'
RIGHT = 'M 279 0 C 309 -3 326 18 327 47 C 329 86 302 140 276 169 C 274 139 255 105 246 72 C 235 38 242 4 279 0 Z'
BACK = 'M 120 87 C 113 114 124 148 145 167 C 135 147 128 109 134 94 C 136 87 140 85 145 86 C 137 77 126 78 120 87 Z'
CENTER = ('M 120 87 C 127 62 146 49 165 57 C 193 66 207 92 222 122 C 235 148 251 175 276 167 '
          'C 256 195 233 212 211 205 C 190 200 183 175 175 150 C 166 122 156 89 142 82 C 133 76 125 79 120 87 Z')


class Typeface:
    """Convert strings into SVG path outlines from one font.

    Args:
        font: Loaded static TrueType font.
    """

    def __init__(self, font):
        """Cache the glyph lookup tables.

        Args:
            font: Loaded static TrueType font.
        """
        self.glyphs = font.getGlyphSet()
        self.cmap = font.getBestCmap()
        self.units = font['head'].unitsPerEm

    def advance(self, text, size, tracking=0):
        """Measure the set width of a line.

        Args:
            text: Characters to measure.
            size: Font size in SVG units.
            tracking: Extra space added between characters.
        Returns:
            The line width in SVG units, without trailing tracking.
        """
        widths = [self.glyphs[self.cmap[ord(c)]].width * size / self.units for c in text]
        return sum(widths) + tracking * (len(text) - 1)

    def outline(self, text, size, x, baseline, tracking=0):
        """Draw a line of text as SVG paths.

        Args:
            text: Characters to draw.
            size: Font size in SVG units.
            x: Left edge of the first glyph.
            baseline: Vertical baseline position.
            tracking: Extra space added between characters.
        Returns:
            Concatenated path elements. Spaces produce no path.
        """
        paths = []
        cursor = x
        scale = size / self.units
        for character in text:
            glyph = self.glyphs[self.cmap[ord(character)]]
            pen = SVGPathPen(self.glyphs)
            glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
            if pen.getCommands():
                paths.append(f'<path d="{pen.getCommands()}"/>')
            cursor += glyph.width * scale + tracking
        return ''.join(paths)


class ArtworkWriter:
    """Write every light and dark SVG variant into one directory.

    Args:
        destination: Directory receiving SVG files.
        wordmark: Typeface for the product name.
        tagline: Typeface for the tagline.
    """

    def __init__(self, destination, wordmark, tagline):
        """Store the output directory and typefaces.

        Args:
            destination: Directory receiving SVG files.
            wordmark: Typeface for the product name.
            tagline: Typeface for the tagline.
        """
        self.destination = destination
        self.wordmark = wordmark
        self.tagline = tagline

    @staticmethod
    def mark(dark, transform):
        """Return the ribbon group with gradients scoped to its theme.

        Args:
            dark: True draws a light ribbon for dark backgrounds.
            transform: SVG transform placing the 327 by 212 ribbon.
        Returns:
            SVG defs and the ribbon group.
        """
        key = 'dark' if dark else 'light'
        base = DARK_INK if dark else LIGHT_INK
        high = '#fffff7' if dark else '#302f2e'
        fold = '#8b8b83' if dark else '#77756f'
        material = f'url(#material-{key})'
        return (f'<defs><linearGradient id="material-{key}" x1="0" y1="0" x2="1" y2="1">'
                f'<stop stop-color="{high}"/><stop offset="1" stop-color="{base}"/></linearGradient>'
                f'<linearGradient id="fold-{key}" x1="0" y1="0" x2="0.35" y2="1">'
                f'<stop stop-color="{fold}"/><stop offset="0.83" stop-color="{base}" stop-opacity="0"/>'
                f'</linearGradient></defs><g transform="{transform}">'
                f'<path fill="{material}" d="{LEFT}"/><path fill="{material}" d="{RIGHT}"/>'
                f'<path fill="url(#fold-{key})" d="{BACK}"/><path fill="{material}" d="{CENTER}"/></g>')

    def write(self, name, width, height, content, title):
        """Write one standalone SVG with an accessible title.

        Args:
            name: File basename without extension.
            width: Canvas width in SVG units.
            height: Canvas height in SVG units.
            content: SVG markup inside the root element.
            title: Accessible name for the image.
        """
        width = round(width)
        (self.destination / f'{name}.svg').write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" role="img" aria-labelledby="title">'
            f'<title id="title">{title}</title>{content}</svg>\n')

    def build(self):
        """Write marks, logos, app icons, maskable tiles and the favicon."""
        self.destination.mkdir(parents=True, exist_ok=True)
        for mode in ('light', 'dark'):
            dark = mode == 'dark'
            ink = DARK_INK if dark else LIGHT_INK
            muted = '#b8b5ac' if dark else '#8d8983'
            tile = LIGHT_INK if dark else LIGHT_TILE
            self.write(f'mark-{mode}', 360, 240, self.mark(dark, 'translate(16 16)'),
                       f'Whisperer ribbon mark, {mode}')
            # Horizontal lockup. The tagline is centred under the wordmark.
            size, x = 150, 380
            word_width = self.wordmark.advance(WORDMARK, size)
            tag_width = self.tagline.advance(TAGLINE, 19, 9)
            word = self.wordmark.outline(WORDMARK, size, x, 168)
            tag = self.tagline.outline(TAGLINE, 19, x + (word_width - tag_width) / 2, 244, 9)
            self.write(f'logo-{mode}', x + word_width + 24, 270,
                       self.mark(dark, 'translate(16 20)') +
                       f'<g fill="{ink}">{word}</g><g fill="{muted}">{tag}</g>',
                       f'Whisperer, ideas sound better here, {mode}')
            # Sidebar lockup: its edge-tight viewbox prevents a small side-rail
            # placement from shrinking the visible mark and wordmark.
            sidebar_mark_scale = .165
            sidebar_mark_width = (329 - (-7)) * sidebar_mark_scale
            sidebar_word_size = 43
            sidebar_word_x = sidebar_mark_width + 9
            sidebar_word = self.wordmark.outline(WORDMARK, sidebar_word_size, sidebar_word_x, 32.68)
            sidebar_word_width = self.wordmark.advance(WORDMARK, sidebar_word_size)
            self.write(f'sidebar-logo-{mode}', sidebar_word_x + sidebar_word_width, 42,
                       self.mark(dark, f'translate({-(-7) * sidebar_mark_scale - 1} 0) scale({sidebar_mark_scale})') +
                       f'<g fill="{ink}">{sidebar_word}</g>', f'Whisperer sidebar logo, {mode}')
            # Stacked lockup. The canvas fits whichever is wider, mark or name.
            size = 64
            word_width = self.wordmark.advance(WORDMARK, size)
            width = max(440, word_width + 48)
            word = self.wordmark.outline(WORDMARK, size, (width - word_width) / 2, 310)
            self.write(f'logo-stacked-{mode}', width, 340,
                       self.mark(dark, f'translate({(width - 311) / 2} 20) scale(0.95)') +
                       f'<g fill="{ink}">{word}</g>', f'Whisperer primary logo, {mode}')
            self.write(f'app-icon-{mode}', 512, 512,
                       f'<rect width="512" height="512" rx="112" fill="{tile}"/>' +
                       self.mark(dark, 'translate(76 143) scale(1.10)'), f'Whisperer app icon, {mode}')
            # Full bleed tile. The ribbon stays inside the central 40 percent circle.
            self.write(f'maskable-{mode}', 512, 512, f'<rect width="512" height="512" fill="{tile}"/>' +
                       self.mark(dark, 'translate(100.675 157.675) scale(0.95)'),
                       f'Whisperer maskable icon, {mode}')
        self.write('favicon', 64, 64, f'<rect width="64" height="64" rx="14" fill="{LIGHT_INK}"/>' +
                   self.mark(True, 'translate(8 16.7) scale(0.147)'), 'Whisperer')


def typefaces():
    """Load the build fonts.

    Returns:
        The wordmark typeface and the tagline typeface.
    """
    plex = TTFont(BRAND / 'fonts/IBMPlexSerif-Regular.ttf')
    figtree = instantiateVariableFont(TTFont(BRAND / 'fonts/Figtree-VariableFont_wght.ttf'), {'wght': 400})
    return Typeface(plex), Typeface(figtree)


if __name__ == '__main__':
    ArtworkWriter(BRAND / 'svg', *typefaces()).build()
