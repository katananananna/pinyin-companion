/**
 * Detecting "Chinese + pinyin" annotations on a single line and matching the
 * typed pinyin against the pronunciation of candidate Chinese suffixes.
 *
 * Boundary rules (see README "How matching works"):
 * 1. A region is: a Chinese run, up to three closing emphasis markers
 *    (* _ ~ =), optional whitespace, an optional opening bracket ( ( [ 【 or
 *    full-width forms), then one or more pinyin-like tokens separated by
 *    spaces (and, if a bracket was opened, its matching closing bracket).
 *    A square-bracket span followed by ( [ or : is a Markdown link and is ignored.
 * 2. The Chinese run may be a whole sentence. Only suffixes of the run (Chinese
 *    that ends right where the pinyin starts) are candidates, up to
 *    MAX_SUFFIX_LENGTH characters. Readings are taken in the context of the
 *    last CONTEXT_WINDOW characters of the run, and also for the suffix alone.
 * 3. The typed tokens are a prefix of the token list; later tokens may be
 *    ordinary English that is left untouched.
 * 4. Typed pinyin must align with whole syllables: a joined token such as
 *    "xuexi" may cover several syllables, but a syllable never spans two tokens.
 */
import { codePoints, isHanChar, isWhitespaceChar, type CodePoint } from './chinese';
import {
	applyTone,
	comparisonKey,
	lettersToBase,
	looseKey,
	parseLetters,
	toToneFromDigit,
	type ParsedLetter,
	type Tone,
} from './pinyin-normalize';
import type { Pronouncer, Reading } from './pronouncer';
import { osaDistance, typoBudget } from './typo';

export const MAX_SUFFIX_LENGTH = 16;
export const CONTEXT_WINDOW = 32;
export const MAX_TOKENS = 24;
const MAX_ALTERNATE_OPTIONS = 4;

export interface Chunk {
	letters: ParsedLetter[];
	key: string;
	digitTone: Tone | null;
}

export interface PinyinToken {
	text: string;
	from: number;
	to: number;
	/** Null when the token cannot be pinyin (e.g. contains "6" or "@"). */
	chunks: Chunk[] | null;
	hasToneMarks: boolean;
	hasDigits: boolean;
}

export interface AnnotationRegion {
	han: CodePoint[];
	/** 'paren' = ( ) or （ ）; 'square' = [ ], 【 】 or ［ ］. */
	wrapper: 'none' | 'paren' | 'square';
	/** The opening and closing bracket characters (null when wrapper is 'none'). */
	open: CodePoint | null;
	close: CodePoint | null;
	tokens: PinyinToken[];
	/** Offset after the last token, or after the closing parenthesis. */
	end: number;
}

export type CandidateKind = 'exact' | 'tone' | 'alternate' | 'typo' | 'loose';

export interface Candidate {
	kind: CandidateKind;
	/** Number of Chinese characters (suffix of the run) annotated. */
	suffixLength: number;
	/** Number of typed tokens replaced. */
	tokenCount: number;
	syllables: readonly string[];
	/** Edit distance for typo candidates, 0 otherwise. */
	distance: number;
	note: string;
	/** Typed key (letters only) and the library key for this suffix. */
	typedKey: string;
	libraryKey: string;
}

export interface Evaluation {
	candidates: Candidate[];
	/** Contextual comparison keys for the window (null = unknown character). */
	contextKeys: (string | null)[];
}

