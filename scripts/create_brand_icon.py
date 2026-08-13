from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 1024
OUTPUT_DIR = Path('/home/ubuntu/nagoya-subway-offline/assets/images')
NAVY = '#153A5B'
TEAL = '#007C83'
AMBER = '#E6A23C'
OFF_WHITE = '#F5F7F8'


def main() -> None:
    canvas = Image.new('RGBA', (SIZE, SIZE), NAVY)
    draw = ImageDraw.Draw(canvas)

    # Two intersecting rail paths form a clear transfer symbol at launcher size.
    draw.rounded_rectangle((130, 420, 894, 604), radius=92, fill=TEAL)
    draw.rounded_rectangle((420, 130, 604, 894), radius=92, fill=TEAL)
    draw.rounded_rectangle((190, 468, 834, 556), radius=44, fill=OFF_WHITE)
    draw.rounded_rectangle((468, 190, 556, 834), radius=44, fill=OFF_WHITE)
    draw.ellipse((367, 367, 657, 657), fill=AMBER)
    draw.ellipse((441, 441, 583, 583), fill=NAVY)

    for x, y in ((168, 512), (856, 512), (512, 168), (512, 856)):
        draw.ellipse((x - 32, y - 32, x + 32, y + 32), fill=OFF_WHITE)

    for name in ('icon.png', 'splash-icon.png', 'favicon.png', 'android-icon-foreground.png'):
        canvas.save(OUTPUT_DIR / name, format='PNG', optimize=True)

    # Android adaptive icon background needs a fully opaque companion image.
    Image.new('RGBA', (SIZE, SIZE), NAVY).save(OUTPUT_DIR / 'android-icon-background.png', format='PNG', optimize=True)
    canvas.save(OUTPUT_DIR / 'android-icon-monochrome.png', format='PNG', optimize=True)


if __name__ == '__main__':
    main()
