// @vitest-environment jsdom
import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { decideAutomatic } from '../src/core/decide';
import { Pronouncer } from '../src/core/pronouncer';
import { createAutoPinyinExtension, type AutoHost, type DocumentSuggestion } from '../src/editor/auto-extension';

// jsdom does not implement layout; CodeMirror's measuring needs these to exist.
Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const DELAY = 700;
const pronouncer = new Pronouncer({ markYiBuSandhi: false, overrides: new Map() });

interface Harness {
	view: EditorView;
	suggestions: DocumentSuggestion[];
	setEnabled(enabled: boolean): void;
}

function setup(doc: string, cursor = doc.length): Harness {
	let enabled = true;
	const suggestions: DocumentSuggestion[] = [];
	const host: AutoHost = {
		isEnabled: () => enabled,
		idleDelayMs: () => DELAY,
		decide: (line, pos) => decideAutomatic(line, pos, pronouncer, { separator: 'space', suggestions: true }),
		suggest: (_view, suggestion) => suggestions.push(suggestion),
	};
	const view = new EditorView({
		state: EditorState.create({
			doc,
			selection: EditorSelection.cursor(cursor),
			extensions: [history(), EditorState.allowMultipleSelections.of(true), createAutoPinyinExtension(host)],
		}),
		parent: document.body,
	});
	return { view, suggestions, setEnabled: (value) => (enabled = value) };
}

/** Simulate typing at the cursor, one transaction per character like the browser does. */
function type(view: EditorView, text: string, userEvent = 'input.type'): void {
	for (const ch of text) {
		const head = view.state.selection.main.head;
		view.dispatch({ changes: { from: head, insert: ch }, selection: EditorSelection.cursor(head + ch.length), userEvent });
	}
}

const doc = (view: EditorView): string => view.state.doc.toString();

describe('automatic mode in a CodeMirror editor', () => {
	let harness: Harness | null = null;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		harness?.view.destroy();
		harness = null;
		vi.useRealTimers();
	});

	test('converts after the idle delay, keeps the cursor at the end', () => {
		harness = setup('我們在 ');
		type(harness.view, 'xuexi');
		expect(doc(harness.view)).toBe('我們在 xuexi');
		harness.view.dispatch({ changes: { from: 0, to: 3, insert: '學習' }, selection: EditorSelection.cursor(8), userEvent: 'input.type' });
		vi.advanceTimersByTime(DELAY - 1);
		expect(doc(harness.view)).toBe('學習 xuexi');
		vi.advanceTimersByTime(1);
		expect(doc(harness.view)).toBe('學習 xué xí');
		expect(harness.view.state.selection.main.head).toBe('學習 xué xí'.length);
	});

	test('typing again before the delay postpones the check', () => {
		harness = setup('尚未成熟 ');
		type(harness.view, 'shang wei cheng sh');
		vi.advanceTimersByTime(DELAY - 100);
		type(harness.view, 'u');
		vi.advanceTimersByTime(DELAY - 100);
		expect(doc(harness.view)).toBe('尚未成熟 shang wei cheng shu');
		vi.advanceTimersByTime(100);
		expect(doc(harness.view)).toBe('尚未成熟 shàng wèi chéng shú');
	});

	test('the conversion is its own undo step and is not re-applied after undo', () => {
		harness = setup('學習 ');
		type(harness.view, 'xuexi');
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('學習 xué xí');
		undo(harness.view);
		expect(doc(harness.view)).toBe('學習 xuexi');
		vi.advanceTimersByTime(DELAY * 3);
		expect(doc(harness.view)).toBe('學習 xuexi');
		type(harness.view, ' ');
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('學習 xuexi ');
	});

	test('paste and programmatic edits do not trigger conversion', () => {
		harness = setup('學習 ');
		type(harness.view, 'xuexi', 'input.paste');
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('學習 xuexi');
		harness.view.dispatch({ changes: { from: harness.view.state.doc.length, insert: ' ' } });
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('學習 xuexi ');
	});

	test('does nothing while disabled', () => {
		harness = setup('學習 ');
		harness.setEnabled(false);
		type(harness.view, 'xuexi');
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('學習 xuexi');
	});

	test('never rewrites during IME composition', () => {
		harness = setup('學習 ');
		let composing = true;
		Object.defineProperty(harness.view, 'composing', { get: () => composing });
		type(harness.view, 'xuexi', 'input.type.compose');
		vi.advanceTimersByTime(DELAY * 2);
		expect(doc(harness.view)).toBe('學習 xuexi');
		composing = false;
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('學習 xué xí');
	});

	test('moving the cursor away cancels the pending check', () => {
		harness = setup('學習 ');
		type(harness.view, 'xuexi');
		harness.view.dispatch({ selection: EditorSelection.cursor(0) });
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('學習 xuexi');
	});

	test('skips fenced code blocks and frontmatter', () => {
		harness = setup('```\n學習 ');
		type(harness.view, 'xuexi');
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('```\n學習 xuexi');
		harness.view.destroy();
		harness = setup('---\ntitle: 學習 ');
		type(harness.view, 'xuexi');
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('---\ntitle: 學習 xuexi');
	});

	test('skips inline code', () => {
		harness = setup('`學習 ');
		type(harness.view, 'xuexi`');
		harness.view.dispatch({ selection: EditorSelection.cursor(harness.view.state.doc.length - 1) });
		type(harness.view, 'x');
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('`學習 xuexix`');
	});

	test('does not act with multiple selections', () => {
		harness = setup('學習 xuex\n回饋 hui ku');
		const view = harness.view;
		view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(7), EditorSelection.cursor(view.state.doc.length)]) });
		view.dispatch(view.state.replaceSelection('i'), { userEvent: 'input.type' });
		vi.advanceTimersByTime(DELAY);
		expect(doc(view)).toBe('學習 xuexi\n回饋 hui kui');
	});

	test('typos become a suggestion and the text is unchanged', () => {
		harness = setup('學習 ');
		type(harness.view, 'xueix');
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('學習 xueix');
		expect(harness.suggestions).toHaveLength(1);
		expect(harness.suggestions[0]).toMatchObject({ lineFrom: 0, proposals: [{ from: 3, to: 8, chineseFrom: 0, insert: 'xué xí' }] });
		type(harness.view, ' ');
		vi.advanceTimersByTime(DELAY);
		expect(harness.suggestions).toHaveLength(1);
	});

	test('edits only the annotation at the cursor on a line with several', () => {
		harness = setup('回饋 hui kui，學習 ');
		type(harness.view, 'xuexi');
		vi.advanceTimersByTime(DELAY);
		expect(doc(harness.view)).toBe('回饋 hui kui，學習 xué xí');
	});

	test('destroying the view clears the pending timer', () => {
		harness = setup('學習 ');
		type(harness.view, 'xuexi');
		harness.view.destroy();
		expect(() => vi.advanceTimersByTime(DELAY)).not.toThrow();
		expect(vi.getTimerCount()).toBe(0);
		harness = null;
	});
});
