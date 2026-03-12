/**
 * Dependency Intelligence Service
 *
 * Provides dependency analysis capabilities:
 * - Parse package manifests (package.json, requirements.txt, etc.)
 * - Check for security advisories
 * - Detect unmaintained packages
 * - Suggest upgrade paths for major version changes
 * - Monitor for breaking changes
 */

import { prisma } from "../db.js";
import type {
  DependencyEcosystem,
  DependencyAlertSeverity,
  DependencyAlertType,
} from "../../../generated/prisma/client.js";

// ============================================================================
// Types
// ============================================================================

export interface ParsedDependency {
  name: string;
  version: string;
  isDev: boolean;
  isTransitive: boolean;
  ecosystem: DependencyEcosystem;
}

export interface ManifestParseResult {
  ecosystem: DependencyEcosystem;
  manifestPath: string;
  dependencies: ParsedDependency[];
  lockfileHash?: string;
}

export interface SecurityAdvisory {
  id: string;
  packageName: string;
  ecosystem: string;
  severity: DependencyAlertSeverity;
  title: string;
  description: string;
  cveId?: string;
  cvssScore?: number;
  affectedVersions: string;
  patchedVersion?: string;
  sourceUrl: string;
  publishedAt: Date;
}

export interface PackageInfo {
  name: string;
  ecosystem: DependencyEcosystem;
  latestVersion: string;
  latestStableVersion?: string;
  lastPublishDate?: Date;
  isDeprecated: boolean;
  deprecationMessage?: string;
  repositoryUrl?: string;
  homepage?: string;
  license?: string;
  versions: { version: string; publishedAt: Date }[];
}

export interface UpgradePath {
  from: string;
  to: string;
  steps: string[];
  breakingChanges: string[];
  migrationGuide?: string;
}

export interface DependencyAnalysisResult {
  repositoryId: string;
  ecosystem: DependencyEcosystem;
  totalDependencies: number;
  securityAlerts: number;
  unmaintainedPackages: number;
  outdatedPackages: number;
  deprecatedPackages: number;
  alerts: Array<{
    packageName: string;
    currentVersion: string;
    alertType: DependencyAlertType;
    severity: DependencyAlertSeverity;
    title: string;
    description: string;
    recommendedVersion?: string;
  }>;
}

// ============================================================================
// Manifest Parsers
// ============================================================================

/**
 * Parse package.json (npm/yarn/pnpm)
 */
function parsePackageJson(content: string, path: string): ManifestParseResult {
  const pkg = JSON.parse(content);
  const dependencies: ParsedDependency[] = [];

  // Parse regular dependencies
  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      dependencies.push({
        name,
        version: normalizeVersion(version as string),
        isDev: false,
        isTransitive: false,
        ecosystem: "npm",
      });
    }
  }

  // Parse dev dependencies
  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      dependencies.push({
        name,
        version: normalizeVersion(version as string),
        isDev: true,
        isTransitive: false,
        ecosystem: "npm",
      });
    }
  }

  // Parse peer dependencies
  if (pkg.peerDependencies) {
    for (const [name, version] of Object.entries(pkg.peerDependencies)) {
      // Skip if already in regular deps
      if (!dependencies.find((d) => d.name === name)) {
        dependencies.push({
          name,
          version: normalizeVersion(version as string),
          isDev: false,
          isTransitive: false,
          ecosystem: "npm",
        });
      }
    }
  }

  return {
    ecosystem: "npm",
    manifestPath: path,
    dependencies,
  };
}

/**
 * Parse requirements.txt (Python/pip)
 */
function parseRequirementsTxt(content: string, path: string): ManifestParseResult {
  const dependencies: ParsedDependency[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) {
      continue;
    }

    // Handle -e (editable) packages
    if (trimmed.startsWith("-e")) {
      continue;
    }

    // Parse package==version, package>=version, package~=version, etc.
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*([<>=!~]+)?\s*(.+)?$/);
    if (match) {
      const [, name, , version] = match;
      dependencies.push({
        name: name.toLowerCase(),
        version: version?.trim() || "*",
        isDev: path.includes("dev") || path.includes("test"),
        isTransitive: false,
        ecosystem: "pypi",
      });
    }
  }

  return {
    ecosystem: "pypi",
    manifestPath: path,
    dependencies,
  };
}

