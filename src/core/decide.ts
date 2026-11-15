/**
 * Policies on top of the matcher: what the explicit commands and the
 * automatic mode should do with a line. Pure functions over strings; editor
 * code only translates the returned line offsets into document positions.
 */
import { CHINESE_PUNCTUATION, PUNCTUATION_IN_PINYIN, codePoints, isHanChar, isWhitespaceChar } from './chinese';
import {
	evaluateRegion,
	findRegions,
	type AnnotationRegion,
	type Candidate,
	type CandidateKind,
} from './annotation';
import { inlineProtectedRanges, overlapsAny, type Range } from './markdown-protect';
import type { Pronouncer } from './pronouncer';

export type Separator = 'space' | 'parentheses';

/** A concrete edit within one line. */
export interface Proposal {
	from: number;
	to: number;
	insert: string;
	/** The text currently in [from, to). */
	original: string;
	/** The Chinese characters the pinyin annotates. */
	chinese: string;
	/** Offset where `chinese` starts in the line. */
	chineseFrom: number;
	kind: CandidateKind;
	note: string;
}

export type CorrectionOutcome =
	| { type: 'none'; message: string }
	| { type: 'unchanged'; message: string }
	| { type: 'apply'; proposal: Proposal }
	| { type: 'choose'; proposals: Proposal[]; message: string };

export type AutoOutcome =
	| { type: 'none' }
	| { type: 'apply'; proposal: Proposal }
	| { type: 'suggest'; proposals: Proposal[] };

export type SelectionPlan =
	| { ok: true; at: number; insert: string }
	| { ok: false; message: string };

const MAX_PROPOSALS = 6;
const MAX_SELECTION_CHARS = 200;
const TRAILING_ALLOWANCE = 3;
const AUTO_TRAILING = /^[ \t，。、；：？！,.;:?!]{0,3}$/u;

function regionStart(region: AnnotationRegion): number {
	return region.han[0]?.from ?? 0;
}

interface ProposalContext {
	line: string;
	region: AnnotationRegion;
	separator: Separator;
	/** Replace the typed brackets together with the pinyin inside them. */
	removeBrackets: boolean;
	/** Inline code, URLs, link destinations, wiki links and HTML on this line. */
	protectedRanges: readonly Range[];
}

/** Build the edit for a candidate; null if it would touch a protected Markdown range. */
function toProposal(ctx: ProposalContext, candidate: Candidate): Proposal | null {
	const { line, region, separator } = ctx;
	const first = region.tokens[0];
	const last = region.tokens[candidate.tokenCount - 1];
	if (!first || !last) return null;
	const inner = candidate.syllables.join(' ');
	const strip = ctx.removeBrackets && region.open !== null && region.close !== null && candidate.tokenCount === region.tokens.length;
	const spanFrom = strip ? (region.open?.from ?? first.from) : first.from;
	const spanTo = strip ? (region.close?.to ?? last.to) : last.to;
	const wrap = region.wrapper === 'none' && separator === 'parentheses';
	const chineseCps = region.han.slice(-candidate.suffixLength);
	const chineseFrom = chineseCps[0]?.from ?? first.from;
	if (overlapsAny(ctx.protectedRanges, chineseFrom, region.end)) return null;
	return {
		from: spanFrom,
		to: spanTo,
		insert: wrap && !strip ? `(${inner})` : inner,
		original: line.slice(spanFrom, spanTo),
		chinese: chineseCps.map((cp) => cp.ch).join(''),
		chineseFrom,
		kind: candidate.kind,
		note: candidate.note,
	};
}

/** True when the proposal would only add parentheses or nothing at all. */
function isAlreadyCorrect(proposal: Proposal): boolean {
	return proposal.original === proposal.insert || `(${proposal.original})` === proposal.insert;
}

function distinctProposals(proposals: readonly (Proposal | null)[]): Proposal[] {
	const seen = new Set<string>();
	const result: Proposal[] = [];
	for (const p of proposals) {
		if (!p) continue;
		const id = `${p.from}:${p.to}:${p.insert}`;
		if (seen.has(id)) continue;
		seen.add(id);
		result.push(p);
	}
	return result.slice(0, MAX_PROPOSALS);
}

function withMaxTokens(candidates: readonly Candidate[]): Candidate[] {
	const max = Math.max(...candidates.map((c) => c.tokenCount));
	return candidates.filter((c) => c.tokenCount === max);
}

const ASCII_TRAILING = new Set([' ', '\t', '.', ',', ';', ':', '!', '?', ')', ']', '"', "'"]);

/** Spaces or punctuation the cursor may sit after when running the correction command. */
function isTrailingChar(ch: string): boolean {
	return ASCII_TRAILING.has(ch) || CHINESE_PUNCTUATION.has(ch) || isWhitespaceChar(ch);
}