const TOKEN_START = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/u;
// Letters (incl. precomposed tone vowels), digits, colon, apostrophes, or a combining mark (decomposed tones).
const TOKEN_CHAR = /^(?:[A-Za-z0-9:'\u2019\u00C0-\u024F\u1E00-\u1EFF]|\p{Mn})$/u;
const BRACKET_PAIRS: ReadonlyMap<string, string> = new Map([
	['(', ')'],
	['（', '）'],
	['[', ']'],
	['【', '】'],
	['［', '］'],
]);
const SQUARE_OPENERS = new Set(['[', '【', '［']);
/** A square-bracket span followed by one of these is a Markdown link, reference or definition, not pinyin. */
const LINK_FOLLOWERS = new Set(['(', '[', ':']);
const EMPHASIS_MARKERS = new Set(['*', '_', '~', '=']);
const MAX_EMPHASIS_MARKERS = 3;

export function parseToken(text: string, from: number): PinyinToken {
	const token: PinyinToken = { text, from, to: from + text.length, chunks: null, hasToneMarks: false, hasDigits: false };
	const chunks: Chunk[] = [];
	for (const piece of text.split(/['’]/)) {
		if (piece.length === 0 || !/^(?:[^0-9]+[0-5]?)+$/u.test(piece)) return token;
		for (const part of piece.matchAll(/([^0-9]+)([0-5]?)/gu)) {
			const letters = parseLetters(part[1] ?? '');
			if (!letters) return token;
			const digitTone = part[2] ? toToneFromDigit(Number(part[2])) : null;
			chunks.push({ letters, key: comparisonKey(lettersToBase(letters)), digitTone });
		}
	}
	return {
		...token,
		chunks,
		hasToneMarks: chunks.some((c) => c.letters.some((l) => l.tone !== null)),
		hasDigits: chunks.some((c) => c.digitTone !== null),
	};
}

/** Find every annotation-like region on a line, left to right. */
export function findRegions(line: string): AnnotationRegion[] {
	const cps = codePoints(line);
	const regions: AnnotationRegion[] = [];
	let i = 0;
	while (i < cps.length) {
		if (!isHanChar(cps[i]?.ch ?? '')) {
			i++;
			continue;
		}
		const runStart = i;
		while (i < cps.length && isHanChar(cps[i]?.ch ?? '')) i++;
		const han = cps.slice(runStart, i);
		const parsed = parseTokensAfter(line, cps, i);
		if (parsed) {
			regions.push({ han, ...parsed.region });
			i = parsed.nextIndex;
		}
	}
	return regions;
}

function parseTokensAfter(
	line: string,
	cps: CodePoint[],
	start: number,
): { region: Omit<AnnotationRegion, 'han'>; nextIndex: number } | null {
	let j = start;
	// Closing emphasis markers may sit between the Chinese and the pinyin: **回饋** hui kui
	while (j < cps.length && j - start < MAX_EMPHASIS_MARKERS && EMPHASIS_MARKERS.has(cps[j]?.ch ?? '')) j++;
	while (j < cps.length && isWhitespaceChar(cps[j]?.ch ?? '')) j++;
	const opener = cps[j];
	const closer = opener ? BRACKET_PAIRS.get(opener.ch) : undefined;
	const wrapper = !opener || closer === undefined ? 'none' : SQUARE_OPENERS.has(opener.ch) ? 'square' : 'paren';
	const open = wrapper === 'none' ? null : (opener ?? null);
	if (open) j++;
	const tokens: PinyinToken[] = [];
	while (j < cps.length && TOKEN_START.test(cps[j]?.ch ?? '') && tokens.length < MAX_TOKENS) {
		let k = j;
		while (k < cps.length && TOKEN_CHAR.test(cps[k]?.ch ?? '')) k++;
		const from = cps[j]?.from ?? 0;
		const to = cps[k - 1]?.to ?? from;
		tokens.push(parseToken(line.slice(from, to), from));
		let m = k;
		while (m < cps.length && (cps[m]?.ch === ' ' || cps[m]?.ch === '\t')) m++;
		j = k;
		if (m > k && m < cps.length && TOKEN_START.test(cps[m]?.ch ?? '')) j = m;
		else break;
	}
	const lastToken = tokens[tokens.length - 1];
	if (!lastToken) return null;
	if (wrapper === 'none') return { region: { wrapper, open: null, close: null, tokens, end: lastToken.to }, nextIndex: j };
	let c = j;
	while (c < cps.length && cps[c]?.ch === ' ') c++;
	const close = cps[c];
	if (!close || close.ch !== closer) return null;
	if (wrapper === 'square' && LINK_FOLLOWERS.has(cps[c + 1]?.ch ?? '')) return null;
	return { region: { wrapper, open, close, tokens, end: close.to }, nextIndex: c + 1 };
}

interface Segment {
	chunk: number;
	start: number;
	end: number;
}

/** Greedy alignment of typed chunks to a fixed syllable key sequence. */
export function alignChunks(chunks: readonly Chunk[], keys: readonly string[]): Segment[] | null {
	const segments: Segment[] = [];
	let syllable = 0;
	for (let c = 0; c < chunks.length; c++) {
		const chunkKey = chunks[c]?.key ?? '';
		let pos = 0;
		while (pos < chunkKey.length) {
			const key = keys[syllable];
			if (key === undefined || key.length === 0 || !chunkKey.startsWith(key, pos)) return null;
			segments.push({ chunk: c, start: pos, end: pos + key.length });
			pos += key.length;
			syllable++;
		}
	}
	return syllable === keys.length ? segments : null;
}

/**
 * Tones the user typed for each aligned syllable. When any tone is given in
 * the annotation, unmarked syllables count as neutral tone; otherwise they are
 * unknown (null). Returns null if a syllable carries two tone indications.
 */
export function typedTones(chunks: readonly Chunk[], segments: readonly Segment[], explicit: boolean): (Tone | null)[] | null {
	const tones: (Tone | null)[] = [];
	for (const segment of segments) {
		const chunk = chunks[segment.chunk];
		if (!chunk) return null;
		const marks = chunk.letters.slice(segment.start, segment.end).filter((l) => l.tone !== null);
		if (marks.length > 1) return null;
		let tone: Tone | null = marks[0]?.tone ?? null;
		if (segment.end === chunk.letters.length && chunk.digitTone !== null) {
			if (tone !== null) return null;
			tone = chunk.digitTone;
		}
		tones.push(tone ?? (explicit ? 5 : null));
	}
	return tones;
}

/** Depth-first search for a combination of per-character readings matching the typed letters. */
function searchReadingKeys(typed: string, boundaries: ReadonlySet<number>, options: readonly string[][]): string[] | null {
	const failed = new Set<string>();
	const crosses = (from: number, to: number): boolean => {
		for (let b = from + 1; b < to; b++) if (boundaries.has(b)) return true;
		return false;
	};
	const visit = (index: number, pos: number): string[] | null => {
		if (index === options.length) return pos === typed.length ? [] : null;
		const memo = `${index}:${pos}`;
		if (failed.has(memo)) return null;
		for (const key of options[index] ?? []) {
			const end = pos + key.length;
			if (key.length === 0 || end > typed.length || !typed.startsWith(key, pos) || crosses(pos, end)) continue;
			const rest = visit(index + 1, end);
			if (rest) return [key, ...rest];
		}
		failed.add(memo);
		return null;
	};
	return visit(0, 0);
}

function cartesian(options: readonly (readonly string[])[], limit: number): string[][] {
	let result: string[][] = [[]];
	for (const choices of options) {
		result = result.flatMap((prefix) => choices.map((choice) => [...prefix, choice])).slice(0, limit);
	}
	return result;
}

export interface EvaluateOptions {
	minTokens: number;
	maxTokens: number;
	allowTypos: boolean;
}

interface SuffixData {
	n: number;
	context: Reading[];
	standalone: Reading[] | null;
	alternatives: Reading[][];
}

function chunkPrefixes(tokens: readonly PinyinToken[], maxTokens: number): Chunk[][] {
	const prefixes: Chunk[][] = [];
	let acc: Chunk[] = [];
	for (const token of tokens.slice(0, maxTokens)) {
		if (!token.chunks) break;
		acc = [...acc, ...token.chunks];
		prefixes.push(acc);
	}
	return prefixes;
}

/** Generate every plausible interpretation of the region's typed pinyin. */
export function evaluateRegion(region: AnnotationRegion, pronouncer: Pronouncer, options: EvaluateOptions): Evaluation {
	const windowChars = region.han.slice(-CONTEXT_WINDOW).map((cp) => cp.ch);
	const windowText = windowChars.join('');
	const context = pronouncer.readings(windowText);
	const contextKeys = context.map((r) => r?.key ?? null);
	let alternatives: Reading[][] | null = null;
	const prefixes = chunkPrefixes(region.tokens, Math.min(options.maxTokens, region.tokens.length));
	const candidates: Candidate[] = [];
	const maxN = Math.min(MAX_SUFFIX_LENGTH, windowChars.length);
	for (let n = 1; n <= maxN; n++) {
		const contextSlice = context.slice(-n);
		if (contextSlice.some((r) => r === null)) break;
		const suffixText = windowChars.slice(-n).join('');
		const standalone = pronouncer.readings(suffixText);
		alternatives ??= pronouncer.alternatives(windowText);
		const suffix: SuffixData = {
			n,
			context: contextSlice.filter((r): r is Reading => r !== null),
			standalone: standalone.every((r): r is Reading => r !== null) ? standalone : null,
			alternatives: alternatives.slice(-n),
		};
		for (let k = Math.max(1, options.minTokens); k <= prefixes.length; k++) {
			const chunks = prefixes[k - 1] ?? [];
			const explicit = region.tokens.slice(0, k).some((t) => t.hasToneMarks || t.hasDigits);
			candidates.push(...matchSuffix(suffix, k, chunks, explicit, options.allowTypos));
		}
	}
	return { candidates: dedupeCandidates(candidates), contextKeys };
}

function matchSuffix(suffix: SuffixData, k: number, chunks: Chunk[], explicit: boolean, allowTypos: boolean): Candidate[] {
	const typedKey = chunks.map((c) => c.key).join('');
	const libraryKey = suffix.context.map((r) => r.key).join('');
	const base = { suffixLength: suffix.n, tokenCount: k, typedKey, libraryKey };
	const results: Candidate[] = [];
	const readingSets = suffix.standalone ? [suffix.context, suffix.standalone] : [suffix.context];
	for (const readings of readingSets) {
		const segments = alignChunks(chunks, readings.map((r) => r.key));
		const tones = segments ? typedTones(chunks, segments, explicit) : null;
		if (!tones) continue;
		const library = readings.map((r) => r.marked);
		const conflict = tones.some((t, i) => t !== null && t !== readings[i]?.tone);
		if (!conflict) {
			results.push({ ...base, kind: 'exact', syllables: library, distance: 0, note: 'Reading for this phrase' });
			continue;
		}
		results.push({ ...base, kind: 'tone', syllables: library, distance: 0, note: 'Dictionary tones for this phrase' });
		const typed = readings.map((r, i) => applyTone(r.base, tones[i] ?? r.tone));
		results.push({ ...base, kind: 'tone', syllables: typed, distance: 0, note: 'Keep the tones you typed' });
	}
	if (results.length > 0) return results;

	const alternates = matchAlternates(suffix, chunks, explicit);
	if (alternates.length > 0) {
		return [
			...alternates.map((syllables) => ({ ...base, kind: 'alternate' as const, syllables, distance: 0, note: 'Another valid reading (as typed)' })),
			{ ...base, kind: 'alternate', syllables: suffix.context.map((r) => r.marked), distance: 0, note: 'Reading for this phrase in context' },
		];
	}
	if (!allowTypos) return [];
	const budget = typoBudget(typedKey.length);
	const library = suffix.context.map((r) => r.marked);
	if (budget > 0) {
		const distance = osaDistance(typedKey, libraryKey, budget);
		if (distance > 0 && distance <= budget) {
			return [{ ...base, kind: 'typo', syllables: library, distance, note: `Possible spelling mistake (${distance} edit${distance > 1 ? 's' : ''})` }];
		}
	}
	if (typedKey !== libraryKey && looseKey(typedKey) === looseKey(libraryKey)) {
		return [{ ...base, kind: 'loose', syllables: library, distance: 1, note: 'ü written as u' }];
	}
	return [];
}

function matchAlternates(suffix: SuffixData, chunks: Chunk[], explicit: boolean): string[][] {
	const typed = chunks.map((c) => c.key).join('');
	const boundaries = new Set<number>();
	let offset = 0;
	for (const chunk of chunks) {
		offset += chunk.key.length;
		boundaries.add(offset);
	}
	const keyOptions = suffix.alternatives.map((alts, i) => {
		const keys = alts.map((r) => r.key);
		const contextKey = suffix.context[i]?.key;
		return [...new Set(contextKey ? [contextKey, ...keys] : keys)];
	});
	const chosen = searchReadingKeys(typed, boundaries, keyOptions);
	if (!chosen || chosen.every((key, i) => key === suffix.context[i]?.key)) return [];
	const segments = alignChunks(chunks, chosen);
	const tones = segments ? typedTones(chunks, segments, explicit) : null;
	if (!tones) return [];
	const perSyllable = chosen.map((key, i): string[] => {
		const contextReading = suffix.context[i];
		const tone = tones[i] ?? null;
		const matching = (suffix.alternatives[i] ?? []).filter((r) => r.key === key);
		const baseReading = contextReading && contextReading.key === key ? contextReading : matching[0];
		if (!baseReading) return [];
		if (tone !== null) return [applyTone(baseReading.base, tone)];
		if (contextReading && contextReading.key === key) return [contextReading.marked];
		return [...new Set(matching.map((r) => r.marked))];
	});
	if (perSyllable.some((options) => options.length === 0)) return [];
	return cartesian(perSyllable, MAX_ALTERNATE_OPTIONS);
}

function dedupeCandidates(candidates: readonly Candidate[]): Candidate[] {
	const seen = new Set<string>();
	return candidates.filter((c) => {
		const id = `${c.kind}|${c.suffixLength}|${c.tokenCount}|${c.syllables.join(' ')}`;
		if (seen.has(id)) return false;
		seen.add(id);
		return true;
	});
}
