from __future__ import annotations


def channel(value: int) -> float:
    normalized = value / 255
    return normalized / 12.92 if normalized <= 0.04045 else ((normalized + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    value = hex_color.lstrip('#')
    red, green, blue = (int(value[index:index + 2], 16) for index in (0, 2, 4))
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)


def contrast(first: str, second: str) -> float:
    high, low = sorted((luminance(first), luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)


PAIRS = {
    '本文（墨色 / 温白）': ('#37312B', '#FFFEFC'),
    '主要操作（白 / 墨色）': ('#FFFFFF', '#302D29'),
    '路線ワンポイント（墨色 / 東山線イエロー）': ('#37312B', '#F5C400'),
    '補助文（ブラウン / 温白）': ('#6D625A', '#FFFEFC'),
    '乗換案内（ブラウン / 淡黄）': ('#695C4D', '#FFF9EC'),
    'エラー（赤 / 温白）': ('#B33A2B', '#FFFEFC'),
}


def main() -> None:
    failures: list[str] = []
    for label, (foreground, background) in PAIRS.items():
        ratio = contrast(foreground, background)
        print(f'{label}: {ratio:.2f}:1')
        if ratio < 4.5:
            failures.append(label)
    if failures:
        raise SystemExit(f'通常テキスト基準を満たさない組合せ: {", ".join(failures)}')


if __name__ == '__main__':
    main()
