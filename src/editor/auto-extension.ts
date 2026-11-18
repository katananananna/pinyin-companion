/**
 * CodeMirror 6 extension for automatic mode.
 *
 * Safety rules:
 * - Only typed text schedules a check; paste, drop, undo, redo, deletions and
 *   this extension's own edits never do. Unrelated selection or document updates
 *   (other plugins, Obsidian itself) do not cancel a pending check, because the
 *   check always re-reads the cursor line from the current state.
 * - A complete, exact match (the pinyin for the whole run of Chinese before it)
 *   converts straight away. Anything less certain (a partial run, a correction)
 *   waits for a short pause. Both only act for a single empty cursor, never
 *   during IME composition, and only look at the cursor's line.
 * - Fenced code, frontmatter and syntax-tree nodes for code/links/URLs/HTML are skipped.
 * - Each conversion is its own undo step (isolateHistory). An annotation that
 *   was converted (or suggested) once is remembered at its position, so after
 *   undo it is not converted again.
 */
import { isolateHistory } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { Annotation, EditorSelection, type EditorState, type Extension, Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import type { AutoOutcome, Proposal } from '../core/decide';
import { isHanChar } from '../core/chinese';
import { blockContextAt } from '../core/markdown-protect';

/** Marks transactions created by Pinyin Companion. */
export const pinyinCompanionEdit = Annotation.define<boolean>();
export const PINYIN_USER_EVENT = 'input.pinyin';

/** Exact, complete matches convert on the next tick. */
export const INSTANT_DELAY_MS = 0;
/** Less certain matches wait for this pause in typing. */
export const SETTLE_DELAY_MS = 300;
const MAX_LINE_LENGTH = 4000;
/** Input events that are not keystrokes. */
const NON_TYPING_EVENTS = ['input.paste', 'input.drop', 'input.complete', 'input.pinyin'];
const MAX_REMEMBERED = 50;
const PROTECTED_NODE = /code|frontmatter|url|link|html|math|comment|hashtag/i;

export interface DocumentSuggestion {
	/** Document offset of the start of the line; proposal offsets are relative to it. */
	lineFrom: number;
	proposals: Proposal[];
}

export interface AutoHost {
	decide(lineText: string, cursorInLine: number): AutoOutcome;
	suggest(view: EditorView, suggestion: DocumentSuggestion): void;
}

interface Remembered {
	pos: number;
	text: string;
}

function isTypedInsertion(tr: Transaction): boolean {
	if (!tr.docChanged || tr.annotation(pinyinCompanionEdit)) return false;
	if (!tr.isUserEvent('input') || NON_TYPING_EVENTS.some((event) => tr.isUserEvent(event))) return false;
	let inserted = false;
	tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, text) => {
		if (text.length > 1 || text.line(1).length > 0) inserted = true;
	});
	return inserted;
}

/** True when the proposal annotates the whole run of Chinese directly before it. */
function coversWholeRun(lineText: string, proposal: Proposal): boolean {
	const before = lineText.slice(0, proposal.chineseFrom);
	const previous = [...before].pop();
	return previous === undefined || !isHanChar(previous);
}

export function isProtectedBySyntax(state: EditorState, pos: number): boolean {
	for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
		if (PROTECTED_NODE.test(node.name)) return true;
	}
	return false;
}

/** Dispatch a replacement as its own undo step without moving the cursor unexpectedly. */
export function dispatchPinyinEdit(view: EditorView, from: number, to: number, insert: string): void {
	const changes = view.state.changes({ from, to, insert });
	const selection = view.state.selection.ranges.length === 1
		? EditorSelection.cursor(changes.mapPos(view.state.selection.main.head, 1))
		: undefined;
	view.dispatch({
		changes,
		selection,
		annotations: [pinyinCompanionEdit.of(true), isolateHistory.of('full'), Transaction.userEvent.of(PINYIN_USER_EVENT)],
	});
}

class AutoPinyinPlugin implements PluginValue {
	private timer: number | null = null;
	private remembered: Remembered[] = [];

	constructor(private readonly view: EditorView, private readonly host: AutoHost) {}

	update(update: ViewUpdate): void {
		if (update.docChanged) {
			this.remembered = this.remembered.map((r) => ({ pos: update.changes.mapPos(r.pos, -1), text: r.text }));
		}
		if (update.transactions.some(isTypedInsertion)) {
			this.schedule(INSTANT_DELAY_MS, false);
		} else if (update.transactions.some((tr) => tr.isUserEvent('undo') || tr.isUserEvent('redo'))) {
			this.cancel();
		}
	}

	destroy(): void {
		this.cancel();
	}

	private win(): Window {
		return this.view.dom.ownerDocument.defaultView ?? window;
	}

	private schedule(delayMs: number, settled: boolean): void {
		this.cancel();
		this.timer = this.win().setTimeout(() => this.run(settled), delayMs);
	}

	private cancel(): void {
		if (this.timer !== null) this.win().clearTimeout(this.timer);
		this.timer = null;
	}

	private isRemembered(pos: number, text: string): boolean {
		return this.remembered.some((r) => r.pos === pos && r.text === text);
	}

	private remember(pos: number, text: string): void {
		this.remembered = [...this.remembered, { pos, text }].slice(-MAX_REMEMBERED);
	}

	private run(settled: boolean): void {
		this.timer = null;
		try {
			this.check(settled);
		} catch (error: unknown) {
			console.error('Pinyin Companion: automatic check failed', error);
		}
	}

	private check(settled: boolean): void {
		if (this.view.composing) {
			this.schedule(SETTLE_DELAY_MS, true);
			return;
		}
		const { state } = this.view;
		if (state.readOnly || state.selection.ranges.length !== 1 || !state.selection.main.empty) return;
		const head = state.selection.main.head;
		const line = state.doc.lineAt(head);
		if (line.length === 0 || line.length > MAX_LINE_LENGTH) return;
		// Cheap line-local checks first; most keystrokes stop here without touching the rest of the note.
		if (![...line.text].some(isHanChar)) return;
		const outcome = this.host.decide(line.text, head - line.from);
		if (outcome.type === 'none') return;
		// Scanning from the top of the note for fences/frontmatter only happens when there is something to do.
		if (blockContextAt((i) => state.doc.line(i + 1).text, line.number - 1) !== 'none') return;
		const first = outcome.type === 'apply' ? outcome.proposal : outcome.proposals[0];
		if (!first) return;
		const instant = outcome.type === 'apply' && first.kind === 'exact' && coversWholeRun(line.text, first);
		if (!instant && !settled) {
			this.schedule(SETTLE_DELAY_MS, true);
			return;
		}
		const from = line.from + first.from;
		const to = line.from + first.to;
		if (isProtectedBySyntax(state, from) || isProtectedBySyntax(state, to)) return;
		if (this.isRemembered(from, first.original)) return;
		if (outcome.type === 'apply') {
			dispatchPinyinEdit(this.view, from, to, first.insert);
			this.remember(from, first.original);
			return;
		}
		this.remember(from, first.original);
		this.host.suggest(this.view, { lineFrom: line.from, proposals: outcome.proposals });
	}
}

export function createAutoPinyinExtension(host: AutoHost): Extension {
	return ViewPlugin.define((view) => new AutoPinyinPlugin(view, host));
}
