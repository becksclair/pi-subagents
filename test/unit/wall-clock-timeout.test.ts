import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import {
	WALL_CLOCK_TIMEOUT_EXIT_CODE,
	armWallClockTimeout,
	wallClockTimeoutMessage,
} from "../../src/shared/wall-clock-timeout.ts";

function waitForClose(child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	return new Promise((resolve) => {
		child.on("close", (code, signal) => resolve({ code, signal }));
	});
}

describe("armWallClockTimeout", () => {
	it("kills a hung child after the timeout and reports timedOut", async () => {
		const child = spawn("sleep", ["30"], { stdio: "ignore" });
		let onTimeoutCalled = false;
		const start = Date.now();
		const handle = armWallClockTimeout(child, 200, {
			isCancelled: () => false,
			onTimeout: () => {
				onTimeoutCalled = true;
			},
		});

		const closed = await waitForClose(child);
		const elapsed = Date.now() - start;
		handle.clear();

		assert.equal(handle.timedOut(), true);
		assert.equal(onTimeoutCalled, true);
		assert.equal(closed.signal, "SIGTERM");
		assert.ok(elapsed < 5000, `child should die promptly, took ${elapsed}ms`);
	});

	it("does not fire for a child that exits in time", async () => {
		const child = spawn("true", [], { stdio: "ignore" });
		const handle = armWallClockTimeout(child, 5000, {
			isCancelled: () => false,
			onTimeout: () => {
				assert.fail("timeout must not fire for a fast child");
			},
		});

		await waitForClose(child);
		handle.clear();
		assert.equal(handle.timedOut(), false);
	});

	it("clear() disarms the timer", async () => {
		const child = spawn("sleep", ["1"], { stdio: "ignore" });
		const handle = armWallClockTimeout(child, 100, {
			isCancelled: () => false,
			onTimeout: () => {
				assert.fail("cleared timeout must not fire");
			},
		});
		handle.clear();
		await new Promise((resolve) => setTimeout(resolve, 250));
		assert.equal(handle.timedOut(), false);
		child.kill("SIGKILL");
		await waitForClose(child);
	});

	it("is a no-op when timeout is unset or non-positive", async () => {
		const child = spawn("true", [], { stdio: "ignore" });
		const none = armWallClockTimeout(child, undefined, { isCancelled: () => false, onTimeout: () => {} });
		const zero = armWallClockTimeout(child, 0, { isCancelled: () => false, onTimeout: () => {} });
		assert.equal(none.timedOut(), false);
		assert.equal(zero.timedOut(), false);
		none.clear();
		zero.clear();
		await waitForClose(child);
	});

	it("respects isCancelled at expiry", async () => {
		const child = spawn("sleep", ["1"], { stdio: "ignore" });
		let cancelled = false;
		const handle = armWallClockTimeout(child, 100, {
			isCancelled: () => cancelled,
			onTimeout: () => {
				assert.fail("cancelled run must not time out");
			},
		});
		cancelled = true;
		await new Promise((resolve) => setTimeout(resolve, 250));
		assert.equal(handle.timedOut(), false);
		handle.clear();
		child.kill("SIGKILL");
		await waitForClose(child);
	});

	it("exports the conventional exit code and a descriptive message", () => {
		assert.equal(WALL_CLOCK_TIMEOUT_EXIT_CODE, 124);
		assert.match(wallClockTimeoutMessage(5000), /5000ms/);
		assert.match(wallClockTimeoutMessage(5000), /killed/i);
	});
});
