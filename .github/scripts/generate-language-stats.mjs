import { mkdir, writeFile } from "node:fs/promises";

const USERNAME = process.env.GITHUB_USERNAME || "victoralecrim11";
const OUTPUT = process.env.LANGUAGE_STATS_OUTPUT || "assets/language-stats.svg";
const TOKEN = process.env.GITHUB_TOKEN;
const STATS_DATA = process.env.LANGUAGE_STATS_DATA;

const colors = {
  Python: "#3572A5",
  JavaScript: "#F1E05A",
  HTML: "#E34C26",
  CSS: "#663399",
  "C#": "#178600",
  PHP: "#4F5D95",
  Java: "#B07219",
  TypeScript: "#3178C6",
  PowerShell: "#012456",
  "C++": "#F34B7D",
  CMake: "#DA3434",
  Go: "#00ADD8",
  Dart: "#00B4AB",
  SCSS: "#C6538C",
  Other: "#8B949E",
};

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "profile-language-stats",
};

if (TOKEN) {
  headers.Authorization = `Bearer ${TOKEN}`;
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function donutSegmentPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

async function getRepos() {
  const repos = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(`/users/${USERNAME}/repos?per_page=100&page=${page}&type=owner&sort=updated`);
    if (!batch.length) break;
    repos.push(...batch);
  }
  return repos.filter((repo) => !repo.fork && repo.name !== USERNAME);
}

function summarizeLanguages(totals) {
  const totalBytes = [...totals.values()].reduce((sum, bytes) => sum + bytes, 0);
  const rows = [...totals.entries()]
    .map(([name, bytes]) => ({
      name,
      bytes,
      percent: totalBytes === 0 ? 0 : (bytes / totalBytes) * 100,
      color: colors[name] || colors.Other,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const visible = rows.slice(0, 8);
  const remaining = rows.slice(8).reduce((sum, row) => sum + row.bytes, 0);

  if (remaining > 0) {
    visible.push({
      name: "Outras",
      bytes: remaining,
      percent: (remaining / totalBytes) * 100,
      color: colors.Other,
    });
  }

  return { rows: visible, totalBytes };
}

function renderSvg({ rows, repoCount, totalBytes }) {
  const width = 780;
  const height = 390;
  const cx = 210;
  const cy = 218;
  const outerRadius = 118;
  const innerRadius = 68;

  let angle = 0;
  const segments = rows.map((row) => {
    const startAngle = angle;
    const endAngle = angle + (row.percent / 100) * 360;
    angle = endAngle;
    return `<path d="${donutSegmentPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle)}" fill="${row.color}" stroke="#0d1117" stroke-width="3" />`;
  }).join("\n    ");

  const legend = rows
    .map((row, index) => {
      const y = 126 + index * 31;
      return `
    <g transform="translate(440, ${y})">
      <circle cx="0" cy="-4" r="5" fill="${row.color}" />
      <text x="18" y="0" class="legend">${escapeXml(row.name)}</text>
      <text x="190" y="0" class="value">${row.percent.toFixed(2)}%</text>
    </g>`;
    })
    .join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Linguagens mais usadas por Victor Alecrim</title>
  <desc id="desc">Linguagens mais usadas por Victor Alecrim.</desc>
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#010409" flood-opacity="0.45" />
    </filter>
    <radialGradient id="centerGlow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#1f6feb" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#0d1117" stop-opacity="0" />
    </radialGradient>
  </defs>
  <style>
    .card { fill: #0d1117; stroke: #30363d; stroke-width: 1; }
    .panel { fill: #161b22; stroke: #30363d; stroke-width: 1; }
    .title { fill: #58a6ff; font: 800 28px Segoe UI, Ubuntu, Arial, sans-serif; }
    .legend { fill: #c9d1d9; font: 600 14px Segoe UI, Ubuntu, Arial, sans-serif; }
    .value { fill: #f0f6fc; font: 700 14px Segoe UI, Ubuntu, Arial, sans-serif; text-anchor: end; }
    .centerPercent { fill: #f0f6fc; font: 800 28px Segoe UI, Ubuntu, Arial, sans-serif; text-anchor: middle; }
    .centerLabel { fill: #8b949e; font: 700 13px Segoe UI, Ubuntu, Arial, sans-serif; text-anchor: middle; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" class="card" />
  <rect x="24" y="24" width="732" height="342" rx="12" class="panel" />
  <text x="48" y="66" class="title">Most Used Languages</text>

  <g filter="url(#shadow)">
    <circle cx="${cx}" cy="${cy}" r="${outerRadius + 10}" fill="url(#centerGlow)" />
    ${segments}
    <circle cx="${cx}" cy="${cy}" r="${innerRadius - 5}" fill="#0d1117" stroke="#30363d" stroke-width="1" />
  </g>
  <text x="${cx}" y="${cy - 6}" class="centerPercent">${rows[0]?.percent.toFixed(2) || "0.00"}%</text>
  <text x="${cx}" y="${cy + 21}" class="centerLabel">${escapeXml(rows[0]?.name || "Sem dados")}</text>
${legend}
</svg>
`;
}

let summary;
let repoCount;

if (STATS_DATA) {
  const parsed = JSON.parse(STATS_DATA);
  summary = {
    rows: parsed.rows.map((row) => ({
      ...row,
      color: row.color || colors[row.name] || colors.Other,
    })),
    totalBytes: parsed.totalBytes,
  };
  repoCount = parsed.repoCount;
} else {
  const repos = await getRepos();
  repoCount = repos.length;
  const totals = new Map();

  for (const repo of repos) {
    const languages = await github(`/repos/${repo.owner.login}/${repo.name}/languages`);
    for (const [language, bytes] of Object.entries(languages)) {
      totals.set(language, (totals.get(language) || 0) + bytes);
    }
  }

  summary = summarizeLanguages(totals);
}

await mkdir(OUTPUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(OUTPUT, renderSvg({ ...summary, repoCount }), "utf8");

console.log(`Generated ${OUTPUT} with ${summary.rows.length} language rows.`);
