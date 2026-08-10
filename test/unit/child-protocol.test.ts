import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createBoundedByteTail,
	createBoundedLineReader,
	formatProtocolOutputLimit,
} from "../../src/runs/shared/child-protocol.ts";

describe("child protocol bounds", () => {
	it("reassembles lines split across chunks", () => {
		const lines: string[] = [];
		const limits: unknown[] = [];
		const reader = createBoundedLineReader({
			maxPendingLineBytes: 64,
			onLine: (line) => lines.push(line),
			onLimit: (limit) => limits.push(limit),
		});

		reader.push(Buffer.from("one\ntw"));
		reader.push(Buffer.from("o\nthree"));
		reader.end();

		assert.deepEqual(lines, ["one", "two", "three"]);
		assert.deepEqual(limits, []);
		assert.equal(reader.exceeded(), false);
	});

	it("fails a newline-less line once it crosses the byte ceiling", () => {
		const lines: string[] = [];
		const limits: Array<{ code: string; stream: string; limitBytes: number; observedBytes: number }> = [];
		const reader = createBoundedLineReader({
			stream: "stdout",
			maxPendingLineBytes: 8,
			onLine: (line) => lines.push(line),
			onLimit: (limit) => limits.push(limit),
		});

		reader.push(Buffer.from("12345"));
		reader.push(Buffer.from("6789"));
		reader.push(Buffer.from("ignored\n"));
		reader.end();

		assert.deepEqual(lines, []);
		assert.equal(reader.exceeded(), true);
		assert.deepEqual(limits, [{
			code: "protocol_output_limit",
			stream: "stdout",
			limitBytes: 8,
			observedBytes: 9,
		}]);
		assert.match(formatProtocolOutputLimit(limits[0] as never), /protocol_output_limit.*8 bytes.*9 bytes/);
	});

	it("retains only the tail of stderr-like diagnostics", () => {
		const tail = createBoundedByteTail(6);
		tail.push("abc");
		tail.push("defgh");
		assert.equal(tail.text(), "cdefgh");
		tail.push("123456789");
		assert.equal(tail.text(), "456789");
	});
});
