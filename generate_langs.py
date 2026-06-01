"""
generate_langs.py
Generates two SVG cards for the GitHub profile README:
  1. assets/language-stats.svg  — Dracula donut chart of top languages
  2. assets/contrib-stats.svg   — Animated area chart of contributions (purple)

Requires: GITHUB_TOKEN env variable (set as repo secret)
"""

import os, json, math, urllib.request, urllib.error
from datetime import datetime, timezone

USERNAME = "victoralecrim11"
TOKEN    = os.environ.get("GITHUB_TOKEN", "")

COLORS = ["#ff79c6","#bd93f9","#f1fa8c","#8be9fd","#ffb86c","#50fa7b","#ff5555","#6272a4"]
BG         = "#282a36"
PURPLE     = "#bd93f9"
PURPLE2    = "#6272a4"
TEXT_COLOR = "#f8f8f2"
SUBTEXT    = "#6272a4"

# ── GitHub API ────────────────────────────────────────────────────────────────
def gh_get(url):
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "lang-stats-action/1.0")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def gh_graphql(query):
    req = urllib.request.Request("https://api.github.com/graphql")
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "lang-stats-action/1.0")
    data = json.dumps({"query": query}).encode()
    with urllib.request.urlopen(req, data=data, timeout=20) as r:
        return json.loads(r.read())

def all_repos(username):
    repos, page = [], 1
    while True:
        chunk = gh_get(f"https://api.github.com/users/{username}/repos?per_page=100&page={page}")
        if not chunk: break
        repos.extend(chunk); page += 1
    return repos

def lang_bytes(repos):
    totals = {}
    for repo in repos:
        if repo.get("fork"): continue
        try:
            for lang, b in gh_get(repo["languages_url"]).items():
                totals[lang] = totals.get(lang, 0) + b
        except: continue
    return totals

def fetch_contrib_data(username):
    """Returns (weeks_data, total_this_year, public_repos, joined_year) via GraphQL."""
    query = """
    {
      user(login: "%s") {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
        repositories(privacy: PUBLIC) { totalCount }
        createdAt
      }
    }
    """ % username
    try:
        data  = gh_graphql(query)["data"]["user"]
        cal   = data["contributionsCollection"]["contributionCalendar"]
        weeks = cal["weeks"]
        total = cal["totalContributions"]
        repos = data["repositories"]["totalCount"]
        year  = datetime.fromisoformat(data["createdAt"].replace("Z","+00:00")).year
        joined_ago = datetime.now(timezone.utc).year - year
        return weeks, total, repos, joined_ago
    except Exception as e:
        print(f"  Warning: GraphQL failed ({e}), using fallback data")
        return None, 0, 0, 0

# ── SVG 1: Donut language chart ───────────────────────────────────────────────
def donut_arc(cx, cy, r_out, r_in, start_deg, sweep_deg):
    def pt(r, deg):
        rad = math.radians(deg)
        return cx + r*math.cos(rad), cy + r*math.sin(rad)
    end   = start_deg + sweep_deg
    large = 1 if sweep_deg > 180 else 0
    ox1,oy1 = pt(r_out, start_deg); ox2,oy2 = pt(r_out, end)
    ix1,iy1 = pt(r_in,  end);       ix2,iy2 = pt(r_in,  start_deg)
    return (f"M {ox1:.2f} {oy1:.2f} A {r_out} {r_out} 0 {large} 1 {ox2:.2f} {oy2:.2f} "
            f"L {ix1:.2f} {iy1:.2f} A {r_in} {r_in} 0 {large} 0 {ix2:.2f} {iy2:.2f} Z")

