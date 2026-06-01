"""
generate_langs.py
Fetches all public repos for a GitHub user via the GitHub API,
counts bytes per language, and writes a Dracula-themed SVG
donut chart to assets/language-stats.svg.

Usage: Called automatically by .github/workflows/update-lang-stats.yml
Requires: GITHUB_TOKEN env variable (set as repo secret)
"""

import os
import json
import math
import urllib.request
import urllib.error

# ── Config ────────────────────────────────────────────────────────────────────
USERNAME = "victoralecrim11"
OUTPUT   = "assets/language-stats.svg"
TOKEN    = os.environ.get("GITHUB_TOKEN", "")

# Dracula colour palette
COLORS = [
    "#ff79c6",  # pink   – slot 0
    "#bd93f9",  # purple – slot 1
    "#f1fa8c",  # yellow – slot 2
    "#8be9fd",  # cyan   – slot 3
    "#ffb86c",  # orange – slot 4
    "#50fa7b",  # green  – slot 5
    "#ff5555",  # red    – slot 6
    "#6272a4",  # comment grey – slot 7 (Others)
]

BG         = "#282a36"
TEXT_COLOR = "#f8f8f2"

# ── GitHub API helpers ────────────────────────────────────────────────────────
def gh_get(url: str):
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "lang-stats-action/1.0")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def all_repos(username: str) -> list:
    repos, page = [], 1
    while True:
        url   = f"https://api.github.com/users/{username}/repos?per_page=100&page={page}"
        chunk = gh_get(url)
        if not chunk:
            break
        repos.extend(chunk)
        page += 1
    return repos


def lang_bytes(repos: list) -> dict:
    totals: dict = {}
    for repo in repos:
        if repo.get("fork"):
            continue          # skip forks — count only original work
        try:
            langs = gh_get(repo["languages_url"])
        except urllib.error.HTTPError:
            continue
        for lang, b in langs.items():
            totals[lang] = totals.get(lang, 0) + b
    return totals


# ── SVG donut chart ────────────────────────────────────────────────────────────
def donut_arc(cx, cy, r_out, r_in, start_deg, sweep_deg) -> str:
    """SVG path for one donut slice."""
    def point(r, deg):
        rad = math.radians(deg)
        return cx + r * math.cos(rad), cy + r * math.sin(rad)

    end_deg     = start_deg + sweep_deg
    large_arc   = 1 if sweep_deg > 180 else 0
    ox1, oy1    = point(r_out, start_deg)
    ox2, oy2    = point(r_out, end_deg)
    ix1, iy1    = point(r_in,  end_deg)
    ix2, iy2    = point(r_in,  start_deg)

    return (
        f"M {ox1:.2f} {oy1:.2f} "
        f"A {r_out} {r_out} 0 {large_arc} 1 {ox2:.2f} {oy2:.2f} "
        f"L {ix1:.2f} {iy1:.2f} "
        f"A {r_in} {r_in} 0 {large_arc} 0 {ix2:.2f} {iy2:.2f} Z"
    )


def build_svg(langs: dict) -> str:
    total  = sum(langs.values())
    top_n  = sorted(langs.items(), key=lambda x: x[1], reverse=True)[:7]
    others = total - sum(v for _, v in top_n)
    if others > 0:
        top_n.append(("Others", others))

    # Canvas
    W, H          = 340, 240  # Largura reduzida para caber melhor ao lado do contrib-stats
    CX, CY        = 100, 135  # Gráfico movido mais para a esquerda e centralizado na altura
    R_OUT, R_IN   = 80, 50    # Tamanho do donut mantido grande para ser chamativo

    el = []
    el.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'viewBox="0 0 {W} {H}">'
    )
    el.append(f'  <rect width="{W}" height="{H}" rx="14" fill="{BG}"/>')
    # Title
    el.append(
        f'  <text x="{W//2}" y="28" text-anchor="middle" '
        f'font-family="Segoe UI,sans-serif" font-size="15" font-weight="bold" '
        f'fill="{TEXT_COLOR}">📊 Most Used Languages</text>'
    )

    # Donut slices
    angle = -90.0
    for i, (lang, count) in enumerate(top_n):
        pct   = count / total
        sweep = pct * 360
        color = COLORS[i % len(COLORS)]
        d     = donut_arc(CX, CY, R_OUT, R_IN, angle, sweep)
        el.append(
            f'  <path d="{d}" fill="{color}" stroke="{BG}" stroke-width="2.5"/>'
        )
        angle += sweep

    # Centre label
    el.append(
        f'  <text x="{CX}" y="{CY - 5}" text-anchor="middle" '
        f'font-family="Segoe UI,sans-serif" font-size="12" fill="{TEXT_COLOR}">Top</text>'
    )
    el.append(
        f'  <text x="{CX}" y="{CY + 11}" text-anchor="middle" '
        f'font-family="Segoe UI,sans-serif" font-size="12" fill="{TEXT_COLOR}">Langs</text>'
    )

    # Legend
    lx, ly, row_h = 195, 45, 24 # Legenda movida para a esquerda acompanhando o encolhimento
    for i, (lang, count) in enumerate(top_n):
        pct   = count / total * 100
        color = COLORS[i % len(COLORS)]
        y     = ly + i * row_h
        el += [
            f'  <rect x="{lx}" y="{y}" width="12" height="12" rx="3" fill="{color}"/>',
            (
                f'  <text x="{lx + 19}" y="{y + 11}" '
                f'font-family="Segoe UI,sans-serif" font-size="13" fill="{TEXT_COLOR}">'
                f'{lang}</text>'
            ),
            (
                f'  <text x="{W - 16}" y="{y + 11}" text-anchor="end" '
                f'font-family="Segoe UI,sans-serif" font-size="13" font-weight="bold" '
                f'fill="{TEXT_COLOR}">{pct:.1f}%</text>'
            ),
        ]

    el.append("</svg>")
    return "\n".join(el)


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"Fetching repos for @{USERNAME} …")
    repos = all_repos(USERNAME)
    print(f"  {len(repos)} repos found.")

    langs = lang_bytes(repos)
    print(f"  Languages detected: {', '.join(sorted(langs, key=langs.get, reverse=True)[:8])}")

    os.makedirs(os.path.dirname(OUTPUT) or ".", exist_ok=True)
    svg = build_svg(langs)
    with open(OUTPUT, "w", encoding="utf-8") as fh:
        fh.write(svg)
    print(f"  ✅ SVG written → {OUTPUT}")
