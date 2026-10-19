#!/usr/bin/env python3
"""Gera o banner do README (docs/assets/banner.png) usando apenas PIL.

O banner é a faixa que abre o `README.md`. Ele **reproduz a capa do site**
(`Landing-page/src/components/HomeContent.tsx`): as mesmas formas geométricas
do hero, a mesma paleta e o mesmo ícone, que vem de `build/make-icon.py`. A
regra que vale aqui é a do `make-icon.py`: a marca da página do repositório é a
mesma que fica na janela, e nada aqui é um desenho que ninguém mais mantém.

Para regerar:

    python3 build/make-icon.py     # o ícone, se o desenho mudar
    python3 build/make-banner.py   # este banner

A paleta e as formas saem de `Landing-page/src/app/style/globals.css`
(`--color-*`) e do hero do site. Se o site mudar, mude aqui.
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1280, 400
# Supersampling: as formas são traçadas 4× maior e reduzidas, que é o que dá a
# borda limpa das curvas sem depender de antialiasing do PIL.
SS = 4

# Paleta do site (globals.css, bloco @theme).
BG_TOP = (0, 0, 0)
BG_BOTTOM = (8, 13, 24)
ACCENT = (59, 130, 246)
TEXT = (232, 237, 248)

ICON_BOX = 124
ICON_SIZE = 92
NAME = "Cronologia"


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def alpha(color, opacity):
    """Cor do hero com a opacidade do Tailwind (`opacity-*`, `fill-accent/N`)."""
    return (color[0], color[1], color[2], int(255 * opacity))


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(size[1]):
        draw.line([(0, y), (size[0], y)], fill=lerp(top, bottom, y / max(size[1] - 1, 1)))
    return img


def font(size, bold=False):
    """Primeira fonte sans do sistema; cai na padrão do PIL."""
    wanted = (
        ["DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf", "UbuntuSans-Bold.ttf"]
        if bold
        else ["DejaVuSans.ttf", "LiberationSans-Regular.ttf", "UbuntuSans-Regular.ttf"]
    )
    roots = ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts")]
    for name in wanted:
        for root in roots:
            for dirpath, _dirs, files in os.walk(root):
                if name in files:
                    return ImageFont.truetype(os.path.join(dirpath, name), size)
    return ImageFont.load_default()


def text_height(draw, text, font_):
    box = draw.textbbox((0, 0), text, font=font_)
    return box[3] - box[1]


def draw_centered(draw, text, font_, y, fill, width):
    box = draw.textbbox((0, 0), text, font=font_)
    draw.text(((width - (box[2] - box[0])) // 2, y), text, font=font_, fill=fill)


# --------------------------------------------------------------------------
# Formas do hero do site, em coordenadas locais (escala aplicada na chamada).
# Cada uma desenha numa caixa (x, y, w, h) da imagem supersamplada.
# --------------------------------------------------------------------------


def shape_book(draw, x, y, w, h, color):
    """`shape-1`: livro aberto do hero (páginas em contorno + duas linhas cada).

    A geometria é a do SVG do site, normalizada na caixa `(82,87)-(262,201)`: a
    página esquerda é um paralelogramo que desce para a lombada, e a direita é o
    espelho. Desenhar "no olho" dava um livro irreconhecível.
    """
    stroke = max(int(w * 0.028), 2)

    def px(nx, ny):
        return (x + w * nx, y + h * ny)

    esquerda = [px(0.0, 0.0), px(0.5, 0.202), px(0.5, 1.0), px(0.0, 0.798)]
    direita = [px(0.5, 0.202), px(0.661, 0.0), px(1.0, 0.0), px(1.0, 0.798), px(0.661, 0.798)]
    direita.append(px(0.5, 1.0))
    draw.line(esquerda + [esquerda[0]], fill=color, width=stroke, joint="curve")
    draw.line(direita + [direita[0]], fill=color, width=stroke, joint="curve")

    thin = max(int(stroke * 0.55), 1)
    for ny in (0.21, 0.377):
        draw.line([px(0.094, ny), px(0.367, ny)], fill=color, width=thin)
        draw.line([px(0.644, ny), px(0.906, ny)], fill=color, width=thin)


def shape_card(size, x, y, w, h, color, accent, angle=9):
    """`shape-2`: cartão com marcador, girado como no hero.

    Devolve uma layer própria **já girada**: girar a layer compartilhada
    arrastaria o livro e o triângulo junto, porque o `rotate` atua na imagem
    inteira e não só no desenho.
    """
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    stroke = max(int(w * 0.045), 2)
    radius = int(w * 0.13)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, outline=color, width=stroke)

    # Marcador: a fita com o entalhe em "V" (`M677 56h18v46l-9-7-9 7z` no site).
    def px(nx, ny):
        return (x + w * nx, y + h * ny)

    draw.polygon(
        [
            px(0.589, 0.078),
            px(0.789, 0.078),
            px(0.789, 0.474),
            px(0.689, 0.414),
            px(0.589, 0.474),
        ],
        fill=accent,
    )
    return layer.rotate(-angle, resample=Image.BICUBIC, center=(x + w / 2, y + h / 2))


def shape_triangle(draw, x, y, w, h, color):
    """`shape-3`: triângulo preenchido (`fill-accent/20`)."""
    draw.polygon(
        [(x + w / 2, y), (x + w, y + h), (x, y + h)],
        fill=color,
    )


def shape_check(draw, cx, cy, r, color):
    """`shape-4`: círculo com visto."""
    stroke = max(int(r * 0.07), 2)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=stroke)
    draw.line(
        [(cx - r * 0.55, cy), (cx - r * 0.2, cy + r * 0.28), (cx + r * 0.6, cy - r * 0.45)],
        fill=color,
        width=stroke,
        joint="curve",
    )


def shape_ticket(draw, x, y, w, h, color):
    """`shape-5`: bilhete com duas linhas."""
    stroke = max(int(h * 0.08), 2)
    skew = h * 0.3
    draw.polygon(
        [(x + skew, y), (x + w, y), (x + w - skew, y + h), (x, y + h)],
        outline=color,
        width=stroke,
    )
    thin = max(int(stroke * 0.8), 1)
    for i in range(2):
        ly = y + h * (0.35 + i * 0.32)
        draw.line(
            [(x + w * 0.24, ly + skew * 0.2), (x + w * 0.56, ly + skew * 0.2)],
            fill=color,
            width=thin,
        )


def shape_diamond(draw, cx, cy, r, color):
    """`shape-6`: losango preenchido (`fill-accent/25`)."""
    draw.polygon(
        [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)],
        fill=color,
    )


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    out_dir = os.path.join(root, "docs", "assets")
    os.makedirs(out_dir, exist_ok=True)

    icon_path = os.path.join(root, "build", "icon.png")
    if not os.path.exists(icon_path):
        raise SystemExit("build/icon.png não existe: rode `python3 build/make-icon.py` primeiro.")

    w, h = WIDTH * SS, HEIGHT * SS
    base = vertical_gradient((w, h), BG_TOP, BG_BOTTOM).convert("RGBA")

    # Formas espalhadas pelas bordas, como no banner do Guardinha: o miolo fica
    # livre para o ícone e o nome. A opacidade é baixa de propósito — são
    # textura de fundo, não conteúdo.
    shapes = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    s = ImageDraw.Draw(shapes)
    faint = alpha(ACCENT, 0.22)
    faint_soft = alpha(ACCENT, 0.16)

    shape_book(s, 52 * SS, 74 * SS, 200 * SS, 127 * SS, faint)
    shape_triangle(s, 272 * SS, 214 * SS, 96 * SS, 90 * SS, faint_soft)
    shape_ticket(s, 48 * SS, 268 * SS, 150 * SS, 52 * SS, faint)
    shape_diamond(s, 1000 * SS, 120 * SS, 54 * SS, faint_soft)
    shape_check(s, 1122 * SS, 286 * SS, 58 * SS, faint)
    shapes = Image.alpha_composite(
        shapes, shape_card((w, h), 1048 * SS, 56 * SS, 126 * SS, 162 * SS, faint, faint_soft)
    )
    base = Image.alpha_composite(base, shapes)

    draw = ImageDraw.Draw(base)
    f_name = font(int(66 * SS), bold=True)

    # O bloco do miolo é a caixa do ícone mais o nome. Centralizar o bloco inteiro
    # na altura (e não a caixa sozinha) é o que mantém os dois juntos no centro
    # visual, qualquer que seja a altura do nome.
    vao = int(30 * SS)
    box_w = ICON_BOX * SS
    top = (h - (box_w + vao + text_height(draw, NAME, f_name))) // 2
    by = top
    bx = (w - box_w) // 2

    # Ícone na caixa arredondada, como no hero (`rounded-3xl border
    # border-accent/20 bg-accent/10` com o ícone dentro).
    box = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(box)
    bd.rounded_rectangle(
        (bx, by, bx + box_w, by + box_w),
        radius=int(box_w * 0.22),
        fill=alpha(ACCENT, 0.10),
        outline=alpha(ACCENT, 0.45),
        width=max(int(2 * SS), 2),
    )

    icon = Image.open(icon_path).convert("RGBA").resize(
        (ICON_SIZE * SS, ICON_SIZE * SS), Image.LANCZOS
    )
    mask = Image.new("L", icon.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, icon.size[0] - 1, icon.size[1] - 1), radius=int(icon.size[0] * 0.18), fill=255
    )
    icon.putalpha(mask)
    box.alpha_composite(icon, ((w - icon.size[0]) // 2, by + (box_w - icon.size[0]) // 2))
    base = Image.alpha_composite(base, box)

    # O nome vai por último, e com um handle novo: `alpha_composite` devolve uma
    # imagem nova, e o `ImageDraw` antigo continua apontando para a anterior —
    # texto desenhado nele some junto com ela.
    draw_centered(ImageDraw.Draw(base), NAME, f_name, top + box_w + vao, TEXT, w)

    out = base.convert("RGB").resize((WIDTH, HEIGHT), Image.LANCZOS)
    out.save(os.path.join(out_dir, "banner.png"), optimize=True)
    print("banner gerado em docs/assets/banner.png")


if __name__ == "__main__":
    main()
