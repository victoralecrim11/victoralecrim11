import { mkdir, writeFile } from "node:fs/promises";

const USERNAME = process.env.GITHUB_USERNAME || "victoralecrim11";
const OUTPUT = process.env.LANGUAGE_STATS_OUTPUT || "assets/language-stats.svg";
const TOKEN = process.env.GITHUB_TOKEN;

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
  const width = 760;
  const height = 360;
  const barX = 42;
  const barY = 118;
  const barWidth = 676;
  const barHeight = 18;
  const now = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let cursor = barX;
  const segments = rows
    .map((row, index) => {
      const segmentWidth = index === rows.length - 1
        ? barX + barWidth - cursor
        : Math.max(3, (row.percent / 100) * barWidth);
      const x = cursor;
      cursor += segmentWidth;
      return `<rect x="${x.toFixed(2)}" y="${barY}" width="${segmentWidth.toFixed(2)}" height="${barHeight}" fill="${row.color}" />`;
    })
    .join("\n    ");

  const legend = rows
    .map((row, index) => {
      const col = index % 2;
      const line = Math.floor(index / 2);
      const x = 48 + col * 352;
      const y = 176 + line * 34;
      return `
    <g transform="translate(${x}, ${y})">
      <circle cx="0" cy="-4" r="5" fill="${row.color}" />
      <text x="16" y="0" class="legend">${escapeXml(row.name)}</text>
      <text x="202" y="0" class="value">${row.percent.toFixed(2)}%</text>
      <text x="270" y="0" class="muted">${formatBytes(row.bytes)}</text>
    </g>`;
    })
    .join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Linguagens mais usadas por Victor Alecrim</title>
  <desc id="desc">Gráfico com porcentagens de linguagens calculadas a partir dos repositórios públicos.</desc>
  <style>
    .card { fill: #0d1117; stroke: #30363d; stroke-width: 1; }
    .title { fill: #58a6ff; font: 700 24px Segoe UI, Ubuntu, Arial, sans-serif; }
    .subtitle { fill: #8b949e; font: 500 13px Segoe UI, Ubuntu, Arial, sans-serif; }
    .stat { fill: #f0f6fc; font: 700 20px Segoe UI, Ubuntu, Arial, sans-serif; }
    .label { fill: #8b949e; font: 500 12px Segoe UI, Ubuntu, Arial, sans-serif; }
    .legend { fill: #c9d1d9; font: 600 14px Segoe UI, Ubuntu, Arial, sans-serif; }
    .value { fill: #f0f6fc; font: 700 14px Segoe UI, Ubuntu, Arial, sans-serif; text-anchor: end; }
    .muted { fill: #8b949e; font: 500 12px Segoe UI, Ubuntu, Arial, sans-serif; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" class="card" />
  <text x="42" y="52" class="title">Most Used Languages</text>
  <text x="42" y="80" class="subtitle">Baseado em ${repoCount} repositórios públicos, sem Vercel API</text>

  <g transform="translate(542, 42)">
    <text x="0" y="0" class="label">Total analisado</text>
    <text x="0" y="28" class="stat">${formatBytes(totalBytes)}</text>
    <text x="0" y="54" class="label">Atualizado em ${now}</text>
  </g>

  <clipPath id="barClip"><rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="9" /></clipPath>
  <g clip-path="url(#barClip)">
    <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="#21262d" />
    ${segments}
  </g>
  <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="9" stroke="#30363d" />
  ${legend}
</svg>
`;
}

const repos = await getRepos();
const totals = new Map();

for (const repo of repos) {
  const languages = await github(`/repos/${repo.owner.login}/${repo.name}/languages`);
  for (const [language, bytes] of Object.entries(languages)) {
    totals.set(language, (totals.get(language) || 0) + bytes);
  }
}

const summary = summarizeLanguages(totals);
await mkdir(OUTPUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(OUTPUT, renderSvg({ ...summary, repoCount: repos.length }), "utf8");

console.log(`Generated ${OUTPUT} with ${summary.rows.length} language rows.`);