/**
 * Parse pyproject.toml (Python/Poetry/PEP 517)
 */
function parsePyprojectToml(content: string, path: string): ManifestParseResult {
  const dependencies: ParsedDependency[] = [];

  // Simple TOML parsing for dependencies
  // Look for [project.dependencies] or [tool.poetry.dependencies]
  const projectDepsMatch = content.match(
    /\[project\.dependencies\]([\s\S]*?)(?=\[|$)/
  );
  const poetryDepsMatch = content.match(
    /\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\[|$)/
  );

  const parseSection = (section: string, isDev: boolean) => {
    const lines = section.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) {
        continue;
      }

      // Handle "package = version" or 'package = { version = "x.y.z" }'
      const simpleMatch = trimmed.match(/^["']?([a-zA-Z0-9_-]+)["']?\s*[=:]\s*["']?([^"']+)["']?/);
      if (simpleMatch) {
        const [, name, version] = simpleMatch;
        if (name.toLowerCase() !== "python") {
          dependencies.push({
            name: name.toLowerCase(),
            version: version.replace(/[{}"']/g, "").trim() || "*",
            isDev,
            isTransitive: false,
            ecosystem: "pypi",
          });
        }
      }
    }
  };

  if (projectDepsMatch) {
    parseSection(projectDepsMatch[1], false);
  }
  if (poetryDepsMatch) {
    parseSection(poetryDepsMatch[1], false);
  }

  // Check for dev dependencies
  const devDepsMatch = content.match(
    /\[tool\.poetry\.dev-dependencies\]([\s\S]*?)(?=\[|$)/
  );
  if (devDepsMatch) {
    parseSection(devDepsMatch[1], true);
  }

  return {
    ecosystem: "pypi",
    manifestPath: path,
    dependencies,
  };
}

/**
 * Parse go.mod (Go modules)
 */
function parseGoMod(content: string, path: string): ManifestParseResult {
  const dependencies: ParsedDependency[] = [];
  const lines = content.split("\n");
  let inRequire = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "require (") {
      inRequire = true;
      continue;
    }
    if (trimmed === ")") {
      inRequire = false;
      continue;
    }

    if (inRequire || trimmed.startsWith("require ")) {
      const requireLine = trimmed.replace("require ", "").trim();
      const match = requireLine.match(/^([^\s]+)\s+v?([^\s]+)/);
      if (match) {
        const [, name, version] = match;
        // Skip indirect dependencies
        const isIndirect = line.includes("// indirect");
        dependencies.push({
          name,
          version,
          isDev: false,
          isTransitive: isIndirect,
          ecosystem: "go",
        });
      }
    }
  }

  return {
    ecosystem: "go",
    manifestPath: path,
    dependencies,
  };
}

/**
 * Parse Cargo.toml (Rust)
 */
function parseCargoToml(content: string, path: string): ManifestParseResult {
  const dependencies: ParsedDependency[] = [];

  // Simple TOML parsing for [dependencies] and [dev-dependencies]
  const depsMatch = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
  const devDepsMatch = content.match(/\[dev-dependencies\]([\s\S]*?)(?=\[|$)/);

  const parseSection = (section: string, isDev: boolean) => {
    const lines = section.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) {
        continue;
      }

      // Handle "package = version" or 'package = { version = "x.y.z" }'
      const simpleMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
      const complexMatch = trimmed.match(
        /^([a-zA-Z0-9_-]+)\s*=\s*\{.*version\s*=\s*"([^"]+)"/
      );

      if (simpleMatch) {
        dependencies.push({
          name: simpleMatch[1],
          version: simpleMatch[2],
          isDev,
          isTransitive: false,
          ecosystem: "cargo",
        });
      } else if (complexMatch) {
        dependencies.push({
          name: complexMatch[1],
          version: complexMatch[2],
          isDev,
          isTransitive: false,
          ecosystem: "cargo",
        });
      }
    }
  };

  if (depsMatch) {
    parseSection(depsMatch[1], false);
  }
  if (devDepsMatch) {
    parseSection(devDepsMatch[1], true);
  }

  return {
    ecosystem: "cargo",
    manifestPath: path,
    dependencies,
  };
}

/**
 * Parse Gemfile (Ruby)
 */
function parseGemfile(content: string, path: string): ManifestParseResult {
  const dependencies: ParsedDependency[] = [];
  const lines = content.split("\n");
  let inGroup: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Track group context
    const groupMatch = trimmed.match(/^group\s+:(\w+)/);
    if (groupMatch) {
      inGroup = groupMatch[1];
      continue;
    }
    if (trimmed === "end") {
      inGroup = null;
      continue;
    }

    // Parse gem declarations
    const gemMatch = trimmed.match(/^gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
    if (gemMatch) {
      const [, name, version] = gemMatch;
      dependencies.push({
        name,
        version: version || "*",
        isDev: inGroup === "development" || inGroup === "test",
        isTransitive: false,
        ecosystem: "gem",
      });
    }
  }

  return {
    ecosystem: "gem",
    manifestPath: path,
    dependencies,
  };
}

/**
 * Parse composer.json (PHP)
 */
function parseComposerJson(content: string, path: string): ManifestParseResult {
  const composer = JSON.parse(content);
  const dependencies: ParsedDependency[] = [];

  if (composer.require) {
    for (const [name, version] of Object.entries(composer.require)) {
      // Skip PHP version constraints
      if (name === "php" || name.startsWith("ext-")) {
        continue;
      }
      dependencies.push({
        name,
        version: normalizeVersion(version as string),
        isDev: false,
        isTransitive: false,
        ecosystem: "composer",
      });
    }
  }

  if (composer["require-dev"]) {
    for (const [name, version] of Object.entries(composer["require-dev"])) {
      dependencies.push({
        name,
        version: normalizeVersion(version as string),
        isDev: true,
        isTransitive: false,
        ecosystem: "composer",
      });
    }
  }

  return {
    ecosystem: "composer",
    manifestPath: path,
    dependencies,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeVersion(version: string): string {
  // Remove ^ ~ >= <= > < = prefixes for comparison
  return version.replace(/^[\^~>=<]+/, "").trim();
}

function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2] || "0", 10),
    patch: parseInt(match[3] || "0", 10),
  };
}

