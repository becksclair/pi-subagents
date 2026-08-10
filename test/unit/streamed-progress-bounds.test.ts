import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";
import {
	boundStreamedRecentOutput,
	boundStreamedRecentTools,
	boundStreamedToolCalls,
	MAX_STREAMED_OUTPUT_LINE_CHARS,
	MAX_STREAMED_RECENT_TOOLS,
	MAX_STREAMED_TOOL_CALLS,
} from "../../src/shared/utils.ts";

describe("streamed progress snapshot bounds", () => {
	it("keeps only the most recent tool-history entries and clones them", () => {
		const recentTools = Array.from({ length: MAX_STREAMED_RECENT_TOOLS + 40 }, (_, i) => ({
			tool: "read",
			args: `file-${i}.ts`,
			endMs: i,
		}));
		const bounded = boundStreamedRecentTools(recentTools);
		assert.equal(bounded.length, MAX_STREAMED_RECENT_TOOLS);
		assert.equal(bounded.at(-1)?.endMs, recentTools.at(-1)?.endMs);
		assert.equal(bounded[0]?.endMs, recentTools.at(-MAX_STREAMED_RECENT_TOOLS)?.endMs);
		bounded[0]!.args = "mutated";
		assert.notEqual(recentTools.at(-MAX_STREAMED_RECENT_TOOLS)?.args, "mutated");
	});

	it("truncates long recent-output lines but leaves short lines intact", () => {
		const shortLine = "ok";
		const longLine = "x".repeat(MAX_STREAMED_OUTPUT_LINE_CHARS + 5000);
		const bounded = boundStreamedRecentOutput([shortLine, longLine]);
		assert.equal(bounded[0], shortLine);
		assert.ok(bounded[1]!.length < longLine.length);
		assert.ok(bounded[1]!.startsWith("x".repeat(MAX_STREAMED_OUTPUT_LINE_CHARS)));
		assert.match(bounded[1]!, /\[truncated\]$/);
	});

	it("caps existing tool-call summaries and can derive them from messages", () => {
		const toolCalls = Array.from({ length: MAX_STREAMED_TOOL_CALLS + 20 }, (_, i) => ({
			text: `read(${i})`,
			expandedText: `read(file-${i}.ts)`,
		}));
		const bounded = boundStreamedToolCalls({ toolCalls, messages: undefined });
		assert.equal(bounded?.length, MAX_STREAMED_TOOL_CALLS);
		assert.equal(bounded?.at(-1)?.text, toolCalls.at(-1)?.text);

		const derived = boundStreamedToolCalls({
			toolCalls: undefined,
			messages: [
				{ role: "assistant", content: [{ type: "toolCall", name: "read", arguments: { path: "a.ts" } }] },
				{ role: "assistant", content: [{ type: "toolCall", name: "grep", arguments: { pattern: "foo" } }] },
			] as never,
		});
		assert.equal(derived?.length, 2);
		assert.match(derived![0]!.text, /read/);
		assert.match(derived![1]!.text, /grep/);
	});

	it("bounds a pathological running snapshot well below the child protocol cap", () => {
		const recentTools = Array.from({ length: 5000 }, (_, i) => ({
			tool: "read",
			args: `services/pkg/file-${i}.ts`,
			endMs: i,
		}));
		const recentOutput = Array.from({ length: 50 }, () => "y".repeat(60_000));
		const snapshot = {
			recentTools: boundStreamedRecentTools(recentTools),
			recentOutput: boundStreamedRecentOutput(recentOutput),
		};
		const bytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
		assert.ok(bytes < 256 * 1024, `bounded snapshot should be small, was ${bytes} bytes`);
	});
});
