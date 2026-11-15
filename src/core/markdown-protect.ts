/**
 * Text-based detection of Markdown regions automatic mode must never edit.
 * The editor layer additionally consults CodeMirror's syntax tree; this module
 * is the deterministic, testable baseline used by both commands and auto mode.
 */

export type Range = readonly [number, number];

const URL_PATTERNS: readonly RegExp[] = [
	/[a-z][a-z0-9+.-]*:\/\/[^\s<>]+/giu,
	/\bwww\.[^\s<>]+/giu,
	/\bmailto:[^\s<>]+/giu,
];
const LINK_DESTINATION = /\]\([^)]*\)/gu;
const WIKI_LINK = /\[\[[^\]]*\]\]/gu;
const HTML_COMMENT = /<!--.*?(?:-->|$)/gu;
const HTML_TAG = /<\/?[A-Za-z][^<>]*>/gu;

function inlineCodeRanges(line: string): Range[] {
	const ranges: Range[] = [];
	const runs = [...line.matchAll(/`+/gu)];
	for (let i = 0; i < runs.length; i++) {
		const open = runs[i];
		if (!open || open.index === undefined) continue;
		const closeIndex = runs.findIndex((r, j) => j > i && r[0].length === open[0].length);
		const close = runs[closeIndex];
		if (!close || close.index === undefined) continue;
		ranges.push([open.index, close.index + close[0].length]);
		i = closeIndex;
	}
	return ranges;
}

/** Ranges on one line that are inline code, URLs, link destinations, wiki links or HTML. */
export function inlineProtectedRanges(line: string): Range[] {
	const ranges: Range[] = [...inlineCodeRanges(line)];
	for (const pattern of [...URL_PATTERNS, LINK_DESTINATION, WIKI_LINK, HTML_COMMENT, HTML_TAG]) {
		for (const match of line.matchAll(pattern)) {
			if (match.index !== undefined) ranges.push([match.index, match.index + match[0].length]);
		}
	}
	return ranges;
}

export function overlapsAny(ranges: readonly Range[], from: number, to: number): boolean {
	return ranges.some(([start, end]) => from < end && to > start);
}

export type BlockContext = 'none' | 'frontmatter' | 'code' | 'unknown';

/** Above this line number automatic mode does not try to work out the block context. */
export const MAX_BLOCK_SCAN_LINES = 20000;

const FENCE = /^\s*(?:>\s*)*(`{3,}|~{3,})(.*)$/u;
const FRONTMATTER_END = /^(?:---|\.\.\.)\s*$/u;

interface Fence {
	char: string;
	length: number;
}

function openingFence(text: string): Fence | null {
	const match = FENCE.exec(text);
	const marker = match?.[1];
	if (!match || !marker) return null;
	if (marker.startsWith('`') && (match[2] ?? '').includes('`')) return null;
	return { char: marker.charAt(0), length: marker.length };
}

function closesFence(text: string, fence: Fence): boolean {
	const match = FENCE.exec(text);
	const marker = match?.[1];
	return !!marker && marker.charAt(0) === fence.char && marker.length >= fence.length && (match?.[2] ?? '').trim() === '';
}

/**
 * Whether a line (0-based) is inside YAML frontmatter or a fenced code block
 * (fence lines included). Scans line starts from the top of the note once;
 * only called when a command runs or the idle timer fires, never per keystroke.
 */
export function blockContextAt(getLine: (index: number) => string, lineIndex: number, maxScan = MAX_BLOCK_SCAN_LINES): BlockContext {
	if (lineIndex > maxScan) return 'unknown';
	let inFrontmatter = false;
	let fence: Fence | null = null;
	for (let i = 0; i <= lineIndex; i++) {
		const text = getLine(i);
		const isTarget = i === lineIndex;
		if (i === 0 && text.trimEnd() === '---') {
			if (isTarget) return 'frontmatter';
			inFrontmatter = true;
			continue;
		}
		if (inFrontmatter) {
			if (isTarget) return 'frontmatter';
			if (FRONTMATTER_END.test(text)) inFrontmatter = false;
			continue;
		}
		if (fence) {
			if (isTarget) return 'code';
			if (closesFence(text, fence)) fence = null;
			continue;
		}
		const opened = openingFence(text);
		if (opened) {
			if (isTarget) return 'code';
			fence = opened;
			continue;
		}
		if (isTarget) return 'none';
	}
	return 'none';
}
