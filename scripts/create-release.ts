#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

type TauriConfig = {
	version?: string;
};

type PackageJson = {
	version?: string;
};

type ReleaseType = "major" | "minor" | "patch";

const releaseTypeArg = process.argv[2];
if (
	releaseTypeArg !== "major" &&
	releaseTypeArg !== "minor" &&
	releaseTypeArg !== "patch"
) {
	console.error("Usage: bun run release <major|minor|patch>");
	process.exit(1);
}

const releaseType = releaseTypeArg as ReleaseType;

const packageJsonPath = new URL("../package.json", import.meta.url);
const tauriConfigPath = new URL(
	"../src-tauri/tauri.conf.json",
	import.meta.url,
);
const cargoTomlPath = new URL("../src-tauri/Cargo.toml", import.meta.url);

function parseSemver(version: string): [number, number, number] {
	const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!match) {
		console.error(`Version "${version}" is not a valid plain semver (x.y.z).`);
		process.exit(1);
	}

	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function bumpVersion(version: string, bumpType: ReleaseType): string {
	const [major, minor, patch] = parseSemver(version);

	if (bumpType === "major") {
		return `${major + 1}.0.0`;
	}

	if (bumpType === "minor") {
		return `${major}.${minor + 1}.0`;
	}

	return `${major}.${minor}.${patch + 1}`;
}

function compareSemver(left: string, right: string): number {
	const [lMajor, lMinor, lPatch] = parseSemver(left);
	const [rMajor, rMinor, rPatch] = parseSemver(right);

	if (lMajor !== rMajor) {
		return lMajor - rMajor;
	}

	if (lMinor !== rMinor) {
		return lMinor - rMinor;
	}

	return lPatch - rPatch;
}

const packageJson = JSON.parse(
	readFileSync(packageJsonPath, "utf8"),
) as PackageJson;

const tauriConfig = JSON.parse(
	readFileSync(tauriConfigPath, "utf8"),
) as TauriConfig;

const cargoToml = readFileSync(cargoTomlPath, "utf8");

const packageVersion = packageJson.version;
if (!packageVersion) {
	console.error("Missing version in package.json");
	process.exit(1);
}

const version = tauriConfig.version;
if (!version) {
	console.error("Missing version in src-tauri/tauri.conf.json");
	process.exit(1);
}

const cargoVersionMatch = cargoToml.match(
	/(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m,
);
if (!cargoVersionMatch) {
	console.error("Missing package.version in src-tauri/Cargo.toml");
	process.exit(1);
}

const cargoVersion = cargoVersionMatch[2];

const baseVersion = [packageVersion, version, cargoVersion].reduce(
	(currentHighest, candidate) =>
		compareSemver(candidate, currentHighest) > 0 ? candidate : currentHighest,
);

if (packageVersion !== version || version !== cargoVersion) {
	console.warn(
		"Version mismatch detected. Proceeding with the highest version as base and syncing all files.",
	);
	console.warn(
		`Found package.json=${packageVersion}, tauri.conf.json=${version}, Cargo.toml=${cargoVersion}; using base=${baseVersion}`,
	);
}

const nextVersion = bumpVersion(baseVersion, releaseType);

const prefix = process.env.RELEASE_TAG_PREFIX || "v";
const remote = process.env.RELEASE_REMOTE || "origin";
const tag = `${prefix}${nextVersion}`;

function runGit(args: string[], capture = false): string {
	const result = spawnSync("git", args, {
		stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
		encoding: "utf8",
	});

	if (result.status !== 0) {
		if (capture && result.stderr) {
			process.stderr.write(result.stderr);
		}
		process.exit(result.status ?? 1);
	}

	return result.stdout?.trim() ?? "";
}

const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], true);
if (branch !== "main") {
	console.error(
		`Refusing to create release tag from branch "${branch}". Switch to "main" first.`,
	);
	process.exit(1);
}

const hasUncommitted = spawnSync("git", ["diff", "--quiet"]).status !== 0;
const hasStaged =
	spawnSync("git", ["diff", "--cached", "--quiet"]).status !== 0;
if (hasUncommitted || hasStaged) {
	console.error("Refusing to create release tag with uncommitted changes.");
	process.exit(1);
}

const tagExists =
	spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`])
		.status === 0;
if (tagExists) {
	console.error(`Tag "${tag}" already exists locally.`);
	process.exit(1);
}

packageJson.version = nextVersion;
tauriConfig.version = nextVersion;

const nextCargoToml = cargoToml.replace(
	/(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m,
	`$1${nextVersion}$3`,
);

writeFileSync(
	packageJsonPath,
	`${JSON.stringify(packageJson, null, 2)}\n`,
	"utf8",
);
writeFileSync(
	tauriConfigPath,
	`${JSON.stringify(tauriConfig, null, 2)}\n`,
	"utf8",
);
writeFileSync(cargoTomlPath, nextCargoToml, "utf8");

console.log(`Bumped version: ${baseVersion} -> ${nextVersion}`);
runGit([
	"add",
	"package.json",
	"src-tauri/tauri.conf.json",
	"src-tauri/Cargo.toml",
]);
runGit(["commit", "-m", `release: ${tag}`]);

console.log(`Creating tag ${tag} from ${branch}...`);
runGit(["tag", "-a", tag, "-m", `Release ${tag}`]);

console.log(`Pushing commit to ${remote}/${branch}...`);
runGit(["push", remote, branch]);

console.log(`Pushing ${tag} to ${remote}...`);
runGit(["push", remote, tag]);

console.log(
	`Done. Released ${tag} with commit message "release: ${tag}" and pushed commit + tag.`,
);