function isVersionLessThan(v1: string, v2: string): boolean {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  if (!p1 || !p2) return false;

  if (p1.major !== p2.major) return p1.major < p2.major;
  if (p1.minor !== p2.minor) return p1.minor < p2.minor;
  return p1.patch < p2.patch;
}

function isMajorVersionBump(from: string, to: string): boolean {
  const p1 = parseVersion(from);
  const p2 = parseVersion(to);
  if (!p1 || !p2) return false;
  return p2.major > p1.major;
}

function daysSince(date: Date): number {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Registry API Functions
// ============================================================================

const CACHE_DURATION_HOURS = 6;
const UNMAINTAINED_THRESHOLD_DAYS = 730; // 2 years

/**
 * Fetch package info from npm registry
 */
async function fetchNpmPackageInfo(packageName: string): Promise<PackageInfo | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`npm registry error: ${response.status}`);
    }

    const data = await response.json();
    const times = data.time || {};
    const versions = Object.keys(data.versions || {})
      .filter((v) => !v.includes("-"))
      .map((v) => ({
        version: v,
        publishedAt: times[v] ? new Date(times[v]) : new Date(),
      }))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    const latest = data["dist-tags"]?.latest;
    const latestInfo = latest ? data.versions?.[latest] : null;

    return {
      name: packageName,
      ecosystem: "npm",
      latestVersion: latest || versions[0]?.version || "0.0.0",
      latestStableVersion: latest,
      lastPublishDate: times.modified ? new Date(times.modified) : undefined,
      isDeprecated: !!latestInfo?.deprecated,
      deprecationMessage: latestInfo?.deprecated,
      repositoryUrl: latestInfo?.repository?.url,
      homepage: latestInfo?.homepage,
      license: latestInfo?.license,
      versions,
    };
  } catch (error) {
    console.error(`Failed to fetch npm package info for ${packageName}:`, error);
    return null;
  }
}

