import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { SubagentState } from "../shared/types.ts";
import {
	SUBAGENT_ASYNC_COMPLETE_EVENT,
	SUBAGENT_ASYNC_STARTED_EVENT,
} from "../shared/types.ts";
import type { FileTracker } from "./file-tracker.ts";

export function buildContextBar(percent: number): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * 10);
	return "▓".repeat(filled) + "░".repeat(10 - filled);
}

function usageColor(percent: number): "success" | "warning" | "error" {
	if (percent <= 60) return "success";
	if (percent <= 80) return "warning";
	return "error";
}

export function activeSubagentCount(state: Pick<SubagentState, "foregroundControls" | "asyncJobs">): number {
	let foreground = 0;
	for (const control of state.foregroundControls.values()) foreground += Math.max(1, control.activeChildren ?? 1);

	let background = 0;
	for (const job of state.asyncJobs.values()) {
		if (job.status !== "queued" && job.status !== "running") continue;
		if (typeof job.runningSteps === "number" && job.runningSteps > 0) {
			background += job.runningSteps;
			continue;
		}
		if (job.status === "queued") {
			const queuedChildren = job.mode === "parallel" || job.activeParallelGroup
				? (job.stepsTotal ?? job.agents?.length ?? 1)
				: 1;
			background += Math.max(1, queuedChildren);
			continue;
		}
		background += job.mode === "chain" && !job.activeParallelGroup
			? 1
			: Math.max(1, job.agents?.length ?? 1);
	}
	return foreground + background;
}

function readBranch(cwd: string): string {
	try {
		return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "";
	}
}

export function truncateFooterLine(line: string, width: number): string {
	return truncateToWidth(line, Math.max(0, width), "");
}

function sanitizeStatusText(text: string): string {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

export function composeExtensionStatuses(statuses: ReadonlyMap<string, string>): string {
	if (statuses.size === 0) return "";
	return Array.from(statuses.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, text]) => sanitizeStatusText(text))
		.filter((text) => text.length > 0)
		.join(" ");
}

export interface CockpitFooterRenderInfo {
	model: { provider: string; name?: string; id?: string } | null;
	branch: string;
	stats: { fileCount: number; insertions: number; deletions: number };
	contextUsage: { percent?: number | null } | null;
	subagents: number;
}

export function buildCockpitFooterParts(
	info: CockpitFooterRenderInfo,
	theme: { fg(color: string, text: string): string },
	footerData: { getExtensionStatuses(): ReadonlyMap<string, string> },
): string[] {
	const parts: string[] = [];

	if (info.model) {
		const friendlyName = info.model.name ?? info.model.id;
		parts.push(`${info.model.provider} · ${friendlyName}`);
	} else {
		parts.push("– · –");
	}

	parts.push(`⎇ ${info.branch || "–"}`);

	if (info.stats.fileCount > 0) {
		parts.push(
			`${info.stats.fileCount} files ${theme.fg("success", `+${info.stats.insertions}`)} ${theme.fg("error", `-${info.stats.deletions}`)}`,
		);
	} else {
		parts.push("0 files");
	}

	if (info.contextUsage) {
		const percent = info.contextUsage.percent ?? 0;
		parts.push(theme.fg(usageColor(percent), `${buildContextBar(percent)} ${percent.toFixed(1)}%`));
	}

	if (info.subagents > 0) parts.push(theme.fg("accent", `SUB ${info.subagents}`));

	const statusLine = composeExtensionStatuses(footerData.getExtensionStatuses());
	if (statusLine) parts.push(statusLine);

	return parts;
}

export function registerCockpitFooter(pi: ExtensionAPI, state: SubagentState, fileTracker: FileTracker): () => void {
	let tui: { requestRender(): void } | null = null;
	let currentModel: any = null;
	let currentCwd = process.cwd();
	let cachedBranch = readBranch(currentCwd);

	const requestRender = (): void => tui?.requestRender();
	const disposers = [
		fileTracker.onChange(requestRender),
		pi.events?.on(SUBAGENT_ASYNC_STARTED_EVENT, requestRender),
		pi.events?.on(SUBAGENT_ASYNC_COMPLETE_EVENT, requestRender),
	].filter((dispose): dispose is () => void => typeof dispose === "function");

	pi.on("session_start", (_event: any, ctx: any) => {
		currentModel = ctx.model;
		currentCwd = ctx.cwd;
		cachedBranch = readBranch(currentCwd);
		if (!ctx.hasUI) return;

		ctx.ui.setFooter((tuiInstance: any, theme: any, footerData: any) => {
			tui = tuiInstance;
			const branchDispose = footerData.onBranchChange(() => {
				cachedBranch = readBranch(currentCwd);
				requestRender();
			});

			return {
				render(width: number): string[] {
					const parts = buildCockpitFooterParts(
						{
							model: currentModel,
							branch: cachedBranch,
							stats: fileTracker.getStats(),
							contextUsage: ctx.getContextUsage(),
							subagents: activeSubagentCount(state),
						},
						theme,
						footerData,
					);
					return [truncateFooterLine(parts.join(" │ "), width)];
				},
				invalidate() {},
				dispose: branchDispose,
			};
		});
	});

	pi.on("model_select", (_event: any, ctx: any) => {
		if (!ctx.model) return;
		currentModel = ctx.model;
		requestRender();
	});

	pi.on("turn_end", requestRender);

	return () => {
		for (const dispose of disposers) dispose();
		tui = null;
	};
}
