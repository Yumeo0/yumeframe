#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

type TauriConfig = {
	version?: string;
};

const tauriConfig = JSON.parse(
	readFileSync(
		new URL("../src-tauri/tauri.conf.json", import.meta.url),
		"utf8",
	),
) as TauriConfig;

const version = tauriConfig.version;
if (!version) {
	console.error("Missing version in src-tauri/tauri.conf.json");
	process.exit(1);
}

const prefix = process.env.RELEASE_TAG_PREFIX || "app-v";
const remote = process.env.RELEASE_REMOTE || "origin";
const tag = `${prefix}${version}`;

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

console.log(`Creating tag ${tag} from ${branch}...`);
runGit(["tag", "-a", tag, "-m", `Release ${tag}`]);
console.log(`Pushing ${tag} to ${remote}...`);
runGit(["push", remote, tag]);
console.log(`Done. Pushed ${tag}. This should trigger the publish workflow.`);