/**
 * Fetch package info from PyPI
 */
async function fetchPypiPackageInfo(packageName: string): Promise<PackageInfo | null> {
  try {
    const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`PyPI error: ${response.status}`);
    }

    const data = await response.json();
    const info = data.info || {};
    const releases = data.releases || {};

    const versions = Object.entries(releases)
      .filter(([v]) => !v.includes("a") && !v.includes("b") && !v.includes("rc"))
      .map(([version, files]: [string, any]) => ({
        version,
        publishedAt: files[0]?.upload_time ? new Date(files[0].upload_time) : new Date(),
      }))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    return {
      name: packageName,
      ecosystem: "pypi",
      latestVersion: info.version || versions[0]?.version || "0.0.0",
      latestStableVersion: info.version,
      lastPublishDate: versions[0]?.publishedAt,
      isDeprecated: info.classifiers?.some((c: string) =>
        c.includes("Development Status :: 7 - Inactive")
      ) || false,
      repositoryUrl: info.project_urls?.Repository || info.project_urls?.Source,
      homepage: info.home_page || info.project_urls?.Homepage,
      license: info.license,
      versions,
    };
  } catch (error) {
    console.error(`Failed to fetch PyPI package info for ${packageName}:`, error);
    return null;
  }
}

/**
 * Fetch security advisories from GitHub Advisory Database
 */