def build_lang_svg(langs):
    total = sum(langs.values())
    top_n = sorted(langs.items(), key=lambda x: x[1], reverse=True)[:7]
    others = total - sum(v for _,v in top_n)
    if others > 0: top_n.append(("Others", others))
    W,H = 480,240; CX,CY = 120,122; R_OUT,R_IN = 88,54
    el = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        f'  <rect width="{W}" height="{H}" rx="14" fill="{BG}"/>',
        f'  <text x="{W//2}" y="24" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="13" font-weight="bold" fill="{TEXT_COLOR}">📊 Most Used Languages</text>',
    ]
    angle = -90.0
    for i,(lang,count) in enumerate(top_n):
        sweep = count/total*360; color = COLORS[i%len(COLORS)]
        el.append(f'  <path d="{donut_arc(CX,CY,R_OUT,R_IN,angle,sweep)}" fill="{color}" stroke="{BG}" stroke-width="2.5"/>')
        angle += sweep
    el += [
        f'  <text x="{CX}" y="{CY-5}" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="10" fill="{TEXT_COLOR}">Top</text>',
        f'  <text x="{CX}" y="{CY+9}" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="10" fill="{TEXT_COLOR}">Langs</text>',
    ]
    lx,ly,row_h = 232,38,24
    for i,(lang,count) in enumerate(top_n):
        pct = count/total*100; color = COLORS[i%len(COLORS)]; y = ly+i*row_h
        el += [
            f'  <rect x="{lx}" y="{y}" width="12" height="12" rx="3" fill="{color}"/>',
            f'  <text x="{lx+19}" y="{y+10}" font-family="Segoe UI,sans-serif" font-size="12" fill="{TEXT_COLOR}">{lang}</text>',
            f'  <text x="{W-16}" y="{y+10}" text-anchor="end" font-family="Segoe UI,sans-serif" font-size="12" font-weight="bold" fill="{TEXT_COLOR}">{pct:.1f}%</text>',
        ]
    el.append("</svg>")
    return "\n".join(el)

