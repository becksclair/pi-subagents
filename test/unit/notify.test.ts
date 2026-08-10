import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import registerSubagentNotify from "../../src/runs/background/notify.ts";
import { SUBAGENT_ASYNC_COMPLETE_EVENT } from "../../src/shared/types.ts";

function createPi() {
	const events = new EventEmitter();
	const sent: Array<{ message: unknown; options: unknown }> = [];
	const pi = {
		events,
		sendMessage(message: unknown, options: unknown) {
			sent.push({ message, options });
		},
	};

	registerSubagentNotify(pi as never, { currentSessionId: "session-1" });

	return { events, sent };
}

describe("registerSubagentNotify", () => {
	it("uses a fallback summary when a background completion is empty", () => {
		const { events, sent } = createPi();

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-empty-1",
			sessionId: "session-1",
			agent: "worker",
			success: true,
			summary: "",
			exitCode: 0,
			timestamp: 123,
		});

		assert.equal(sent.length, 1);
		assert.deepEqual(sent[0], {
			message: {
				customType: "subagent-notify",
				content: "Background task completed: **worker**\n\n(no output)",
				display: true,
			},
			options: { triggerTurn: true },
		});
	});

	it("preserves non-empty completion summaries", () => {
		const { events, sent } = createPi();
		const summary = "  Done streaming\nAll clear  ";

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-summary-1",
			sessionId: "session-1",
			agent: "worker",
			success: true,
			summary,
			exitCode: 0,
			timestamp: 456,
			taskIndex: 1,
			totalTasks: 3,
		});

		assert.equal(sent.length, 1);
		assert.deepEqual(sent[0], {
			message: {
				customType: "subagent-notify",
				content: `Background task completed: **worker** (2/3)\n\n${summary}`,
				display: true,
			},
			options: { triggerTurn: true },
		});
	});

	it("preserves session paths in notification content", () => {
		const { events, sent } = createPi();

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-path-1",
			sessionId: "session-1",
			agent: "worker",
			success: true,
			summary: "Done",
			exitCode: 0,
			timestamp: 456,
			sessionFile: "/tmp/session.jsonl",
		});

		assert.deepEqual(sent, [{
			message: {
				customType: "subagent-notify",
				content: "Background task completed: **worker**\n\nDone\n\nSession file: /tmp/session.jsonl",
				display: true,
			},
			options: { triggerTurn: true },
		}]);
	});

	it("labels paused completions as paused even without an exit code", () => {
		const { events, sent } = createPi();

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-paused-1",
			sessionId: "session-1",
			agent: "worker",
			success: false,
			state: "paused",
			summary: "Paused after interrupt. Waiting for explicit next action.",
			timestamp: 789,
		});

		assert.equal(sent.length, 1);
		assert.deepEqual(sent[0], {
			message: {
				customType: "subagent-notify",
				content: "Background task paused: **worker**\n\nPaused after interrupt. Waiting for explicit next action.",
				display: true,
			},
			options: { triggerTurn: true },
		});
	});

	it("retries the same completion after synchronous sendMessage failure", () => {
		const events = new EventEmitter();
		let attempts = 0;
		const sent: unknown[] = [];
		const pi = {
			events,
			sendMessage(message: unknown) {
				attempts += 1;
				if (attempts === 1) throw new Error("stale extension context");
				sent.push(message);
			},
		};
		registerSubagentNotify(pi as never, { currentSessionId: "session-retry" });
		const completion = {
			id: "notify-retry-after-send-failure",
			sessionId: "session-retry",
			agent: "worker",
			success: true,
			summary: "eventually delivered",
			timestamp: 1001,
		};

		assert.throws(() => events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completion), /stale extension context/);
		assert.equal(sent.length, 0);
		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completion);
		assert.equal(attempts, 2);
		assert.equal(sent.length, 1);
	});

	it("ignores completions owned by another Pi session", () => {
		const { events, sent } = createPi();

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-foreign-1",
			sessionId: "session-2",
			agent: "worker",
			success: true,
			summary: "belongs elsewhere",
			timestamp: 999,
		});
		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-legacy-sessionless",
			agent: "worker",
			success: true,
			summary: "legacy sessionless result",
			timestamp: 1000,
		});

		assert.deepEqual(sent, []);
	});
});
