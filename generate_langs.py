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
    W, H          = 420, 280  # Dimensões gerais maiores
    CX, CY        = 130, 155  # Reposicionamento do centro
    R_OUT, R_IN   = 100, 65   # Gr
