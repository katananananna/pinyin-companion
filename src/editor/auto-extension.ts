/**
 * CodeMirror 6 extension for automatic mode.
 *
 * Safety rules:
 * - Only typing (userEvent "input.type") schedules a check; paste, undo, redo,
 *   programmatic edits and this extension's own edits never do.
 * - The check runs after an idle delay, only for a single empty cursor, never
 *   during IME composition, and only looks at the cursor's line.
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
import { blockContextAt } from '../core/markdown-protect';

/** Marks transactions created by Pinyin Companion. */
export const pinyinCompanionEdit = Annotation.define<boolean>();
export const PINYIN_USER_EVENT = 'input.pinyin';

const MAX_LINE_LENGTH = 4000;
const MAX_REMEMBERED = 50;
const PROTECTED_NODE = /code|frontmatter|url|link|html|math|comment|hashtag/i;

export interface DocumentSuggestion {
	/** Document offset of the start of the line; proposal offsets are relative to it. */
	lineFrom: number;
	proposals: Proposal[];
}

export interface AutoHost {
	isEnabled(): boolean;
	idleDelayMs(): number;
	decide(lineText: string, cursorInLine: number): AutoOutcome;
	suggest(view: EditorView, suggestion: DocumentSuggestion): void;
}

interface Remembered {
	pos: number;
	text: string;
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
		const typed = update.transactions.some(
			(tr) => tr.docChanged && tr.isUserEvent('input.type') && !tr.annotation(pinyinCompanionEdit),
		);
		if (typed && this.host.isEnabled()) {
			this.schedule();
		} else if (update.docChanged || update.selectionSet) {
			this.cancel();
		}
	}

	destroy(): void {
		this.cancel();
	}

	private win(): Window {
		return this.view.dom.ownerDocument.defaultView ?? window;
	}

	private schedule(): void {
		this.cancel();
		this.timer = this.win().setTimeout(() => this.run(), this.host.idleDelayMs());
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

	private run(): void {
		this.timer = null;
		if (!this.host.isEnabled()) return;
		try {
			this.check();
		} catch (error: unknown) {
			console.error('Pinyin Companion: automatic check failed', error);
		}
	}

	private check(): void {
		if (this.view.composing || this.view.compositionStarted) {
			this.schedule();
			return;
		}
		const { state } = this.view;
		if (state.readOnly || state.selection.ranges.length !== 1 || !state.selection.main.empty) return;
		const head = state.selection.main.head;
		const line = state.doc.lineAt(head);
		if (line.length === 0 || line.length > MAX_LINE_LENGTH) return;
		if (blockContextAt((i) => state.doc.line(i + 1).text, line.number - 1) !== 'none') return;
		const outcome = this.host.decide(line.text, head - line.from);
		if (outcome.type === 'none') return;
		const first = outcome.type === 'apply' ? outcome.proposal : outcome.proposals[0];
		if (!first) return;
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
