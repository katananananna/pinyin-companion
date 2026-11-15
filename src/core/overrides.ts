import { isHanChar } from './chinese';
import { applyTone, parseSyllable } from './pinyin-normalize';
import { isValidSyllable } from './syllables';

/** A user pronunciation override as stored in plugin settings. */
export interface OverrideEntry {
	/** Exact Chinese phrase (Han characters only). */
	phrase: string;
	/** Space-separated, lowercase, tone-marked pinyin, one syllable per character. */
	pinyin: string;
}

export type OverrideValidation =
	| { ok: true; entry: OverrideEntry }
	| { ok: false; error: string };

export const MAX_OVERRIDE_PHRASE_LENGTH = 32;

/**
 * Validate and normalise an override. Accepts tone marks, tone numbers
 * (lv4, xue2) and v / u: for ü; stores tone-marked syllables.
 */
export function validateOverride(phraseRaw: string, pinyinRaw: string): OverrideValidation {
	const phrase = phraseRaw.trim();
	const chars = Array.from(phrase);
	if (chars.length === 0) return { ok: false, error: 'Enter a Chinese phrase.' };
	if (chars.length > MAX_OVERRIDE_PHRASE_LENGTH) {
		return { ok: false, error: `Phrases are limited to ${MAX_OVERRIDE_PHRASE_LENGTH} characters.` };
	}
	const nonHan = chars.find((ch) => !isHanChar(ch));
	if (nonHan !== undefined) {
		return { ok: false, error: `“${nonHan}” is not a Chinese character. Use Chinese characters only.` };
	}
	const rawSyllables = pinyinRaw.trim().split(/\s+/).filter((s) => s.length > 0);
	if (rawSyllables.length !== chars.length) {
		return {
			ok: false,
			error: `“${phrase}” has ${chars.length} character(s) but ${rawSyllables.length} pinyin syllable(s). Separate syllables with spaces.`,
		};
	}
	const marked: string[] = [];
	for (const raw of rawSyllables) {
		const parsed = parseSyllable(raw);
		if (!parsed || !isValidSyllable(parsed.base)) {
			return { ok: false, error: `“${raw}” is not a valid pinyin syllable.` };
		}
		marked.push(applyTone(parsed.base, parsed.tone));
	}
	return { ok: true, entry: { phrase, pinyin: marked.join(' ') } };
}

/** Build an immutable lookup map; invalid entries are skipped. Later duplicates win. */
export function buildOverrideMap(entries: readonly OverrideEntry[]): ReadonlyMap<string, readonly string[]> {
	const map = new Map<string, readonly string[]>();
	for (const entry of entries) {
		const result = validateOverride(entry.phrase, entry.pinyin);
		if (result.ok) {
			map.set(result.entry.phrase, Object.freeze(result.entry.pinyin.split(' ')));
		}
	}
	return map;
}
