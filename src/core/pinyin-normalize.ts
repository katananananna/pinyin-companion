/**
 * Pure pinyin normalisation: parsing tone marks / tone numbers / ü spellings,
 * producing comparison keys, and placing tone marks.
 *
 * Input forms accepted for ü: "ü", "v", "u:" (and decomposed u + U+0308).
 * Tone input: combining or precomposed tone marks, or a trailing digit 1-5
 * (0 and 5 both mean neutral tone).
 */

export type Tone = 1 | 2 | 3 | 4 | 5;

export interface ParsedLetter {
	/** Lowercase base letter; "ü" and "ê" are kept as single letters. */
	ch: string;
	/** Tone carried by a mark on this letter, if any. */
	tone: Tone | null;
}

export interface ParsedSyllable {
	/** Toneless lowercase syllable written with ü, e.g. "lüe". */
	base: string;
	tone: Tone;
	key: string;
}

const COMBINING_TONES: Readonly<Record<string, Tone>> = {
	'\u0304': 1,
	'\u0301': 2,
	'\u030C': 3,
	'\u0300': 4,
};
const TONE_TO_COMBINING: Readonly<Record<number, string>> = {
	1: '\u0304',
	2: '\u0301',
	3: '\u030C',
	4: '\u0300',
};
const DIAERESIS = '\u0308';
const CIRCUMFLEX = '\u0302';

/**
 * Parse letters of one pinyin chunk (no digits, spaces or apostrophes).
 * Returns null if the chunk contains anything that is not a pinyin letter.
 */
export function parseLetters(raw: string): ParsedLetter[] | null {
	const decomposed = raw.normalize('NFD').toLowerCase();
	const letters: ParsedLetter[] = [];
	for (const ch of decomposed) {
		const last = letters[letters.length - 1];
		const tone = COMBINING_TONES[ch];
		if (tone !== undefined) {
			if (!last || last.tone !== null) return null;
			letters[letters.length - 1] = { ch: last.ch, tone };
		} else if (ch === DIAERESIS || ch === ':') {
			if (!last || last.ch !== 'u') return null;
			letters[letters.length - 1] = { ch: 'ü', tone: last.tone };
		} else if (ch === CIRCUMFLEX) {
			if (!last || last.ch !== 'e') return null;
			letters[letters.length - 1] = { ch: 'ê', tone: last.tone };
		} else if (ch === 'v') {
			letters.push({ ch: 'ü', tone: null });
		} else if (ch >= 'a' && ch <= 'z') {
			letters.push({ ch, tone: null });
		} else {
			return null;
		}
	}
	return letters.length > 0 ? letters : null;
}

export function lettersToBase(letters: readonly ParsedLetter[]): string {
	return letters.map((l) => l.ch).join('');
}

/**
 * Canonical comparison key: ü is written "v" everywhere, and the "u" in
 * ju/qu/xu/yu (which is phonetically ü) is also written "v", so "jv", "ju:"
 * and "ju" compare equal while "lu" and "lü" stay different.
 * Each input letter maps to exactly one key character, so letter offsets and
 * key offsets coincide.
 */
export function comparisonKey(base: string): string {
	return base
		.replace(/ü/g, 'v')
		.replace(/ê/g, 'e')
		.replace(/([jqxy])u/g, '$1v');
}

/** Looser key that also ignores the ü/u distinction (used only for suggestions). */
export function looseKey(key: string): string {
	return key.replace(/v/g, 'u');
}

/**
 * Parse one syllable such as "xué", "xue2", "lv4", "lü", "men" (neutral).
 * Returns null for malformed input or more than one tone indication.
 */
export function parseSyllable(raw: string): ParsedSyllable | null {
	const match = /^(.*?)([0-5])?$/su.exec(raw.trim());
	if (!match) return null;
	const letters = parseLetters(match[1] ?? '');
	if (!letters) return null;
	const marked = letters.filter((l) => l.tone !== null);
	if (marked.length > 1 || (marked.length === 1 && match[2] !== undefined)) return null;
	const digit = match[2] === undefined ? null : Number(match[2]);
	const tone: Tone = digit !== null ? toToneFromDigit(digit) : (marked[0]?.tone ?? 5);
	// Standard spelling writes ü as u after j, q, x and y (jv2 -> jú).
	const base = lettersToBase(letters).replace(/^([jqxy])ü/u, '$1u');
	return { base, tone, key: comparisonKey(base) };
}

export function toToneFromDigit(digit: number): Tone {
	if (digit >= 1 && digit <= 4) return digit as Tone;
	return 5;
}

/** Index of the letter that carries the tone mark, following standard pinyin rules. */
function toneMarkIndex(base: string): number {
	const a = base.indexOf('a');
	if (a >= 0) return a;
	const e = base.search(/[eê]/);
	if (e >= 0) return e;
	const ou = base.indexOf('ou');
	if (ou >= 0) return ou;
	for (let i = base.length - 1; i >= 0; i--) {
		if ('iouü'.includes(base[i] ?? '')) return i;
	}
	// Syllabic nasals: m, n, ng, hm, hng.
	return base.search(/[mn]/);
}

/** Place a tone mark on a toneless syllable ("xue", 2) -> "xué". Neutral tone returns the base. */
export function applyTone(base: string, tone: Tone): string {
	if (tone === 5) return base;
	const index = toneMarkIndex(base);
	if (index < 0) return base;
	const mark = TONE_TO_COMBINING[tone] ?? '';
	return (base.slice(0, index + 1) + mark + base.slice(index + 1)).normalize('NFC');
}

/** Normalise any accepted syllable spelling to lowercase tone-marked form. */
export function toMarkedSyllable(raw: string): string | null {
	const parsed = parseSyllable(raw);
	return parsed ? applyTone(parsed.base, parsed.tone) : null;
}
