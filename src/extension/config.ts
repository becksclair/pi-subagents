import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionConfig } from "../shared/types.ts";
import { getAgentDir } from "../shared/utils.ts";

const RUNTIME_CONFIG_KEYS = [
	"asyncByDefault",
	"forceTopLevelAsync",
	"defaultSessionDir",
	"maxSubagentDepth",
	"control",
	"parallel",
	"chain",
	"worktreeSetupHook",
	"worktreeSetupHookTimeoutMs",
	"intercomBridge",
	"childTimeoutMs",
] as const satisfies readonly (keyof ExtensionConfig)[];

function readJsonObject(filePath: string): Record<string, unknown> | undefined {
	if (!fs.existsSync(filePath)) return undefined;
	const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`Expected a JSON object in '${filePath}'.`);
	}
	return parsed as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeControl(value: unknown): ExtensionConfig["control"] {
	if (!isRecord(value)) return undefined;
	const result: Record<string, unknown> = {};
	if (typeof value.enabled === "boolean") result.enabled = value.enabled;
	for (const key of ["needsAttentionAfterMs", "activeNoticeAfterMs", "activeNoticeAfterTurns", "activeNoticeAfterTokens", "failedToolAttemptsBeforeAttention"] as const) {
		const parsed = positiveInteger(value[key]);
		if (parsed !== undefined) result[key] = parsed;
	}
	if (Array.isArray(value.notifyOn) && value.notifyOn.every((entry) => typeof entry === "string")) result.notifyOn = [...value.notifyOn];
	if (Array.isArray(value.notifyChannels) && value.notifyChannels.every((entry) => typeof entry === "string")) result.notifyChannels = [...value.notifyChannels];
	return result as ExtensionConfig["control"];
}

function normalizeParallel(value: unknown): ExtensionConfig["parallel"] {
	if (!isRecord(value)) return undefined;
	const result: { maxTasks?: number; concurrency?: number } = {};
	const maxTasks = positiveInteger(value.maxTasks);
	const concurrency = positiveInteger(value.concurrency);
	if (maxTasks !== undefined) result.maxTasks = maxTasks;
	if (concurrency !== undefined) result.concurrency = concurrency;
	return result;
}

function normalizeChain(value: unknown): ExtensionConfig["chain"] {
	if (!isRecord(value)) return undefined;
	const dynamicFanout = isRecord(value.dynamicFanout) ? value.dynamicFanout : undefined;
	const maxItems = positiveInteger(dynamicFanout?.maxItems);
	return maxItems !== undefined ? { dynamicFanout: { maxItems } } : {};
}

function normalizeIntercomBridge(value: unknown): ExtensionConfig["intercomBridge"] {
	if (!isRecord(value)) return undefined;
	const result: { mode?: "off" | "always" | "fork-only"; instructionFile?: string } = {};
	if (value.mode === "off" || value.mode === "always" || value.mode === "fork-only") result.mode = value.mode;
	if (typeof value.instructionFile === "string") result.instructionFile = value.instructionFile;
	return result;
}

function pickRuntimeConfig(value: unknown): ExtensionConfig {
	if (!isRecord(value)) return {};
	const config: ExtensionConfig = {};
	for (const key of RUNTIME_CONFIG_KEYS) {
		if (!Object.hasOwn(value, key)) continue;
		const raw = value[key];
		switch (key) {
			case "asyncByDefault":
			case "forceTopLevelAsync":
				if (typeof raw === "boolean") config[key] = raw;
				break;
			case "defaultSessionDir":
			case "worktreeSetupHook":
				if (typeof raw === "string" && raw.trim()) config[key] = raw;
				break;
			case "maxSubagentDepth":
				if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) config.maxSubagentDepth = raw;
				break;
			case "worktreeSetupHookTimeoutMs":
			case "childTimeoutMs": {
				const parsed = nonNegativeNumber(raw);
				if (parsed !== undefined) config[key] = parsed;
				break;
			}
			case "control": {
				const parsed = normalizeControl(raw);
				if (parsed) config.control = parsed;
				break;
			}
			case "parallel": {
				const parsed = normalizeParallel(raw);
				if (parsed) config.parallel = parsed;
				break;
			}
			case "chain": {
				const parsed = normalizeChain(raw);
				if (parsed) config.chain = parsed;
				break;
			}
			case "intercomBridge": {
				const parsed = normalizeIntercomBridge(raw);
				if (parsed) config.intercomBridge = parsed;
				break;
			}
		}
	}
	return config;
}

/**
 * Read runtime configuration without mutating Pi state.
 *
 * Canonical location:
 *   ~/.pi/agent/settings.json -> subagents.runtime
 *
 * The old extension-local config remains a read-only fallback so existing
 * installations keep their settings while migrating away from
 * ~/.pi/agent/extensions/subagent/config.json. Canonical settings win on key
 * conflicts. No project-local config is created or modified here.
 */
export function loadConfig(): ExtensionConfig {
	const agentDir = getAgentDir();
	const legacyConfigPath = path.join(agentDir, "extensions", "subagent", "config.json");
	const settingsPath = path.join(agentDir, "settings.json");
	let legacy: ExtensionConfig = {};
	let canonical: ExtensionConfig = {};

	try {
		legacy = pickRuntimeConfig(readJsonObject(legacyConfigPath));
	} catch (error) {
		console.error(`Failed to load legacy subagent config from '${legacyConfigPath}':`, error);
	}

	try {
		const settings = readJsonObject(settingsPath);
		const subagents = settings?.subagents;
		if (subagents && typeof subagents === "object" && !Array.isArray(subagents)) {
			canonical = pickRuntimeConfig((subagents as Record<string, unknown>).runtime);
		}
	} catch (error) {
		console.error(`Failed to load subagent runtime settings from '${settingsPath}':`, error);
	}

	return { ...legacy, ...canonical };
}
