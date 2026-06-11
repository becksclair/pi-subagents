import type { ChildProcess } from "node:child_process";
import { trySignalChild } from "./post-exit-stdio-guard.ts";

/** Conventional shell exit code for a killed-by-timeout process. */
export const WALL_CLOCK_TIMEOUT_EXIT_CODE = 124;

export function wallClockTimeoutMessage(timeoutMs: number): string {
	return `Subagent exceeded its wall-clock timeout of ${timeoutMs}ms and was killed. Treat this child as failed; respawn it or continue without its report.`;
}

export interface WallClockTimeoutHandle {
	/** True once the timeout fired (the child was signalled). */
	timedOut: () => boolean;
	/** Cancel the timers. Safe to call multiple times. */
	clear: () => void;
}

const NOOP_HANDLE: WallClockTimeoutHandle = { timedOut: () => false, clear: () => {} };

/**
 * Arm a wall-clock timeout for a spawned child. On expiry the child gets
 * SIGTERM, then SIGKILL after `hardKillMs`. The caller observes expiry via
 * `timedOut()` (typically in its close handler) and reports the child as
 * failed with WALL_CLOCK_TIMEOUT_EXIT_CODE.
 *
 * A missing/zero/negative timeout disables the guard entirely.
 */
export function armWallClockTimeout(
	child: ChildProcess,
	timeoutMs: number | undefined,
	opts: {
		hardKillMs?: number;
		/** Return true when the run already settled/detached; expiry becomes a no-op. */
		isCancelled: () => boolean;
		/** Record the timeout on the result (set error text, flags) before signalling. */
		onTimeout: () => void;
	},
): WallClockTimeoutHandle {
	if (!timeoutMs || timeoutMs <= 0) {
		return NOOP_HANDLE;
	}

	let timedOut = false;
	let killTimer: NodeJS.Timeout | undefined;
	const timer = setTimeout(() => {
		if (opts.isCancelled()) return;
		timedOut = true;
		opts.onTimeout();
		trySignalChild(child, "SIGTERM");
		killTimer = setTimeout(() => {
			if (opts.isCancelled()) return;
			trySignalChild(child, "SIGKILL");
		}, opts.hardKillMs ?? 3000);
		killTimer.unref?.();
	}, timeoutMs);
	timer.unref?.();

	return {
		timedOut: () => timedOut,
		clear: () => {
			clearTimeout(timer);
			if (killTimer) {
				clearTimeout(killTimer);
				killTimer = undefined;
			}
		},
	};
}
