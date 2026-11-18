import { buildOverrideMap, validateOverride, type OverrideEntry } from './core/overrides';
import type { Separator } from './core/decide';
import { Pronouncer } from './core/pronouncer';

export interface PinyinCompanionSettings {
	/** Only convert pinyin typed inside brackets, never plain text after Chinese. */
	bracketsOnly: boolean;
	/** Apply a single clear spelling correction automatically; off = only suggest it in a notice. */
	autoFixTypos: boolean;
	overrides: OverrideEntry[];
}

/** Fixed behaviour that used to be settings. */
export const OUTPUT_SEPARATOR: Separator = 'space';
export const REMOVE_BRACKETS = true;
export const MARK_YI_BU_SANDHI = true;

export const DEFAULT_SETTINGS: Readonly<PinyinCompanionSettings> = Object.freeze({
	bracketsOnly: false,
	autoFixTypos: true,
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

/** Validate settings loaded from disk; unknown or invalid values fall back to defaults. Older versions' fields are ignored, except the trigger. */
export function sanitizeSettings(raw: unknown): PinyinCompanionSettings {
	const data = isRecord(raw) ? raw : {};
	return {
		bracketsOnly: data.bracketsOnly === true || data.autoTrigger === 'brackets',
		autoFixTypos: data.autoFixTypos !== false,
		overrides: sanitizeOverrides(data.overrides),
	};
}

export function createPronouncer(settings: PinyinCompanionSettings): Pronouncer {
	return new Pronouncer({
		markYiBuSandhi: MARK_YI_BU_SANDHI,
		overrides: buildOverrideMap(settings.overrides),
	});
}