/** Region whose Chinese or pinyin contains the cursor (or ends at most three spaces/punctuation marks before it). */
function regionAtCursor(line: string, cursor: number): AnnotationRegion | null {
	let found: AnnotationRegion | null = null;
	for (const region of findRegions(line)) {
		let end = region.end;
		while (end < line.length && end - region.end < TRAILING_ALLOWANCE && isTrailingChar(line[end] ?? '')) end++;
		if (regionStart(region) <= cursor && cursor <= end) found = region;
	}
	return found;
}

/** Minimum number of tokens so that the replaced span reaches the cursor. */
function minTokensForCursor(region: AnnotationRegion, cursor: number): number {
	const index = region.tokens.findIndex((t) => cursor <= t.to);
	if (index === -1) return region.tokens.length;
	const token = region.tokens[index];
	return token && cursor >= token.from ? index + 1 : Math.max(1, index);
}

/** "Correct pinyin annotation at cursor". */
export function correctAtCursor(
	line: string,
	cursor: number,
	pronouncer: Pronouncer,
	separator: Separator,
	removeBrackets = false,
): CorrectionOutcome {
	const region = regionAtCursor(line, cursor);
	if (!region) return { type: 'none', message: 'No Chinese text followed by pinyin was found at the cursor.' };
	if (region.tokens.every((t) => t.chunks === null)) {
		return { type: 'none', message: 'The text after the Chinese does not look like pinyin.' };
	}
	const all = region.wrapper !== 'none';
	const minTokens = all ? region.tokens.length : minTokensForCursor(region, cursor);
	const { candidates } = evaluateRegion(region, pronouncer, { minTokens, maxTokens: region.tokens.length, allowTypos: true });
	const ctx: ProposalContext = { line, region, separator, removeBrackets, protectedRanges: inlineProtectedRanges(line) };
	const toProposals = (list: readonly Candidate[]): Proposal[] => distinctProposals(list.map((c) => toProposal(ctx, c)));

	const exact = candidates.filter((c) => c.kind === 'exact');
	if (exact.length > 0) {
		const proposals = toProposals(withMaxTokens(exact));
		const only = proposals[0];
		if (proposals.length === 0) {
			return { type: 'none', message: 'The annotation is inside code, a link, a URL or HTML and was left unchanged.' };
		}
		if (proposals.length === 1 && only) {
			return isAlreadyCorrect(only)
				? { type: 'unchanged', message: 'The pinyin annotation is already correct.' }
				: { type: 'apply', proposal: only };
		}
		return { type: 'choose', proposals, message: 'The pinyin fits more than one phrase. Choose the one you meant.' };
	}
	const valid = candidates.filter((c) => c.kind === 'tone' || c.kind === 'alternate');
	if (valid.length > 0) {
		return {
			type: 'choose',
			proposals: toProposals(withMaxTokens(valid)),
			message: 'The pinyin you typed differs from the reading for this phrase. Choose one.',
		};
	}
	const fuzzy = candidates.filter((c) => c.kind === 'typo' || c.kind === 'loose');
	if (fuzzy.length > 0) {
		const best = Math.min(...fuzzy.map((c) => c.distance));
		return {
			type: 'choose',
			proposals: toProposals(withMaxTokens(fuzzy.filter((c) => c.distance === best))),
			message: 'Possible spelling mistake. Choose a correction or press Esc to keep your text.',
		};
	}
	return {
		type: 'none',
		message: `The pinyin does not match “${region.han.slice(-4).map((cp) => cp.ch).join('')}” closely enough to correct it safely.`,
	};
}

/** True if the typed letters are the start of a longer suffix's reading (user may still be typing). */
function mayBeIncomplete(contextKeys: readonly (string | null)[], suffixLength: number, typedKey: string): boolean {
	for (let m = suffixLength + 1; m <= contextKeys.length; m++) {
		const keys = contextKeys.slice(-m);
		if (keys.some((k) => k === null)) return false;
		let acc = '';
		for (let j = 0; j < m - 1; j++) {
			acc += keys[j] ?? '';
			if (acc === typedKey) return true;
			if (acc.length >= typedKey.length) break;
		}
	}
	return false;
}

export interface AutoOptions {
	separator: Separator;
	suggestions: boolean;
	/** Only act on pinyin typed inside brackets, e.g. 學習 [xuexi]. */
	bracketsOnly: boolean;
	removeBrackets: boolean;
	/** Apply a single unambiguous spelling correction instead of only suggesting it. */
	fixTypos?: boolean;
}

/**
 * Automatic mode: only an annotation that ends at the cursor, with every token
 * consumed and no tone marks typed, is considered. Only a unique exact match is
 * applied; everything else is at most a suggestion.
 */
