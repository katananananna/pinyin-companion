/**
 * Character classification for Chinese text.
 *
 * Boundary rule: a "Chinese run" is a maximal sequence of Han ideographs
 * (Unicode Script=Han). Punctuation, Latin letters, digits and whitespace all
 * end a run. Iteration marks such as 々 are excluded because they have no
 * reading of their own (the pronunciation library returns a wrong one).
 */

const HAN_SCRIPT = /\p{Script=Han}/u;
const HAN_WITHOUT_READING = new Set(['々', '〆', '〻']);

export function isHanChar(ch: string): boolean {
	return HAN_SCRIPT.test(ch) && !HAN_WITHOUT_READING.has(ch);
}

/** Chinese punctuation accepted inside a selection for the insert command. */
export const CHINESE_PUNCTUATION: ReadonlySet<string> = new Set(
	Array.from('，。、；：？！「」『』（）《》〈〉【】〔〕…—～·“”‘’﹁﹂﹃﹄．'),
);

/** Sentence punctuation that is carried into generated pinyin (attached to the previous syllable). */
export const PUNCTUATION_IN_PINYIN: ReadonlyMap<string, string> = new Map([
	['，', ','],
	['、', ','],
	['。', '.'],
	['？', '?'],
	['！', '!'],
	['；', ';'],
	['：', ':'],
]);

export interface CodePoint {
	ch: string;
	/** UTF-16 offset of the first code unit. */
	from: number;
	/** UTF-16 offset after the last code unit. */
	to: number;
}

/** Split text into code points while tracking UTF-16 offsets (editor positions are UTF-16). */
export function codePoints(text: string, offset = 0): CodePoint[] {
	const result: CodePoint[] = [];
	let pos = offset;
	for (const ch of text) {
		result.push({ ch, from: pos, to: pos + ch.length });
		pos += ch.length;
	}
	return result;
}

export function isWhitespaceChar(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\u3000';
}
