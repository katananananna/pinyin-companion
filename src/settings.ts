import { buildOverrideMap, validateOverride, type OverrideEntry } from './core/overrides';
import type { Separator } from './core/decide';
import { Pronouncer } from './core/pronouncer';

export interface PinyinCompanionSettings {
	autoMode: boolean;
	idleDelayMs: number;
	typoSuggestions: boolean;
	separator: Separator;
	markYiBuSandhi: boolean;
	overrides: OverrideEntry[];
}

export const MIN_IDLE_DELAY_MS = 300;
export const MAX_IDLE_DELAY_MS = 5000;

export const DEFAULT_SETTINGS: Readonly<PinyinCompanionSettings> = Object.freeze({
	autoMode: false,
	idleDelayMs: 700,
	typoSuggestions: true,
	separator: 'space',
	markYiBuSandhi: false,
	overrides: [],
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeOverrides(value: unknown): OverrideEntry[] {
	if (!Array.isArray(value)) return [];
	const byPhrase = new Map<string, OverrideEntry>();
	for (const item of value) {
		if (!isRecord(item) || typeof item.phrase !== 'string' || typeof item.pinyin !== 'string') continue;
		const result = validateOverride(item.phrase, item.pinyin);
		if (result.ok) byPhrase.set(result.entry.phrase, result.entry);
	}
	return [...byPhrase.values()];
}

/** Validate settings loaded from disk; unknown or invalid values fall back to defaults. */
export function sanitizeSettings(raw: unknown): PinyinCompanionSettings {
	const data = isRecord(raw) ? raw : {};
	const delay = typeof data.idleDelayMs === 'number' && Number.isFinite(data.idleDelayMs)
		? Math.round(Math.min(MAX_IDLE_DELAY_MS, Math.max(MIN_IDLE_DELAY_MS, data.idleDelayMs)))
		: DEFAULT_SETTINGS.idleDelayMs;
	return {
		autoMode: typeof data.autoMode === 'boolean' ? data.autoMode : DEFAULT_SETTINGS.autoMode,
		idleDelayMs: delay,
		typoSuggestions: typeof data.typoSuggestions === 'boolean' ? data.typoSuggestions : DEFAULT_SETTINGS.typoSuggestions,
		separator: data.separator === 'parentheses' ? 'parentheses' : 'space',
		markYiBuSandhi: typeof data.markYiBuSandhi === 'boolean' ? data.markYiBuSandhi : DEFAULT_SETTINGS.markYiBuSandhi,
		overrides: sanitizeOverrides(data.overrides),
	};
}

export function createPronouncer(settings: PinyinCompanionSettings): Pronouncer {
	return new Pronouncer({
		markYiBuSandhi: settings.markYiBuSandhi,
		overrides: buildOverrideMap(settings.overrides),
	});
}
