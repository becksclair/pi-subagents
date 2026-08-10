import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { activeSubagentCount, buildContextBar, truncateFooterLine } from "../../src/ui/footer.ts";
import { parseDiffCounts } from "../../src/ui/file-tracker.ts";

test("buildContextBar clamps and renders ten cells", () => {
	assert.equal(buildContextBar(-5), "░░░░░░░░░░");
	assert.equal(buildContextBar(50), "▓▓▓▓▓░░░░░");
	assert.equal(buildContextBar(100), "▓▓▓▓▓▓▓▓▓▓");
	assert.equal(buildContextBar(150), "▓▓▓▓▓▓▓▓▓▓");
});

test("truncateFooterLine preserves ANSI integrity at narrow widths", () => {
	const line = "\u001b[32mopenai-codex\u001b[0m │ \u001b[35mSUB 2\u001b[0m";
	const truncated = truncateFooterLine(line, 14);
	assert.ok(visibleWidth(truncated) <= 14);
	assert.doesNotMatch(truncated, /\u001b\[[0-9;]*$/);
});

test("parseDiffCounts ignores diff headers", () => {
	assert.deepEqual(
		parseDiffCounts("--- a/file\n+++ b/file\n-old\n+new\n+extra\n context"),
		{ insertions: 2, deletions: 1 },
	);
});

test("activeSubagentCount counts active child agents, not orchestration jobs", () => {
	const foregroundControls = new Map([
		["fg-parallel", { activeChildren: 3 } as never],
		["fg-single", { activeChildren: 1 } as never],
	]);
	const asyncJobs = new Map([
		["queued-parallel", { status: "queued", mode: "parallel", agents: ["a", "b"] } as never],
		["queued-sequential-chain", { status: "queued", mode: "chain", agents: ["a", "b", "c", "d"] } as never],
		["running-parallel", { status: "running", runningSteps: 2, agents: ["a", "b", "c"] } as never],
		["running-single", { status: "running", agents: ["worker"] } as never],
		["complete", { status: "complete", runningSteps: 4 } as never],
		["failed", { status: "failed", agents: ["x", "y"] } as never],
	]);
	assert.equal(activeSubagentCount({ foregroundControls, asyncJobs }), 10);
});
