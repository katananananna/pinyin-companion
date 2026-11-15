import { Converter } from 'opencc-js/t2cn';
import { pinyin, polyphonic } from 'pinyin-pro';
import { isHanChar } from './chinese';
import { comparisonKey, parseSyllable, type Tone } from './pinyin-normalize';

/** One character's pronunciation. */
export interface Reading {
	/** Lowercase tone-marked syllable, e.g. "xué"; neutral tone has no mark. */
	marked: string;
	base: string;
	tone: Tone;
	key: string;
}

export interface PronouncerOptions {
	/** Mark tone changes of 一 and 不 (pinyin-pro `toneSandhi: { yi, bu }`). Off = dictionary style. */
	markYiBuSandhi: boolean;
	/** Exact phrase -> tone-marked syllables. Takes priority over the library. */
	overrides: ReadonlyMap<string, readonly string[]>;
}

type ConverterFunction = (text: string) => string;
let traditionalToSimplified: ConverterFunction | null = null;

/**
 * pinyin-pro's phrase data is keyed on Simplified Chinese, and its readings for
 * Traditional characters are often wrong (於 -> wū, 還是 -> huán shì). We
 * therefore look up readings on a Simplified copy produced by OpenCC
 * (Taiwan variants -> Mainland Simplified, character/phrase mapping only, no
 * vocabulary substitution). The note text itself is never changed.
 * If the conversion would change the number of characters, the original text
 * is used so syllables always align one-to-one with the user's characters.
 */
export function readingScript(text: string): string {
	traditionalToSimplified ??= Converter({ from: 'tw', to: 'cn' });
	const converted = traditionalToSimplified(text);
	return Array.from(converted).length === Array.from(text).length ? converted : text;
}

export function toReading(marked: string): Reading | null {
	const parsed = parseSyllable(marked);
	if (!parsed) return null;
	return { marked: marked.normalize('NFC'), base: parsed.base, tone: parsed.tone, key: comparisonKey(parsed.base) };
}

/**
 * Wraps the pronunciation library. Instances are immutable; settings changes
 * create a new instance, so overrides never leak into pinyin-pro's global
 * custom dictionary or between tests.
 */
export class Pronouncer {
	private readonly overrideMaxLength: number;

	constructor(private readonly options: PronouncerOptions) {
		let max = 0;
		for (const phrase of options.overrides.keys()) max = Math.max(max, Array.from(phrase).length);
		this.overrideMaxLength = max;
	}

	/**
	 * Contextual readings for every code point of `text` (null for non-Han
	 * characters or characters the library does not know). The whole text is
	 * passed to the library at once so its word segmentation can choose
	 * readings for polyphonic characters.
	 */
	readings(text: string): (Reading | null)[] {
		const chars = Array.from(text);
		if (chars.length === 0) return [];
		const lookup = readingScript(text);
		const toneSandhi = this.options.markYiBuSandhi ? { yi: true, bu: true, thirdTone: true } : false;
		let items = pinyin(lookup, { type: 'all', toneSandhi });
		if (items.length !== chars.length) {
			// Defensive: fall back to per-character lookup if alignment is ever lost.
			items = Array.from(lookup).flatMap((ch) => pinyin(ch, { type: 'all', toneSandhi }));
		}
		const readings = chars.map((ch, i) => {
			const item = items[i];
			if (!item || !isHanChar(ch) || !item.isZh || !item.pinyin) return null;
			return toReading(item.pinyin);
		});
		return this.applyOverrides(chars, readings);
	}

	/** All known readings per character (polyphonic candidates), contextual reading first. */
	alternatives(text: string): Reading[][] {
		const chars = Array.from(text);
		const contextual = this.readings(text);
		const fromLookup = polyphonic(readingScript(text), { type: 'array' });
		const fromOriginal = polyphonic(text, { type: 'array' });
		return chars.map((_, i) => {
			const seen = new Set<string>();
			const result: Reading[] = [];
			const candidates = [contextual[i]?.marked, ...(fromLookup[i] ?? []), ...(fromOriginal[i] ?? [])];
			for (const marked of candidates) {
				if (!marked || seen.has(marked)) continue;
				const reading = toReading(marked);
				if (!reading) continue;
				seen.add(marked);
				result.push(reading);
			}
			return result;
		});
	}

	/** Longest-match, left-to-right replacement of exact override phrases. */
	private applyOverrides(chars: readonly string[], readings: (Reading | null)[]): (Reading | null)[] {
		if (this.overrideMaxLength === 0) return readings;
		const result = [...readings];
		let i = 0;
		while (i < chars.length) {
			const matched = this.matchOverrideAt(chars, i);
			if (!matched) {
				i++;
				continue;
			}
			matched.forEach((reading, offset) => {
				result[i + offset] = reading;
			});
			i += matched.length;
		}
		return result;
	}

	private matchOverrideAt(chars: readonly string[], start: number): Reading[] | null {
		const maxLength = Math.min(this.overrideMaxLength, chars.length - start);
		for (let length = maxLength; length >= 1; length--) {
			const syllables = this.options.overrides.get(chars.slice(start, start + length).join(''));
			if (!syllables) continue;
			const readings = syllables.map(toReading);
			if (readings.every((r): r is Reading => r !== null)) return readings;
		}
		return null;
	}
}