export function decideAutomatic(line: string, cursor: number, pronouncer: Pronouncer, options: AutoOptions): AutoOutcome {
	const next = line.slice(cursor, cursor + 1);
	if (next !== '' && /[A-Za-z0-9\u00C0-\u024F]/u.test(next)) return { type: 'none' };
	const region = findRegions(line).find((r) => {
		const lastTo = r.tokens[r.tokens.length - 1]?.to ?? r.end;
		if (cursor >= lastTo && cursor <= r.end) return true;
		return cursor >= r.end && AUTO_TRAILING.test(line.slice(r.end, cursor));
	});
	if (!region || region.tokens.some((t) => t.chunks === null)) return { type: 'none' };
	const typedWithTones = region.tokens.some((t) => t.hasToneMarks);
	if (options.bracketsOnly && region.wrapper === 'none') return { type: 'none' };
	const count = region.tokens.length;
	const { candidates, contextKeys } = evaluateRegion(region, pronouncer, {
		minTokens: count,
		maxTokens: count,
		allowTypos: options.suggestions,
	});
	const ctx: ProposalContext = {
		line,
		region,
		separator: options.separator,
		removeBrackets: options.removeBrackets,
		protectedRanges: inlineProtectedRanges(line),
	};
	const exact = candidates.filter((c) => c.kind === 'exact');
	if (exact.length > 0) {
		const proposals = distinctProposals(exact.map((c) => toProposal(ctx, c)));
		const only = proposals[0];
		const candidate = exact[0];
		if (proposals.length !== 1 || !only || !candidate) return { type: 'none' };
		if (isAlreadyCorrect(only)) return { type: 'none' };
		if (mayBeIncomplete(contextKeys, candidate.suffixLength, candidate.typedKey)) return { type: 'none' };
		return { type: 'apply', proposal: only };
	}
	// Pinyin typed with tone marks is only ever rewritten when it matches exactly (including spoken third-tone changes).
	if (typedWithTones || !options.suggestions) return { type: 'none' };
	const rest = candidates.filter((c) => c.kind !== 'exact' && !c.libraryKey.startsWith(c.typedKey));
	if (rest.length === 0) return { type: 'none' };
	const best = Math.min(...rest.map((c) => c.distance));
	const proposals = distinctProposals(
		rest.filter((c) => c.distance === best).map((c) => toProposal(ctx, c)),
	).filter((p) => !isAlreadyCorrect(p));
	const only = proposals[0];
	if (options.fixTypos && proposals.length === 1 && only) return { type: 'apply', proposal: only };
	return proposals.length > 0 ? { type: 'suggest', proposals } : { type: 'none' };
}

/** "Insert pinyin after selected Chinese": plan the insertion for a single-line selection. */
export function planSelectionInsert(
	line: string,
	from: number,
	to: number,
	pronouncer: Pronouncer,
	separator: Separator,
): SelectionPlan {
	let start = Math.max(0, Math.min(from, to));
	let end = Math.min(line.length, Math.max(from, to));
	while (start < end && isWhitespaceChar(line[start] ?? '')) start++;
	while (end > start && isWhitespaceChar(line[end - 1] ?? '')) end--;
	const text = line.slice(start, end);
	if (text.length === 0) return { ok: false, message: 'Select some Chinese text first.' };
	const chars = codePoints(text).map((cp) => cp.ch);
	if (chars.length > MAX_SELECTION_CHARS) {
		return { ok: false, message: `Select at most ${MAX_SELECTION_CHARS} characters at a time.` };
	}
	const invalid = chars.find((ch) => !isHanChar(ch) && !CHINESE_PUNCTUATION.has(ch));
	if (invalid !== undefined) {
		return { ok: false, message: `The selection contains “${invalid}”. Select only Chinese characters and Chinese punctuation.` };
	}
	if (!chars.some(isHanChar)) return { ok: false, message: 'The selection contains no Chinese characters.' };
	const readings = pronouncer.readings(text);
	const parts: string[] = [];
	for (let i = 0; i < chars.length; i++) {
		const ch = chars[i] ?? '';
		if (isHanChar(ch)) {
			const reading = readings[i]?.marked;
			if (!reading) return { ok: false, message: `No pronunciation is available for “${ch}”.` };
			parts.push(reading);
			continue;
		}
		const punctuation = PUNCTUATION_IN_PINYIN.get(ch);
		const lastIndex = parts.length - 1;
		if (punctuation && lastIndex >= 0) parts[lastIndex] = `${parts[lastIndex] ?? ''}${punctuation}`;
	}
	const inner = parts.join(' ');
	return { ok: true, at: end, insert: separator === 'parentheses' ? ` (${inner})` : ` ${inner}` };
}
