import { AuthStorage } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { isAbsolute, relative, resolve, sep } from "node:path";
import * as os from "node:os";

const OPENAI_CODEX_PROVIDER = "openai-codex";
const GITHUB_COPILOT_PROVIDER = "github-copilot";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const USER_INFO_API_VERSION = "2026-06-01";
const REFRESH_RENDER_INTERVAL_MS = 60_000;
const COPILOT_HEADERS = {
	"User-Agent": "GitHubCopilotChat/0.35.0",
	"Editor-Version": "vscode/1.107.0",
	"Editor-Plugin-Version": "copilot-chat/0.35.0",
	"Copilot-Integration-Id": "vscode-chat",
};

function sanitizeStatusText(text) {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function formatTokens(count) {
	if (count < 1_000) return String(count);
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

function formatCwdForFooter(cwd) {
	const home = process.env.HOME || process.env.USERPROFILE;
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function getContextDisplay(ctx, theme, currentModel) {
	const usage = ctx.getContextUsage();
	const contextWindow = usage?.contextWindow ?? currentModel?.contextWindow ?? 0;
	const percentValue = usage?.percent ?? 0;
	const percent = usage?.percent !== null && usage?.percent !== undefined ? usage.percent.toFixed(1) : "?";
	const display = percent === "?" ? `?/${formatTokens(contextWindow)}` : `${percent}%/${formatTokens(contextWindow)}`;

	if (percentValue > 90) return theme.fg("error", display);
	if (percentValue > 70) return theme.fg("warning", display);
	return display;
}

function getUsageStats(sessionManager) {
	let totalInput = 0;
	let totalOutput = 0;
	let totalCacheRead = 0;
	let totalCacheWrite = 0;
	let totalCost = 0;
	let latestCacheHitRate;

	for (const entry of sessionManager.getEntries()) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const usage = entry.message.usage;
		if (!usage) continue;

		totalInput += usage.input || 0;
		totalOutput += usage.output || 0;
		totalCacheRead += usage.cacheRead || 0;
		totalCacheWrite += usage.cacheWrite || 0;
		totalCost += usage.cost?.total || 0;

		const latestPromptTokens = (usage.input || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0);
		latestCacheHitRate = latestPromptTokens > 0 ? ((usage.cacheRead || 0) / latestPromptTokens) * 100 : undefined;
	}

	return {
		totalInput,
		totalOutput,
		totalCacheRead,
		totalCacheWrite,
		totalCost,
		latestCacheHitRate,
	};
}

function getThinkingLevel(sessionManager) {
	let thinkingLevel = "off";
	for (const entry of sessionManager.getBranch()) {
		if (entry.type === "thinking_level_change") {
			thinkingLevel = entry.thinkingLevel || "off";
		}
	}
	return thinkingLevel;
}

function isActiveCodexSubscriptionModel(currentModel, modelRegistry) {
	if (!currentModel || currentModel.provider !== OPENAI_CODEX_PROVIDER) return false;
	return modelRegistry ? modelRegistry.isUsingOAuth(currentModel) : true;
}

function isActiveCopilotSubscriptionModel(currentModel, modelRegistry) {
	if (!currentModel || currentModel.provider !== GITHUB_COPILOT_PROVIDER) return false;
	return modelRegistry ? modelRegistry.isUsingOAuth(currentModel) : true;
}

function getWindowColor(theme, label, usedPercent) {
	if (label === "5h") {
		if (usedPercent > 75) return "error";
		if (usedPercent >= 50) return "warning";
		return "success";
	}

	if (usedPercent > 90) return "error";
	if (usedPercent >= 75) return "warning";
	return "success";
}

function formatPercent(usedPercent) {
	return Number.isInteger(usedPercent) ? `${usedPercent}%` : `${usedPercent.toFixed(1)}%`;
}

function formatResetTime(resetAtMs) {
	const date = new Date(resetAtMs);
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatRemainingTime(resetAtMs) {
	const remainingMs = Math.max(0, resetAtMs - Date.now());
	const totalMinutes = Math.ceil(remainingMs / 60_000);
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
	const minutes = totalMinutes % 60;

	if (days > 0) return `${days}d${hours}h`;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function colorQuotaLabel(theme, color, text) {
	if (color === "success") {
		return `\x1b[32;1m${text}\x1b[0m`;
	}
	return theme.fg(color, text);
}

function normalizeServerUrl(value) {
	if (typeof value !== "string" || !value.trim()) return undefined;
	const withProtocol = value.includes("://") ? value.trim() : `https://${value.trim()}`;
	return withProtocol.replace(/\/+$/, "");
}

function getApiUrl(serverUrl) {
	if (serverUrl === "https://github.com") return "https://api.github.com";
	return serverUrl.includes("://api.") ? serverUrl : serverUrl.replace("://", "://api.");
}

function getPreviousMonthlyResetDate(nextResetDate) {
	return new Date(
		nextResetDate.getFullYear(),
		nextResetDate.getMonth() - 1,
		nextResetDate.getDate(),
		nextResetDate.getHours(),
		nextResetDate.getMinutes(),
		nextResetDate.getSeconds(),
		nextResetDate.getMilliseconds(),
	);
}

function clampPercent(value) {
	return Math.max(0, Math.min(100, value));
}

function getRemainingColor(percentRemaining) {
	if (percentRemaining <= 10) return "error";
	if (percentRemaining <= 25) return "warning";
	return "success";
}

function getCopilotGoalPercent(quotaResetDate) {
	if (!quotaResetDate) return undefined;
	const nextResetDate = new Date(quotaResetDate);
	if (Number.isNaN(nextResetDate.getTime())) return undefined;

	const previousResetDate = getPreviousMonthlyResetDate(nextResetDate);
	const now = Date.now();
	const totalMs = nextResetDate.getTime() - previousResetDate.getTime();
	if (totalMs <= 0) return undefined;
	const elapsedMs = now - previousResetDate.getTime();
	return clampPercent((elapsedMs / totalMs) * 100);
}

function renderQuota(theme, quotaState) {
	if (!quotaState?.primaryWindow || !quotaState?.secondaryWindow) return "";

	const primaryColor = getWindowColor(theme, "5h", quotaState.primaryWindow.usedPercent);
	const secondaryColor = getWindowColor(theme, "week", quotaState.secondaryWindow.usedPercent);

	const primary =
		colorQuotaLabel(theme, primaryColor, `5h ${formatPercent(quotaState.primaryWindow.usedPercent)}`) +
		theme.fg("dim", ` (${formatResetTime(quotaState.primaryWindow.resetAtMs)})`);
	const secondary =
		colorQuotaLabel(theme, secondaryColor, `1w ${formatPercent(quotaState.secondaryWindow.usedPercent)}`) +
		theme.fg("dim", ` (${formatRemainingTime(quotaState.secondaryWindow.resetAtMs)})`);

	return `${theme.fg("dim", " • ")}${primary}${theme.fg("dim", " | ")}${secondary}`;
}

function renderCopilotQuota(theme, copilotQuotaState) {
	const premium = copilotQuotaState?.premiumInteractions;
	if (!premium || typeof premium.percentRemaining !== "number") return "";

	if (premium.unlimited) {
		return `${theme.fg("dim", " • ")}quota: ${colorQuotaLabel(theme, "success", "∞")}`;
	}

	const usedPercent = clampPercent(100 - premium.percentRemaining);
	const goalPercent = getCopilotGoalPercent(copilotQuotaState.quotaResetDate);
	const color = getRemainingColor(premium.percentRemaining);
	const quotaText = `quota: ${formatPercent(usedPercent)} / ${typeof goalPercent === "number" ? formatPercent(goalPercent) : "--"}`;
	return `${theme.fg("dim", " • ")}${colorQuotaLabel(theme, color, quotaText)}`;
}

export default function openaiCodexQuotaExtension(pi) {
	const authStorage = AuthStorage.create();

	let currentModel;
	let modelRegistry;
	let quotaState = {
		primaryWindow: null,
		secondaryWindow: null,
		lastUpdatedAt: 0,
		lastError: undefined,
	};
	let copilotQuotaState = {
		premiumInteractions: null,
		quotaResetDate: undefined,
		lastUpdatedAt: 0,
		lastError: undefined,
	};
	let refreshInFlight = null;
	const requestRenderCallbacks = new Set();

	function requestFooterRender() {
		for (const callback of requestRenderCallbacks) {
			try {
				callback();
			} catch {}
		}
	}

	async function fetchQuota() {
		const apiKey = await authStorage.getApiKey(OPENAI_CODEX_PROVIDER);
		const credential = authStorage.get(OPENAI_CODEX_PROVIDER);
		const accountId = credential?.type === "oauth" ? credential.accountId : undefined;

		if (!apiKey || !accountId) {
			throw new Error("Missing OpenAI Codex OAuth credentials");
		}

		const response = await fetch(USAGE_URL, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"chatgpt-account-id": accountId,
				originator: "pi",
				"User-Agent": `pi (${os.platform()} ${os.release()}; ${os.arch()})`,
				accept: "application/json",
			},
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`OpenAI Codex usage request failed (${response.status}): ${body || response.statusText}`);
		}

		const payload = await response.json();
		const primary = payload?.rate_limit?.primary_window;
		const secondary = payload?.rate_limit?.secondary_window;
		if (!primary || !secondary) {
			throw new Error(`Unexpected OpenAI Codex usage payload: ${JSON.stringify(payload)}`);
		}

		return {
			primaryWindow: {
				usedPercent: Number(primary.used_percent || 0),
				resetAtMs: Number(primary.reset_at || 0) * 1000,
			},
			secondaryWindow: {
				usedPercent: Number(secondary.used_percent || 0),
				resetAtMs: Number(secondary.reset_at || 0) * 1000,
			},
			lastUpdatedAt: Date.now(),
			lastError: undefined,
		};
	}

	async function fetchCopilotQuota() {
		const credential = authStorage.get(GITHUB_COPILOT_PROVIDER);
		const serverUrl = normalizeServerUrl(credential?.enterpriseUrl) || "https://github.com";
		const apiUrl = getApiUrl(serverUrl);
		const accessToken = credential?.refresh;

		if (!accessToken) {
			throw new Error("Missing GitHub Copilot refresh token");
		}

		const response = await fetch(new URL("copilot_internal/user", apiUrl), {
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
				"X-GitHub-Api-Version": USER_INFO_API_VERSION,
				...COPILOT_HEADERS,
			},
		});

		const text = await response.text();
		if (!response.ok) {
			throw new Error(`GitHub Copilot user info request failed (${response.status}): ${text.slice(0, 400)}`);
		}

		const userInfo = JSON.parse(text);
		const premium = userInfo?.quota_snapshots?.premium_interactions;
		return {
			premiumInteractions: premium
				? {
					unlimited: Boolean(premium.unlimited),
					overageEnabled: Boolean(premium.overage_permitted),
					overageUsed: typeof premium.overage_count === "number" ? premium.overage_count : 0,
					quota: typeof premium.entitlement === "number" ? premium.entitlement : undefined,
					percentRemaining:
						typeof premium.percent_remaining === "number" ? premium.percent_remaining : undefined,
				}
				: null,
			quotaResetDate: userInfo?.quota_reset_date,
			lastUpdatedAt: Date.now(),
			lastError: undefined,
		};
	}

	async function refreshQuotaIfNeeded(reason) {
		if (!currentModel) return;

		if (isActiveCodexSubscriptionModel(currentModel, modelRegistry)) {
			if (refreshInFlight) return refreshInFlight;
			refreshInFlight = (async () => {
				try {
					quotaState = await fetchQuota();
					requestFooterRender();
				} catch (error) {
					quotaState = {
						...quotaState,
						lastError: error instanceof Error ? `${reason}: ${error.message}` : `${reason}: ${String(error)}`,
					};
					console.warn(`[openai-codex-quota] ${quotaState.lastError}`);
				} finally {
					refreshInFlight = null;
				}
			})();
			return refreshInFlight;
		}

		quotaState = {
			primaryWindow: null,
			secondaryWindow: null,
			lastUpdatedAt: quotaState.lastUpdatedAt,
			lastError: undefined,
		};

		if (isActiveCopilotSubscriptionModel(currentModel, modelRegistry)) {
			if (refreshInFlight) return refreshInFlight;
			refreshInFlight = (async () => {
				try {
					copilotQuotaState = await fetchCopilotQuota();
					requestFooterRender();
				} catch (error) {
					copilotQuotaState = {
						...copilotQuotaState,
						lastError: error instanceof Error ? `${reason}: ${error.message}` : `${reason}: ${String(error)}`,
					};
					console.warn(`[github-copilot-quota] ${copilotQuotaState.lastError}`);
				} finally {
					refreshInFlight = null;
				}
			})();
			return refreshInFlight;
		}

		copilotQuotaState = {
			premiumInteractions: null,
			quotaResetDate: undefined,
			lastUpdatedAt: copilotQuotaState.lastUpdatedAt,
			lastError: undefined,
		};
	}

	function installFooter(ctx) {
		if (ctx.mode !== "tui") return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const requestRender = () => tui.requestRender();
			requestRenderCallbacks.add(requestRender);
			const unsubscribe = footerData.onBranchChange(requestRender);
			const timer = setInterval(requestRender, REFRESH_RENDER_INTERVAL_MS);

			return {
				dispose() {
					requestRenderCallbacks.delete(requestRender);
					unsubscribe();
					clearInterval(timer);
				},
				invalidate() {},
				render(width) {
					const stats = getUsageStats(ctx.sessionManager);
					const statsParts = [];

					if (stats.totalInput) statsParts.push(`↑${formatTokens(stats.totalInput)}`);
					if (stats.totalOutput) statsParts.push(`↓${formatTokens(stats.totalOutput)}`);
					if (stats.totalCacheRead) statsParts.push(`R${formatTokens(stats.totalCacheRead)}`);
					if (stats.totalCacheWrite) statsParts.push(`W${formatTokens(stats.totalCacheWrite)}`);
					if ((stats.totalCacheRead > 0 || stats.totalCacheWrite > 0) && stats.latestCacheHitRate !== undefined) {
						statsParts.push(`CH${stats.latestCacheHitRate.toFixed(1)}%`);
					}

					const usingSubscription = currentModel ? modelRegistry?.isUsingOAuth(currentModel) : false;
					if (stats.totalCost || usingSubscription) {
						statsParts.push(`$${stats.totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`);
					}
					statsParts.push(getContextDisplay(ctx, theme, currentModel));
					let left = statsParts.join(" ");

					let modelText = currentModel?.id || "no-model";
					const thinkingLevel = getThinkingLevel(ctx.sessionManager);
					if (currentModel?.reasoning) {
						modelText = thinkingLevel === "off" ? `${modelText} • thinking off` : `${modelText} • ${thinkingLevel}`;
					}
					if (currentModel && footerData.getAvailableProviderCount() > 1) {
						modelText = `(${currentModel.provider}) ${modelText}`;
					}

					if (isActiveCodexSubscriptionModel(currentModel, modelRegistry)) {
						modelText += renderQuota(theme, quotaState);
					} else if (isActiveCopilotSubscriptionModel(currentModel, modelRegistry)) {
						modelText += renderCopilotQuota(theme, copilotQuotaState);
					}

					let leftWidth = visibleWidth(left);
					if (leftWidth > width) {
						left = truncateToWidth(left, width, "...");
						leftWidth = visibleWidth(left);
					}

					const rightWidth = visibleWidth(modelText);
					const minPadding = 2;
					let statsLine;
					if (leftWidth + rightWidth + minPadding <= width) {
						const padding = " ".repeat(Math.max(0, width - leftWidth - rightWidth));
						statsLine = left + padding + modelText;
					} else {
						const availableRight = width - leftWidth - minPadding;
						if (availableRight > 0) {
							const truncatedRight = truncateToWidth(modelText, availableRight, "");
							const padding = " ".repeat(Math.max(0, width - leftWidth - visibleWidth(truncatedRight)));
							statsLine = left + padding + truncatedRight;
						} else {
							statsLine = left;
						}
					}

					let pwd = formatCwdForFooter(ctx.sessionManager.getCwd());
					const branch = footerData.getGitBranch();
					if (branch) pwd += ` (${branch})`;
					const sessionName = ctx.sessionManager.getSessionName();
					if (sessionName) pwd += ` • ${sessionName}`;

					const lines = [
						truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "...")),
						theme.fg("dim", left) + theme.fg("dim", statsLine.slice(left.length)),
					];

					const extensionStatuses = footerData.getExtensionStatuses();
					if (extensionStatuses.size > 0) {
						const statusLine = Array.from(extensionStatuses.entries())
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([, text]) => sanitizeStatusText(text))
							.join(" ");
						lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
					}

					return lines;
				},
			};
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		currentModel = ctx.model;
		modelRegistry = ctx.modelRegistry;
		installFooter(ctx);
		void refreshQuotaIfNeeded("session_start");
	});

	pi.on("model_select", async (event, ctx) => {
		currentModel = event.model;
		modelRegistry = ctx.modelRegistry;
		void refreshQuotaIfNeeded("model_select");
	});

	pi.on("agent_settled", async (_event, _ctx) => {
		void refreshQuotaIfNeeded("agent_settled");
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (ctx.mode === "tui") {
			ctx.ui.setFooter(undefined);
		}
	});
}
