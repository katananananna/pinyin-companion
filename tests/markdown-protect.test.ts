import { describe, expect, test } from 'vitest';
import { blockContextAt, inlineProtectedRanges, overlapsAny } from '../src/core/markdown-protect';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/settings';

function contextOf(doc: string, lineIndex: number) {
	const lines = doc.split('\n');
	return blockContextAt((i) => lines[i] ?? '', lineIndex);
}

describe('inline protection', () => {
	const covered = (line: string, needle: string): boolean => {
		const from = line.indexOf(needle);
		return overlapsAny(inlineProtectedRanges(line), from, from + needle.length);
	};

	test('inline code, URLs, link destinations, wiki links and HTML', () => {
		expect(covered('text `學習 xuexi` text', 'xuexi')).toBe(true);
		expect(covered('text ``a `學習 xuexi` b`` text', 'xuexi')).toBe(true);
		expect(covered('see https://ex.com/學習xuexi now', 'xuexi')).toBe(true);
		expect(covered('see www.ex.com/xuexi now', 'xuexi')).toBe(true);
		expect(covered('[學習](學習 xuexi) 回饋 hui', 'xuexi')).toBe(true);
		expect(covered('[[學習 xuexi]]', 'xuexi')).toBe(true);
		expect(covered('<span title="學習 xuexi">', 'xuexi')).toBe(true);
		expect(covered('<!-- 學習 xuexi -->', 'xuexi')).toBe(true);
	});

	test('ordinary text and link text stay editable', () => {
		const line = '[學習 xuexi](https://ex.com) 回饋 hui kui';
		expect(covered(line, 'hui kui')).toBe(false);
		expect(covered(line, 'xuexi')).toBe(false);
		expect(covered('a ` lone backtick 學習 xuexi', 'xuexi')).toBe(false);
	});
});

describe('block context', () => {
	const doc = ['---', 'title: 學習 xuexi', '---', '正文 zheng wen', '```js', '學習 xuexi', '```', '回饋 hui kui', '~~~~', '```', 'still code', '~~~~', '> ```', '> 引用 code', '> ```', 'after'].join('\n');

	test('frontmatter, fenced code (``` and ~~~, nested markers, quotes) and normal text', () => {
		expect(contextOf(doc, 0)).toBe('frontmatter');
		expect(contextOf(doc, 1)).toBe('frontmatter');
		expect(contextOf(doc, 2)).toBe('frontmatter');
		expect(contextOf(doc, 3)).toBe('none');
		expect(contextOf(doc, 4)).toBe('code');
		expect(contextOf(doc, 5)).toBe('code');
		expect(contextOf(doc, 6)).toBe('code');
		expect(contextOf(doc, 7)).toBe('none');
		expect(contextOf(doc, 9)).toBe('code');
		expect(contextOf(doc, 10)).toBe('code');
		expect(contextOf(doc, 13)).toBe('code');
		expect(contextOf(doc, 15)).toBe('none');
	});

	test('a horizontal rule later in the note is not frontmatter', () => {
		expect(contextOf('正文\n---\n學習 xuexi', 2)).toBe('none');
	});

	test('very deep lines are reported as unknown', () => {
		expect(blockContextAt(() => 'x', 30, 10)).toBe('unknown');
	});
});

describe('settings sanitising', () => {
	test('defaults for missing or broken data', () => {
		expect(sanitizeSettings(undefined)).toEqual({ ...DEFAULT_SETTINGS, overrides: [] });
		expect(sanitizeSettings('nonsense')).toEqual({ ...DEFAULT_SETTINGS, overrides: [] });
	});

	test('clamps the delay, validates the separator and drops invalid overrides', () => {
		const result = sanitizeSettings({
			autoMode: true,
			idleDelayMs: 10,
			separator: 'brackets',
			overrides: [
				{ phrase: '理髮', pinyin: 'li3 fa4' },
				{ phrase: 'abc', pinyin: 'a b c' },
				{ phrase: '理髮', pinyin: 'lǐ fā' },
				'junk',
			],
		});
		expect(result.autoMode).toBe(true);
		expect(result.idleDelayMs).toBe(300);
		expect(result.separator).toBe('space');
		expect(result.overrides).toEqual([{ phrase: '理髮', pinyin: 'lǐ fā' }]);
		expect(sanitizeSettings({ idleDelayMs: 99999 }).idleDelayMs).toBe(5000);
	});

	test('trigger settings are validated', () => {
		expect(sanitizeSettings({ autoTrigger: 'brackets', removeBrackets: true })).toMatchObject({ autoTrigger: 'brackets', removeBrackets: true });
		expect(sanitizeSettings({ autoTrigger: 'weird', removeBrackets: 'yes' })).toMatchObject({ autoTrigger: 'anywhere', removeBrackets: false });
	});

	test('does not mutate the defaults', () => {
		const result = sanitizeSettings({});
		result.overrides.push({ phrase: '學', pinyin: 'xué' });
		expect(DEFAULT_SETTINGS.overrides).toEqual([]);
	});
});