async function fetchGitHubAdvisories(
  ecosystem: DependencyEcosystem,
  packageName: string
): Promise<SecurityAdvisory[]> {
  try {
    // GitHub's Advisory Database API
    const ecosystemMap: Record<DependencyEcosystem, string> = {
      npm: "npm",
      pypi: "pip",
      maven: "maven",
      go: "go",
      cargo: "cargo",
      nuget: "nuget",
      gem: "rubygems",
      composer: "composer",
    };

    const ghEcosystem = ecosystemMap[ecosystem];
    const url = `https://api.github.com/advisories?ecosystem=${ghEcosystem}&affects=${encodeURIComponent(packageName)}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      // Rate limited or other error - return empty
      return [];
    }

    const advisories = await response.json();
    return advisories.map((adv: any) => ({
      id: adv.ghsa_id,
      packageName,
      ecosystem,
      severity: adv.severity?.toLowerCase() || "moderate",
      title: adv.summary,
      description: adv.description,
      cveId: adv.cve_id,
      cvssScore: adv.cvss?.score,
      affectedVersions: adv.vulnerabilities?.[0]?.vulnerable_version_range || "*",
      patchedVersion: adv.vulnerabilities?.[0]?.patched_versions,
      sourceUrl: adv.html_url,
      publishedAt: new Date(adv.published_at),
    }));
  } catch (error) {
    console.error(`Failed to fetch GitHub advisories for ${packageName}:`, error);
    return [];
  }
}

/**
 * Get cached package metadata or fetch from registry
 */
async function getPackageInfo(
  ecosystem: DependencyEcosystem,
  packageName: string
): Promise<PackageInfo | null> {
  // Check cache first
  const cached = await prisma.packageMetadataCache.findUnique({
    where: { ecosystem_packageName: { ecosystem, packageName } },
  });

  if (cached && new Date() < cached.expiresAt) {
    return {
      name: packageName,
      ecosystem,
      latestVersion: cached.latestVersion || "0.0.0",
      latestStableVersion: cached.latestStableVersion || undefined,
      lastPublishDate: cached.lastPublishDate || undefined,
      isDeprecated: cached.isDeprecated,
      deprecationMessage: cached.deprecationMessage || undefined,
      repositoryUrl: cached.repositoryUrl || undefined,
      homepage: cached.homepage || undefined,
      license: cached.license || undefined,
      versions: (cached.versions as any[]) || [],
    };
  }

  // Fetch from registry
  let info: PackageInfo | null = null;

  switch (ecosystem) {
    case "npm":
      info = await fetchNpmPackageInfo(packageName);
      break;
    case "pypi":
      info = await fetchPypiPackageInfo(packageName);
      break;
    // Add more registries as needed
    default:
      return null;
  }

  if (info) {
    // Cache the result
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_DURATION_HOURS);

    await prisma.packageMetadataCache.upsert({
      where: { ecosystem_packageName: { ecosystem, packageName } },
      create: {
        ecosystem,
        packageName,
        latestVersion: info.latestVersion,
        latestStableVersion: info.latestStableVersion,
        lastPublishDate: info.lastPublishDate,
        isDeprecated: info.isDeprecated,
        deprecationMessage: info.deprecationMessage,
        repositoryUrl: info.repositoryUrl,
        homepage: info.homepage,
        license: info.license,
        versions: info.versions as any,
        expiresAt,
      },
      update: {
        latestVersion: info.latestVersion,
        latestStableVersion: info.latestStableVersion,
        lastPublishDate: info.lastPublishDate,
        isDeprecated: info.isDeprecated,
        deprecationMessage: info.deprecationMessage,
        repositoryUrl: info.repositoryUrl,
        homepage: info.homepage,
        license: info.license,
        versions: info.versions as any,
        cachedAt: new Date(),
        expiresAt,
      },
    });
  }

  return info;
}

// ============================================================================
// Main Service Functions
// ============================================================================

/**
 * Parse a manifest file and extract dependencies
 */
export function parseManifest(
  content: string,
  filename: string
): ManifestParseResult | null {
  const basename = filename.split("/").pop() || filename;

  try {
    switch (basename) {
      case "package.json":
        return parsePackageJson(content, filename);
      case "requirements.txt":
      case "requirements-dev.txt":
      case "requirements-test.txt":
        return parseRequirementsTxt(content, filename);
      case "pyproject.toml":
        return parsePyprojectToml(content, filename);
      case "go.mod":
        return parseGoMod(content, filename);
      case "Cargo.toml":
        return parseCargoToml(content, filename);
      case "Gemfile":
        return parseGemfile(content, filename);
      case "composer.json":
        return parseComposerJson(content, filename);
      default:
        return null;
    }
  } catch (error) {
    console.error(`Failed to parse manifest ${filename}:`, error);
    return null;
  }
}

/**
 * Analyze dependencies for a repository and create alerts
 */
export async function analyzeDependencies(
  repositoryId: string,
  userId: string,
  manifests: Array<{ path: string; content: string }>,
  branch?: string
): Promise<DependencyAnalysisResult[]> {
  const results: DependencyAnalysisResult[] = [];

  for (const manifest of manifests) {
    const parsed = parseManifest(manifest.content, manifest.path);
    if (!parsed) continue;

    // Store the snapshot
    await prisma.dependencySnapshot.upsert({
      where: {
        id: `${repositoryId}-${parsed.ecosystem}-${manifest.path}`.slice(0, 25),
      },
      create: {
        repositoryId,
        branch,
        ecosystem: parsed.ecosystem,
        manifestPath: parsed.manifestPath,
        dependencies: parsed.dependencies as any,
      },
      update: {
        dependencies: parsed.dependencies as any,
        analyzedAt: new Date(),
      },
    });

    const alerts: DependencyAnalysisResult["alerts"] = [];
    let securityAlertCount = 0;
    let unmaintainedCount = 0;
    let outdatedCount = 0;
    let deprecatedCount = 0;

    // Analyze each dependency (limit concurrent requests)
    const batchSize = 5;
    for (let i = 0; i < parsed.dependencies.length; i += batchSize) {
      const batch = parsed.dependencies.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (dep) => {
          try {
            // Get package info
            const info = await getPackageInfo(parsed.ecosystem, dep.name);
            if (!info) return;

            // Check for deprecation
            if (info.isDeprecated) {
              deprecatedCount++;
              alerts.push({
                packageName: dep.name,
                currentVersion: dep.version,
                alertType: "deprecated",
                severity: "high",
                title: `${dep.name} is deprecated`,
                description:
                  info.deprecationMessage ||
                  `This package has been marked as deprecated and should be replaced.`,
                recommendedVersion: undefined,
              });

              await createAlert(repositoryId, userId, parsed.ecosystem, {
                packageName: dep.name,
                currentVersion: dep.version,
                alertType: "deprecated",
                severity: "high",
                title: `${dep.name} is deprecated`,
                description:
                  info.deprecationMessage ||
                  `This package has been marked as deprecated.`,
              });
            }

            // Check for unmaintained packages
            if (info.lastPublishDate) {
              const days = daysSince(info.lastPublishDate);
              if (days > UNMAINTAINED_THRESHOLD_DAYS) {
                unmaintainedCount++;
                const years = Math.floor(days / 365);
                alerts.push({
                  packageName: dep.name,
                  currentVersion: dep.version,
                  alertType: "unmaintained",
                  severity: days > 1095 ? "high" : "moderate", // 3 years = high
                  title: `${dep.name} appears unmaintained`,
                  description: `Last published ${years}+ years ago. Consider finding an alternative.`,
                  recommendedVersion: undefined,
                });

                await createAlert(repositoryId, userId, parsed.ecosystem, {
                  packageName: dep.name,
                  currentVersion: dep.version,
                  alertType: "unmaintained",
                  severity: days > 1095 ? "high" : "moderate",
                  title: `${dep.name} appears unmaintained`,
                  description: `Last published ${years}+ years ago (${info.lastPublishDate.toISOString().slice(0, 10)}).`,
                  publishedAt: info.lastPublishDate,
                });
              }
            }

            // Check for major version updates
            const currentParsed = parseVersion(dep.version);
            const latestParsed = parseVersion(info.latestVersion);

            if (
              currentParsed &&
              latestParsed &&
              isVersionLessThan(dep.version, info.latestVersion)
            ) {
              if (isMajorVersionBump(dep.version, info.latestVersion)) {
                outdatedCount++;
                alerts.push({
                  packageName: dep.name,
                  currentVersion: dep.version,
                  alertType: "breaking_change",
                  severity: "moderate",
                  title: `Major update available for ${dep.name}`,
                  description: `Current: ${dep.version}, Latest: ${info.latestVersion}. This is a major version change that may contain breaking changes.`,
                  recommendedVersion: info.latestVersion,
                });

                await createAlert(repositoryId, userId, parsed.ecosystem, {
                  packageName: dep.name,
                  currentVersion: dep.version,
                  alertType: "breaking_change",
                  severity: "moderate",
                  title: `Major update available for ${dep.name}`,
                  description: `Version ${info.latestVersion} is available (you have ${dep.version}).`,
                  recommendedVersion: info.latestVersion,
                  upgradePath: await generateUpgradePath(
                    parsed.ecosystem,
                    dep.name,
                    dep.version,
                    info.latestVersion,
                    info.versions
                  ),
                });
              } else {
                // Minor/patch update - just log, don't create alert
                outdatedCount++;
              }
            }

            // Check for security advisories
            const advisories = await fetchGitHubAdvisories(parsed.ecosystem, dep.name);
            for (const advisory of advisories) {
              // Check if this advisory affects the current version
              if (isVersionAffected(dep.version, advisory.affectedVersions)) {
                securityAlertCount++;
                alerts.push({
                  packageName: dep.name,
                  currentVersion: dep.version,
                  alertType: "security",
                  severity: advisory.severity as DependencyAlertSeverity,
                  title: advisory.title,
                  description: advisory.description,
                  recommendedVersion: advisory.patchedVersion,
                });

                await createAlert(repositoryId, userId, parsed.ecosystem, {
                  packageName: dep.name,
                  currentVersion: dep.version,
                  alertType: "security",
                  severity: advisory.severity as DependencyAlertSeverity,
                  title: advisory.title,
                  description: advisory.description,
                  affectedVersions: advisory.affectedVersions,
                  patchedVersion: advisory.patchedVersion,
                  cveId: advisory.cveId,
                  cvssScore: advisory.cvssScore,
                  sourceUrl: advisory.sourceUrl,
                  publishedAt: advisory.publishedAt,
                });
              }
            }
          } catch (error) {
            console.error(`Error analyzing dependency ${dep.name}:`, error);
          }
        })
      );
    }

    results.push({
      repositoryId,
      ecosystem: parsed.ecosystem,
      totalDependencies: parsed.dependencies.length,
      securityAlerts: securityAlertCount,
      unmaintainedPackages: unmaintainedCount,
      outdatedPackages: outdatedCount,
      deprecatedPackages: deprecatedCount,
      alerts,
    });
  }

  return results;
}

/**
 * Create or update a dependency alert
 */
async function createAlert(
  repositoryId: string,
  userId: string,
  ecosystem: DependencyEcosystem,
  alert: {
    packageName: string;
    currentVersion: string;
    alertType: DependencyAlertType;
    severity: DependencyAlertSeverity;
    title: string;
    description: string;
    affectedVersions?: string;
    patchedVersion?: string;
    cveId?: string;
    cvssScore?: number;
    sourceUrl?: string;
    publishedAt?: Date;
    recommendedVersion?: string;
    upgradePath?: UpgradePath;
  }
): Promise<void> {
  await prisma.dependencyAlert.upsert({
    where: {
      repositoryId_ecosystem_packageName_alertType_currentVersion: {
        repositoryId,
        ecosystem,
        packageName: alert.packageName,
        alertType: alert.alertType,
        currentVersion: alert.currentVersion,
      },
    },
    create: {
      repositoryId,
      userId,
      ecosystem,
      packageName: alert.packageName,
      currentVersion: alert.currentVersion,
      alertType: alert.alertType,
      severity: alert.severity,
      status: "active",
      title: alert.title,
      description: alert.description,
      affectedVersions: alert.affectedVersions,
      patchedVersion: alert.patchedVersion,
      cveId: alert.cveId,
      cvssScore: alert.cvssScore,
      sourceUrl: alert.sourceUrl,
      publishedAt: alert.publishedAt,
      recommendedVersion: alert.recommendedVersion,
      upgradePath: alert.upgradePath as any,
    },
    update: {
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      affectedVersions: alert.affectedVersions,
      patchedVersion: alert.patchedVersion,
      cveId: alert.cveId,
      cvssScore: alert.cvssScore,
      sourceUrl: alert.sourceUrl,
      publishedAt: alert.publishedAt,
      recommendedVersion: alert.recommendedVersion,
      upgradePath: alert.upgradePath as any,
      lastCheckedAt: new Date(),
    },
  });
}

/**
 * Check if a version is affected by a vulnerability range
 */
function isVersionAffected(version: string, affectedRange: string): boolean {
  // Simple check - in production, use semver library
  if (affectedRange === "*") return true;

  const v = parseVersion(version);
  if (!v) return false;

  // Parse range like "<1.2.3" or ">=1.0.0, <2.0.0"
  const ranges = affectedRange.split(",").map((r) => r.trim());

  for (const range of ranges) {
    const ltMatch = range.match(/^<\s*v?(\d+(?:\.\d+)*)/);
    const lteMatch = range.match(/^<=\s*v?(\d+(?:\.\d+)*)/);
    const gtMatch = range.match(/^>\s*v?(\d+(?:\.\d+)*)/);
    const gteMatch = range.match(/^>=\s*v?(\d+(?:\.\d+)*)/);

    if (ltMatch && !isVersionLessThan(version, ltMatch[1])) return false;
    if (lteMatch && isVersionLessThan(lteMatch[1], version)) return false;
    if (gtMatch && !isVersionLessThan(gtMatch[1], version)) return false;
    if (gteMatch && isVersionLessThan(version, gteMatch[1])) return false;
  }

  return true;
}

/**
 * Generate upgrade path with intermediate versions for major bumps
 */
async function generateUpgradePath(
  ecosystem: DependencyEcosystem,
  packageName: string,
  fromVersion: string,
  toVersion: string,
  versions: { version: string; publishedAt: Date }[]
): Promise<UpgradePath> {
  const fromParsed = parseVersion(fromVersion);
  const toParsed = parseVersion(toVersion);

  if (!fromParsed || !toParsed) {
    return {
      from: fromVersion,
      to: toVersion,
      steps: [toVersion],
      breakingChanges: [],
    };
  }

  // Find intermediate major versions
  const steps: string[] = [];
  const majorVersions = new Set<number>();

  for (const v of versions) {
    const parsed = parseVersion(v.version);
    if (parsed && parsed.major > fromParsed.major && parsed.major <= toParsed.major) {
      majorVersions.add(parsed.major);
    }
  }

  // Get the first release of each major version as stepping stones
  for (const major of Array.from(majorVersions).sort((a, b) => a - b)) {
    const firstOfMajor = versions
      .filter((v) => {
        const p = parseVersion(v.version);
        return p && p.major === major;
      })
      .sort((a, b) => {
        const pa = parseVersion(a.version)!;
        const pb = parseVersion(b.version)!;
        if (pa.minor !== pb.minor) return pa.minor - pb.minor;
        return pa.patch - pb.patch;
      })[0];

    if (firstOfMajor) {
      steps.push(firstOfMajor.version);
    }
  }

  // Always end with the target version
  if (!steps.includes(toVersion)) {
    steps.push(toVersion);
  }

  return {
    from: fromVersion,
    to: toVersion,
    steps,
    breakingChanges: [
      `Review CHANGELOG for breaking changes between ${fromVersion} and ${toVersion}`,
    ],
    migrationGuide: `Consider upgrading in steps: ${[fromVersion, ...steps].join(" -> ")}`,
  };
}

/**
 * Get all active alerts for a repository
 */
export async function getRepositoryAlerts(
  repositoryId: string,
  options?: {
    status?: "active" | "dismissed" | "resolved";
    severity?: DependencyAlertSeverity;
    type?: DependencyAlertType;
    limit?: number;
  }
): Promise<any[]> {
  const where: any = { repositoryId };

  if (options?.status) {
    where.status = options.status;
  }
  if (options?.severity) {
    where.severity = options.severity;
  }
  if (options?.type) {
    where.alertType = options.type;
  }

  return prisma.dependencyAlert.findMany({
    where,
    orderBy: [
      { severity: "desc" },
      { createdAt: "desc" },
    ],
    take: options?.limit || 100,
  });
}

/**
 * Get alert summary for a user across all repositories
 */
export async function getUserAlertSummary(userId: string): Promise<{
  totalAlerts: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  byRepository: { repositoryId: string; name: string; count: number }[];
}> {
  const alerts = await prisma.dependencyAlert.findMany({
    where: { userId, status: "active" },
    include: {
      repository: {
        select: { id: true, fullName: true },
      },
    },
  });

  const bySeverity: Record<string, number> = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
  };

  const byType: Record<string, number> = {
    security: 0,
    breaking_change: 0,
    unmaintained: 0,
    deprecated: 0,
    license_change: 0,
    upgrade_available: 0,
  };

  const repoMap = new Map<string, { name: string; count: number }>();

  for (const alert of alerts) {
    bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
    byType[alert.alertType] = (byType[alert.alertType] || 0) + 1;

    const existing = repoMap.get(alert.repositoryId);
    if (existing) {
      existing.count++;
    } else {
      repoMap.set(alert.repositoryId, {
        name: alert.repository.fullName,
        count: 1,
      });
    }
  }

  return {
    totalAlerts: alerts.length,
    bySeverity,
    byType,
    byRepository: Array.from(repoMap.entries())
      .map(([repositoryId, data]) => ({
        repositoryId,
        name: data.name,
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Dismiss an alert
 */
export async function dismissAlert(
  alertId: string,
  userId: string,
  reason?: string
): Promise<void> {
  await prisma.dependencyAlert.update({
    where: { id: alertId },
    data: {
      status: "dismissed",
      dismissedAt: new Date(),
      dismissedReason: reason,
    },
  });
}

/**
 * Resolve an alert (e.g., after upgrading in a task)
 */
export async function resolveAlert(
  alertId: string,
  taskId?: string
): Promise<void> {
  await prisma.dependencyAlert.update({
    where: { id: alertId },
    data: {
      status: taskId ? "auto_resolved" : "resolved",
      resolvedAt: new Date(),
      resolvedTaskId: taskId,
    },
  });
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache(): Promise<number> {
  const result = await prisma.packageMetadataCache.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}

// Export the service
export const dependencyIntelligenceService = {
  parseManifest,
  analyzeDependencies,
  getRepositoryAlerts,
  getUserAlertSummary,
  dismissAlert,
  resolveAlert,
  cleanupExpiredCache,
  getPackageInfo,
};
