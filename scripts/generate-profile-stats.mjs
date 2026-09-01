import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";
const DEFAULT_OUTPUT_DIR = "assets";
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const LANGUAGE_COLORS = new Map([
  ["C", "#A8B9CC"],
  ["C#", "#9B4F96"],
  ["C++", "#F34B7D"],
  ["CSS", "#663399"],
  ["Go", "#00ADD8"],
  ["HTML", "#E34C26"],
  ["Java", "#B07219"],
  ["JavaScript", "#F1E05A"],
  ["Kotlin", "#A97BFF"],
  ["PowerShell", "#5391FE"],
  ["Python", "#3572A5"],
  ["Ruby", "#701516"],
  ["Rust", "#DEA584"],
  ["Shell", "#89E051"],
  ["Swift", "#F05138"],
  ["TypeScript", "#3178C6"],
]);

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function parseLinkHeader(header) {
  const links = {};

  for (const part of (header ?? "").split(",")) {
    const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (match) {
      links[match[2]] = match[1];
    }
  }

  return links;
}

async function githubResponse(url, { token, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url.startsWith("http") ? url : `${API_ROOT}${url}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "Frostfire25-profile-readme",
      "X-GitHub-Api-Version": API_VERSION,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `GitHub API request failed (${response.status} ${response.statusText}): ${details}`,
    );
  }

  return response;
}

export async function requestJson(url, options) {
  const response = await githubResponse(url, options);
  return response.json();
}

export async function fetchPaginated(url, options) {
  const items = [];
  let nextUrl = url;

  while (nextUrl) {
    const response = await githubResponse(nextUrl, options);
    const page = await response.json();

    if (!Array.isArray(page)) {
      throw new TypeError(`Expected a paginated array from ${nextUrl}`);
    }

    items.push(...page);
    nextUrl = parseLinkHeader(response.headers.get("link")).next;
  }

  return items;
}

export function aggregateLanguages(languageMaps) {
  const totals = new Map();

  for (const languages of languageMaps) {
    for (const [name, bytes] of Object.entries(languages)) {
      if (!Number.isFinite(bytes) || bytes < 0) {
        throw new TypeError(`Invalid byte count for ${name}`);
      }
      totals.set(name, (totals.get(name) ?? 0) + bytes);
    }
  }

  return [...totals.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((left, right) => right.bytes - left.bytes || compareText(left.name, right.name));
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function languageColor(name) {
  const knownColor = LANGUAGE_COLORS.get(name);
  if (knownColor) return knownColor;

  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return `hsl(${hash % 360} 62% 58%)`;
}

function metricCard({ x, value, label }) {
  return `
    <g transform="translate(${x} 122)">
      <rect width="154" height="92" rx="16" fill="#161b22" stroke="#30363d"/>
      <text x="18" y="39" fill="#f0f6fc" font-size="25" font-weight="700">${escapeXml(value)}</text>
      <text x="18" y="67" fill="#8b949e" font-size="13">${escapeXml(label)}</text>
    </g>`;
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${NUMBER_FORMAT.format(count)} ${count === 1 ? singular : plural}`;
}

export function renderStatsSvg({ owner, publicRepos, stars, forks, followers }) {
  const title = `${owner}'s GitHub statistics`;
  const description =
    `${countLabel(publicRepos, "public repository", "public repositories")}, ` +
    `${countLabel(stars, "star")} earned, ${countLabel(forks, "fork")}, ` +
    `and ${countLabel(followers, "follower")}.`;
  const metrics = [
    { x: 36, value: NUMBER_FORMAT.format(publicRepos), label: "Public repositories" },
    { x: 202, value: NUMBER_FORMAT.format(stars), label: "Stars earned" },
    { x: 368, value: NUMBER_FORMAT.format(forks), label: "Repository forks" },
    { x: 534, value: NUMBER_FORMAT.format(followers), label: "Followers" },
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="724" height="250" viewBox="0 0 724 250" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  <defs>
    <linearGradient id="stats-background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1117"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
    <linearGradient id="stats-accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#58a6ff"/>
      <stop offset="1" stop-color="#a371f7"/>
    </linearGradient>
  </defs>
  <rect width="724" height="250" rx="22" fill="url(#stats-background)"/>
  <rect x="1" y="1" width="722" height="248" rx="21" fill="none" stroke="#30363d"/>
  <rect x="36" y="34" width="48" height="5" rx="2.5" fill="url(#stats-accent)"/>
  <text x="36" y="72" fill="#f0f6fc" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="25" font-weight="700">GitHub at a glance</text>
  <text x="36" y="99" fill="#8b949e" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="14">${escapeXml(owner)}&apos;s public profile</text>
  <g font-family="Inter,Segoe UI,Arial,sans-serif">
${metrics.map(metricCard).join("")}
  </g>
</svg>
`;
}

export function renderLanguagesSvg({ owner, languages, repositoryCount }) {
  const topLanguages = languages.slice(0, 5);
  const totalBytes = languages.reduce((sum, language) => sum + language.bytes, 0);
  const title = `${owner}'s most-used repository languages`;
  const summary = topLanguages.length
    ? topLanguages
        .map(({ name, bytes }) => `${name} ${((bytes / totalBytes) * 100).toFixed(1)}%`)
        .join(", ")
    : "No language data is currently available";

  let barX = 36;
  const barSegments = topLanguages
    .map(({ name, bytes }) => {
      const width = totalBytes === 0 ? 0 : (bytes / totalBytes) * 652;
      const segment = `<rect x="${barX.toFixed(2)}" y="103" width="${width.toFixed(2)}" height="16" fill="${languageColor(name)}"/>`;
      barX += width;
      return segment;
    })
    .join("\n    ");

  const rows = topLanguages
    .map(({ name, bytes }, index) => {
      const y = 158 + index * 35;
      const percentage = totalBytes === 0 ? 0 : (bytes / totalBytes) * 100;
      return `<circle cx="44" cy="${y - 5}" r="6" fill="${languageColor(name)}"/>
    <text x="60" y="${y}" fill="#c9d1d9" font-size="14" font-weight="600">${escapeXml(name)}</text>
    <text x="676" y="${y}" fill="#8b949e" font-size="14" text-anchor="end">${percentage.toFixed(1)}%</text>`;
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="724" height="350" viewBox="0 0 724 350" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(summary)}. Based on ${repositoryCount} original public repositories.</desc>
  <defs>
    <linearGradient id="languages-background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1117"/>
      <stop offset="1" stop-color="#161329"/>
    </linearGradient>
    <clipPath id="language-bar">
      <rect x="36" y="103" width="652" height="16" rx="8"/>
    </clipPath>
  </defs>
  <rect width="724" height="350" rx="22" fill="url(#languages-background)"/>
  <rect x="1" y="1" width="722" height="348" rx="21" fill="none" stroke="#30363d"/>
  <text x="36" y="50" fill="#f0f6fc" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="25" font-weight="700">Languages I use</text>
  <text x="36" y="77" fill="#8b949e" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="14">Across ${repositoryCount} original public repositories</text>
  <rect x="36" y="103" width="652" height="16" rx="8" fill="#21262d"/>
  <g clip-path="url(#language-bar)">
    ${barSegments}
  </g>
  <g font-family="Inter,Segoe UI,Arial,sans-serif">
    ${rows || '<text x="36" y="166" fill="#8b949e" font-size="14">No language data is currently available.</text>'}
  </g>
</svg>
`;
}

export async function collectProfileData({ owner, token, fetchImpl = fetch }) {
  const encodedOwner = encodeURIComponent(owner);
  const requestOptions = { token, fetchImpl };
  const [profile, repositories] = await Promise.all([
    requestJson(`/users/${encodedOwner}`, requestOptions),
    fetchPaginated(
      `/users/${encodedOwner}/repos?type=owner&sort=full_name&direction=asc&per_page=100`,
      requestOptions,
    ),
  ]);
  const publicRepositories = repositories
    .filter(
      (repository) =>
        !repository.private &&
        repository.owner?.login?.toLowerCase() === owner.toLowerCase(),
    )
    .sort((left, right) => compareText(left.full_name, right.full_name));
  const originalRepositories = publicRepositories.filter((repository) => !repository.fork);
  const languageMaps = [];

  for (const repository of originalRepositories) {
    languageMaps.push(
      await requestJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository.name)}/languages`,
        requestOptions,
      ),
    );
  }

  return {
    owner,
    publicRepos: profile.public_repos,
    stars: publicRepositories.reduce(
      (sum, repository) => sum + repository.stargazers_count,
      0,
    ),
    forks: publicRepositories.reduce((sum, repository) => sum + repository.forks_count, 0),
    followers: profile.followers,
    languages: aggregateLanguages(languageMaps),
    repositoryCount: originalRepositories.length,
  };
}

async function writeIfChanged(filePath, contents) {
  let currentContents;
  try {
    currentContents = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (currentContents === contents) return false;

  await writeFile(filePath, contents, "utf8");
  return true;
}

function parseArguments(args) {
  const options = {
    owner: process.env.PROFILE_OWNER,
    outputDir: process.env.PROFILE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--owner") {
      options.owner = args[++index];
    } else if (argument === "--output-dir") {
      options.outputDir = args[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.owner) {
    throw new Error("Set PROFILE_OWNER or pass --owner <GitHub username>.");
  }
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required to query the GitHub API.");
  }

  return options;
}

export async function main(args = process.argv.slice(2)) {
  const { owner, outputDir } = parseArguments(args);
  const data = await collectProfileData({
    owner,
    token: process.env.GITHUB_TOKEN,
  });
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });

  const results = await Promise.all([
    writeIfChanged(
      path.join(resolvedOutputDir, "github-stats.svg"),
      renderStatsSvg(data),
    ),
    writeIfChanged(
      path.join(resolvedOutputDir, "top-languages.svg"),
      renderLanguagesSvg(data),
    ),
  ]);

  console.log(results.some(Boolean) ? "Profile stats updated." : "Profile stats are unchanged.");
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(currentFile).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
