import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface FileStats {
	insertions: number;
	deletions: number;
}

export interface TrackerStats {
	fileCount: number;
	insertions: number;
	deletions: number;
}

export interface FileTracker {
	getStats(): TrackerStats;
	onChange(listener: () => void): () => void;
	reset(): void;
}

export function parseDiffCounts(diff: string): { insertions: number; deletions: number } {
	let insertions = 0;
	let deletions = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+++") || line.startsWith("---")) continue;
		if (line.startsWith("+")) insertions += 1;
		else if (line.startsWith("-")) deletions += 1;
	}
	return { insertions, deletions };
}

export function registerFileTracker(pi: ExtensionAPI): FileTracker {
	const files = new Map<string, FileStats>();
	const listeners = new Set<() => void>();

	const notify = (): void => {
		for (const listener of listeners) listener();
	};

	const reset = (): void => {
		files.clear();
		notify();
	};

	pi.on("tool_result", (event: any) => {
		const toolName = event.toolName || "";
		const input = event.input || {};
		const details = event.details;

		if (toolName === "edit" && input.path && details?.diff) {
			const counts = parseDiffCounts(details.diff);
			const existing = files.get(input.path);
			if (existing) {
				existing.insertions += counts.insertions;
				existing.deletions += counts.deletions;
			} else {
				files.set(input.path, counts);
			}
			notify();
			return;
		}

		if (toolName === "write" && input.path && typeof input.content === "string") {
			const lineCount = input.content.split("\n").length;
			const existing = files.get(input.path);
			if (existing) existing.insertions += lineCount;
			else files.set(input.path, { insertions: lineCount, deletions: 0 });
			notify();
		}
	});

	pi.on("session_start", reset);

	return {
		getStats(): TrackerStats {
			let insertions = 0;
			let deletions = 0;
			for (const stats of files.values()) {
				insertions += stats.insertions;
				deletions += stats.deletions;
			}
			return { fileCount: files.size, insertions, deletions };
		},
		onChange(listener: () => void): () => void {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		reset,
	};
}
