import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { activeSubagentCount, buildCockpitFooterParts, buildContextBar, composeExtensionStatuses, truncateFooterLine } from "../../src/ui/footer.ts";
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

test("composeExtensionStatuses sorts by key, sanitizes, and drops empties", () => {
	const statuses = new Map<string, string>([
		["token-speed", "⚡ TPS: 42.3 tok/s\u200b"],
		["notes", "line 1\nline 2\twith\ttabs"],
		["blank", "   "],
	]);
	assert.equal(
		composeExtensionStatuses(statuses),
		"line 1 line 2 with tabs ⚡ TPS: 42.3 tok/s\u200b",
	);
	assert.equal(composeExtensionStatuses(new Map()), "");
});

test("composed cockpit footer truncates a pi-token-speed payload with ANSI closed at the cut", () => {
	const payload = `${"\u001b[2m⚡ TPS:\u001b[0m"} ${"\u001b[38;2;255;165;0m"}42.3 tok/s\u001b[0m\u200b`;
	const line = [
		"openai-codex · GPT-5.6 Luna",
		"3 files +84 -12",
		composeExtensionStatuses(new Map([["tokenSpeed", payload]])),
	].join(" │ ");

	const truncated = truncateFooterLine(line, 60);

	assert.ok(visibleWidth(truncated) <= 60);
	assert.doesNotMatch(truncated, /\u001b\[[0-9;]*$/);
	assert.match(truncated, /\u001b\[38;2;/);
	assert.ok(truncated.includes("42"));
	const ansiCodes = truncated.match(/\u001b\[[0-9;]*m/g) ?? [];
	assert.match(ansiCodes[ansiCodes.length - 1]!, /\u001b\[0m$/);
});

test("cockpit footer parts re-read the extension-status channel every frame", () => {
	const theme = { fg: (_color: string, text: string) => text };
	const statuses = new Map<string, string>();
	const footerData = { getExtensionStatuses: () => statuses };
	const info = {
		model: null,
		branch: "",
		stats: { fileCount: 0, insertions: 0, deletions: 0 },
		contextUsage: null,
		subagents: 0,
	};

	assert.equal(buildCockpitFooterParts(info, theme, footerData).join(" │ "), "– · – │ ⎇ – │ 0 files");

	statuses.set("tokenSpeed", `${"\u001b[2m⚡ TPS:\u001b[0m"} --\u200b`);
	assert.equal(
		buildCockpitFooterParts(info, theme, footerData).join(" │ "),
		`– · – │ ⎇ – │ 0 files │ ${"\u001b[2m⚡ TPS:\u001b[0m"} --\u200b`,
	);

	statuses.set("tokenSpeed", `${"\u001b[2m⚡ TPS:\u001b[0m"} ${"\u001b[38;2;255;165;0m"}42.3 tok/s\u001b[0m\u200b`);
	const updated = buildCockpitFooterParts(info, theme, footerData).join(" │ ");
	assert.ok(updated.includes("42.3 tok/s"));
	assert.match(updated, /\u001b\[38;2;255;165;0m/);
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