# ── SVG 2: Animated contribution area chart ───────────────────────────────────
def build_contrib_svg(weeks, total_contribs, public_repos, joined_ago, username, email="victorcarmoalecrim@gmail.com"):
    W, H = 720, 175
    # Chart area geometry
    CX, CY      = 8, 8          # chart top-left padding inside the card right side
    CHART_X     = 270           # start x of chart area
    CHART_W     = W - CHART_X - 20
    CHART_H     = 100
    CHART_TOP   = 42

    # Flatten weeks → daily counts for the last 52 weeks
    days = []
    if weeks:
        for week in weeks[-52:]:
            for day in week["contributionDays"]:
                days.append(day["contributionCount"])
    else:
        import random; random.seed(42)
        days = [max(0, int(random.gauss(3,3))) for _ in range(364)]

    # Sample to ~120 points for a smooth curve
    step   = max(1, len(days)//120)
    pts    = days[::step]
    max_v  = max(pts) if max(pts) > 0 else 1

    # Build polyline points (area fill)
    n   = len(pts)
    xs  = [CHART_X + i*(CHART_W/(n-1)) for i in range(n)]
    ys  = [CHART_TOP + CHART_H - (v/max_v)*CHART_H for v in pts]

    poly = " ".join(f"{x:.1f},{y:.1f}" for x,y in zip(xs,ys))
    # Close path for filled area
    area_pts = (f"{xs[0]:.1f},{CHART_TOP+CHART_H} " +
                poly +
                f" {xs[-1]:.1f},{CHART_TOP+CHART_H}")

    # X-axis labels (months)
    from datetime import date, timedelta
    today     = date.today()
    month_labels = []
    seen = set()
    for i, idx in enumerate(range(0, len(days), step)):
        d = today - timedelta(days=len(days)-idx)
        key = (d.year, d.month)
        if key not in seen:
            seen.add(key)
            lx = CHART_X + i*(CHART_W/(n-1))
            month_labels.append((lx, d.strftime("%b")))

    # Y-axis labels
    y_labels = []
    for tick in [0, max_v//2, max_v]:
        yy = CHART_TOP + CHART_H - (tick/max_v)*CHART_H
        y_labels.append((yy, str(tick)))

    year_now = today.year

    el = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        # Defs: gradient + clip
        '''  <defs>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#bd93f9" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#bd93f9" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#bd93f9"/>
      <stop offset="100%" stop-color="#ff79c6"/>
    </linearGradient>
    <!-- Animated wipe mask: reveals chart left→right -->
    <mask id="wipe">
      <rect id="wipeRect" x="0" y="0" width="0" height="200" fill="white">
        <animate attributeName="width" from="0" to="800"
                 dur="1.8s" fill="freeze" calcMode="spline"
                 keyTimes="0;1" keySplines="0.4 0 0.2 1"/>
      </rect>
    </mask>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>''',
        # Background
        f'  <rect width="{W}" height="{H}" rx="14" fill="{BG}"/>',
        # Left info panel
        f'  <text x="20" y="30" font-family="Segoe UI,sans-serif" font-size="14" font-weight="bold" fill="{PURPLE}">{username} (Victor Alecrim)</text>',
    ]

    # Info rows
    info = [
        ("⬡", f"{total_contribs} Contributions in {year_now}"),
        ("◫", f"{public_repos} Public Repos"),
        ("◷", f"Joined GitHub {joined_ago} year{'s' if joined_ago!=1 else ''} ago"),
        ("✉", email),
    ]
    for i,(icon,text) in enumerate(info):
        y = 58 + i*26
        el.append(
            f'  <text x="20" y="{y}" font-family="Segoe UI,sans-serif" font-size="12" fill="{TEXT_COLOR}">'
            f'<tspan fill="{PURPLE}">{icon} </tspan>{text}</text>'
        )

    # Chart area (inside wipe mask)
    el.append(f'  <g mask="url(#wipe)">')

    # Subtle grid lines
    for tick in [0, max_v//4, max_v//2, 3*max_v//4, max_v]:
        yy = CHART_TOP + CHART_H - (tick/max_v)*CHART_H
        el.append(
            f'    <line x1="{CHART_X}" y1="{yy:.1f}" x2="{W-10}" y2="{yy:.1f}" '
            f'stroke="{PURPLE2}" stroke-width="0.4" stroke-dasharray="4,4" opacity="0.4"/>'
        )

    # Filled area
    el.append(f'    <polygon points="{area_pts}" fill="url(#areaGrad)"/>')

    # Line on top of area (with gradient + glow)
    el.append(
        f'    <polyline points="{poly}" fill="none" stroke="url(#lineGrad)" '
        f'stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)"/>'
    )

    el.append('  </g>')  # end mask group

    # X-axis month labels
    for lx,label in month_labels[::2]:   # every other month to avoid crowding
        el.append(
            f'  <text x="{lx:.1f}" y="{CHART_TOP+CHART_H+14}" '
            f'text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="9" fill="{SUBTEXT}">{label}</text>'
        )

    # Y-axis labels
    for yy,label in y_labels:
        el.append(
            f'  <text x="{W-8}" y="{yy+4:.1f}" text-anchor="end" '
            f'font-family="Segoe UI,sans-serif" font-size="9" fill="{SUBTEXT}">{label}</text>'
        )

    # Bottom label
    el.append(
        f'  <text x="{CHART_X + CHART_W//2}" y="{H-6}" text-anchor="middle" '
        f'font-family="Segoe UI,sans-serif" font-size="9" fill="{SUBTEXT}">contributions in the last year</text>'
    )

    el.append("</svg>")
    return "\n".join(el)


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    os.makedirs("assets", exist_ok=True)

    # 1. Language donut
    print(f"Fetching repos for @{USERNAME} …")
    repos = all_repos(USERNAME)
    print(f"  {len(repos)} repos found.")
    langs = lang_bytes(repos)
    print(f"  Languages: {', '.join(list(langs.keys())[:8])}")
    svg1 = build_lang_svg(langs)
    with open("assets/language-stats.svg","w",encoding="utf-8") as f: f.write(svg1)
    print("  ✅ assets/language-stats.svg written")

    # 2. Contribution area chart
    print("Fetching contribution data …")
    weeks, total, pub_repos, joined = fetch_contrib_data(USERNAME)
    svg2 = build_contrib_svg(weeks, total, pub_repos, joined, USERNAME)
    with open("assets/contrib-stats.svg","w",encoding="utf-8") as f: f.write(svg2)
    print("  ✅ assets/contrib-stats.svg written")
