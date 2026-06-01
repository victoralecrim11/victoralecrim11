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
  const width = 700;
  const height = 340;
  const topRows = rows.slice(0, 5);

  function donut(cx, cy, outerRadius, innerRadius, sourceRows) {
    let angle = 0;
    return sourceRows.map((row) => {
      const startAngle = angle;
      const endAngle = angle + (row.percent / 100) * 360;
      angle = endAngle;
      return `<path d="${donutSegmentPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle)}" fill="${row.color}" stroke="#fff6df" stroke-width="3" />`;
    }).join("\n      ");
  }

  const legend = topRows
    .map((row, index) => {
      const y = 238 + index * 17;
      return `
      <g transform="translate(82, ${y})">
        <rect x="0" y="-8" width="9" height="9" rx="2" fill="${row.color}" />
        <text x="15" y="0" class="small">${escapeXml(row.name)}</text>
        <text x="132" y="0" class="smallValue">${row.percent.toFixed(2)}%</text>
      </g>`;
    })
    .join("");

  const secondLegend = topRows
    .map((row, index) => {
      const y = 238 + index * 17;
      return `
      <g transform="translate(393, ${y})">
        <rect x="0" y="-8" width="9" height="9" rx="2" fill="${row.color}" />
        <text x="15" y="0" class="small">${escapeXml(row.name)}</text>
        <text x="132" y="0" class="smallValue">${row.percent.toFixed(2)}%</text>
      </g>`;
    })
    .join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Linguagens mais usadas por Victor Alecrim</title>
  <desc id="desc">Linguagens mais usadas por Victor Alecrim.</desc>
  <defs>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#88a51e" stop-opacity="0.92" />
      <stop offset="100%" stop-color="#88a51e" stop-opacity="0.18" />
    </linearGradient>
  </defs>
  <style>
    .bg { fill: #fff9e8; }
    .card { fill: #fff3d7; stroke: #f0dfb5; stroke-width: 1; }
    .title { fill: #2483ff; font: 700 18px Segoe UI, Ubuntu, Arial, sans-serif; }
    .name { fill: #2483ff; font: 700 18px Segoe UI, Ubuntu, Arial, sans-serif; }
    .text { fill: #7d6a3a; font: 600 13px Segoe UI, Ubuntu, Arial, sans-serif; }
    .small { fill: #7d6a3a; font: 600 10px Segoe UI, Ubuntu, Arial, sans-serif; }
    .smallValue { fill: #3b3320; font: 700 10px Segoe UI, Ubuntu, Arial, sans-serif; text-anchor: end; }
    .axis { fill: #a28c56; font: 500 9px Segoe UI, Ubuntu, Arial, sans-serif; }
  </style>
  <rect width="${width}" height="${height}" rx="16" class="bg" />

  <rect x="32" y="24" width="636" height="132" rx="14" class="card" />
  <text x="58" y="56" class="name">Victor Alecrim</text>
  <text x="58" y="82" class="text">🎓 Ciência da Computação</text>
  <text x="58" y="106" class="text">💻 Desenvolvimento full-stack</text>
  <text x="58" y="130" class="text">🎯 Web, APIs e tecnologia</text>

  <path d="M 326 129 L 326 117 C 352 101, 369 117, 388 106 C 414 92, 426 48, 452 72 C 471 89, 485 121, 505 91 C 525 61, 536 43, 555 72 C 570 95, 584 106, 606 69 C 624 41, 646 86, 646 129 Z" fill="url(#area)" />
  <polyline points="326,117 352,104 369,117 388,106 414,92 426,48 452,72 471,89 485,121 505,91 525,61 536,43 555,72 570,95 584,106 606,69 624,41 646,86" fill="none" stroke="#88a51e" stroke-width="3" />
  <line x1="326" y1="129" x2="646" y2="129" stroke="#d6c490" />
  <text x="326" y="145" class="axis">2024</text>
  <text x="473" y="145" class="axis">2025</text>
  <text x="622" y="145" class="axis">2026</text>

  <rect x="32" y="172" width="300" height="144" rx="14" class="card" />
  <text x="58" y="202" class="title">Repos per Language</text>
  <g transform="translate(242, 238)">
      ${donut(0, 0, 42, 23, rows)}
      <circle cx="0" cy="0" r="21" fill="#fff3d7" />
  </g>
${legend}

  <rect x="368" y="172" width="300" height="144" rx="14" class="card" />
  <text x="394" y="202" class="title">Most Used Languages</text>
  <g transform="translate(554, 238)">
      ${donut(0, 0, 42, 23, rows)}
      <circle cx="0" cy="0" r="21" fill="#fff3d7" />
  </g>
${secondLegend}
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
