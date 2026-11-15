import { beforeEach, describe, expect, test } from 'vitest';
import type { App, Editor } from 'obsidian';
import { correctPinyinAtCursor, insertPinyinAfterSelection, type CommandContext } from '../src/commands';
import type { Proposal } from '../src/core/decide';
import { Pronouncer } from '../src/core/pronouncer';
import { notices, openedModals, type EditorPosition, type SuggestModal } from './support/obsidian-stub';

/** In-memory implementation of the Editor methods the commands use. */
class FakeEditor {
	lines: string[];
	anchor: EditorPosition;
	head: EditorPosition;
	extraSelections = 0;

	constructor(text: string, anchor: EditorPosition, head: EditorPosition = anchor) {
		this.lines = text.split('\n');
		this.anchor = anchor;
		this.head = head;
	}

	getValue(): string {
		return this.lines.join('\n');
	}
	getLine(line: number): string {
		return this.lines[line] ?? '';
	}
	listSelections(): { anchor: EditorPosition; head: EditorPosition }[] {
		return Array.from({ length: 1 + this.extraSelections }, () => ({ anchor: this.anchor, head: this.head }));
	}
	getCursor(which: 'from' | 'to' | 'head' | 'anchor' = 'head'): EditorPosition {
		const [a, b] = [this.anchor, this.head];
		const aFirst = a.line < b.line || (a.line === b.line && a.ch <= b.ch);
		if (which === 'from') return aFirst ? a : b;
		if (which === 'to') return aFirst ? b : a;
		return which === 'anchor' ? a : b;
	}
	setCursor(pos: EditorPosition): void {
		this.anchor = pos;
		this.head = pos;
	}
	replaceRange(text: string, from: EditorPosition, to: EditorPosition = from): void {
		if (from.line !== to.line) throw new Error('fake editor supports single-line edits only');
		const line = this.getLine(from.line);
		this.lines[from.line] = line.slice(0, from.ch) + text + line.slice(to.ch);
	}
}

const ctx: CommandContext = {
	app: {} as App,
	pronouncer: new Pronouncer({ markYiBuSandhi: false, overrides: new Map() }),
	separator: 'space',
	removeBrackets: false,
};
const asEditor = (e: FakeEditor): Editor => e as unknown as Editor;

beforeEach(() => {
	notices.length = 0;
	openedModals.length = 0;
});

describe('Insert pinyin after selected Chinese', () => {
	test('inserts after the selection and moves the cursor after the pinyin', () => {
		const editor = new FakeEditor('他說尚未成熟。', { line: 0, ch: 2 }, { line: 0, ch: 6 });
		insertPinyinAfterSelection(asEditor(editor), ctx);
		expect(editor.getValue()).toBe('他說尚未成熟 shàng wèi chéng shú。');
		expect(editor.head).toEqual({ line: 0, ch: 6 + ' shàng wèi chéng shú'.length });
	});

	test('backwards selection works the same', () => {
		const editor = new FakeEditor('回饋', { line: 0, ch: 2 }, { line: 0, ch: 0 });
		insertPinyinAfterSelection(asEditor(editor), ctx);
		expect(editor.getValue()).toBe('回饋 huí kuì');
	});

	test('invalid, empty, multi-line and multiple selections show a notice and change nothing', () => {
		const cases: FakeEditor[] = [
			new FakeEditor('學習 abc', { line: 0, ch: 0 }, { line: 0, ch: 6 }),
			new FakeEditor('學習', { line: 0, ch: 1 }),
			new FakeEditor('學\n習', { line: 0, ch: 0 }, { line: 1, ch: 1 }),
		];
		const multi = new FakeEditor('學習', { line: 0, ch: 0 }, { line: 0, ch: 2 });
		multi.extraSelections = 1;
		cases.push(multi);
		for (const editor of cases) {
			const before = editor.getValue();
			insertPinyinAfterSelection(asEditor(editor), ctx);
			expect(editor.getValue()).toBe(before);
		}
		expect(notices).toHaveLength(cases.length);
	});
});

describe('Correct pinyin annotation at cursor', () => {
	test('replaces only the pinyin and keeps the cursor after it', () => {
		const end = '前文。局限於 ju xian yu'.length;
		const editor = new FakeEditor('前文。局限於 ju xian yu，後文', { line: 0, ch: end });
		correctPinyinAtCursor(asEditor(editor), ctx);
		expect(editor.getValue()).toBe('前文。局限於 jú xiàn yú，後文');
		expect(editor.head).toEqual({ line: 0, ch: end });
	});

	test('cursor inside the pinyin ends at the end of the new pinyin', () => {
		const editor = new FakeEditor('學習 xuexi 很好', { line: 0, ch: 5 });
		correctPinyinAtCursor(asEditor(editor), ctx);
		expect(editor.getValue()).toBe('學習 xué xí 很好');
		expect(editor.head).toEqual({ line: 0, ch: 9 });
	});

	test('uncertain cases open the chooser; choosing applies, the line is otherwise untouched', () => {
		const editor = new FakeEditor('學習 xueix', { line: 0, ch: 8 });
		correctPinyinAtCursor(asEditor(editor), ctx);
		expect(editor.getValue()).toBe('學習 xueix');
		expect(openedModals).toHaveLength(1);
		const modal = openedModals[0] as SuggestModal<Proposal>;
		const options = modal.getSuggestions('');
		expect(options.map((p) => p.insert)).toEqual(['xué xí']);
		const first = options[0];
		if (!first) throw new Error('no option');
		modal.onChooseSuggestion(first, {} as KeyboardEvent);
		expect(editor.getValue()).toBe('學習 xué xí');
	});

	test('choosing after the line changed does nothing', () => {
		const editor = new FakeEditor('學習 xueix', { line: 0, ch: 8 });
		correctPinyinAtCursor(asEditor(editor), ctx);
		editor.lines[0] = '學習 xueix!';
		const modal = openedModals[0] as SuggestModal<Proposal>;
		const first = modal.getSuggestions('')[0];
		if (!first) throw new Error('no option');
		modal.onChooseSuggestion(first, {} as KeyboardEvent);
		expect(editor.getValue()).toBe('學習 xueix!');
		expect(notices.at(-1)).toMatch(/line changed/);
	});

	test('already-correct and non-annotation lines only show a notice', () => {
		for (const text of ['學習 xué xí', 'plain English', '']) {
			const editor = new FakeEditor(text, { line: 0, ch: text.length });
			correctPinyinAtCursor(asEditor(editor), ctx);
			expect(editor.getValue()).toBe(text);
		}
		expect(notices).toHaveLength(3);
		expect(notices[0]).toMatch(/already correct/);
	});
});
