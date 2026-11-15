import { describe, expect, test } from 'vitest';
import { buildOverrideMap, validateOverride } from '../src/core/overrides';
import { Pronouncer, readingScript } from '../src/core/pronouncer';

const plain = (options: Partial<{ markYiBuSandhi: boolean; overrides: ReadonlyMap<string, readonly string[]> }> = {}): Pronouncer =>
	new Pronouncer({ markYiBuSandhi: options.markYiBuSandhi ?? false, overrides: options.overrides ?? new Map() });

const read = (p: Pronouncer, text: string): string => p.readings(text).map((r) => r?.marked ?? '∅').join(' ');

describe('Pronouncer readings (values verified against pinyin-pro 3.29.5 + opencc-js 1.4.2)', () => {
	const p = plain();

	test('examples from the specification', () => {
		expect(read(p, '局限於')).toBe('jú xiàn yú');
		expect(read(p, '尚未成熟')).toBe('shàng wèi chéng shú');
		expect(read(p, '潛移默化')).toBe('qián yí mò huà');
		expect(read(p, '回饋')).toBe('huí kuì');
		expect(read(p, '學習')).toBe('xué xí');
	});

	test('Traditional and Simplified give the same readings', () => {
		const pairs: [string, string][] = [
			['還是', '还是'],
			['銀行', '银行'],
			['為了', '为了'],
			['中間', '中间'],
			['我們', '我们'],
			['乾淨', '干净'],
		];
		for (const [traditional, simplified] of pairs) expect(read(p, traditional)).toBe(read(p, simplified));
		expect(read(p, '還是')).toBe('hái shì');
		expect(read(p, '我們')).toBe('wǒ men');
	});

	test('polyphonic characters follow the word', () => {
		expect(read(p, '銀行')).toBe('yín háng');
		expect(read(p, '行走')).toBe('xíng zǒu');
		expect(read(p, '長大')).toBe('zhǎng dà');
		expect(read(p, '重複')).toBe('chóng fù');
		expect(read(p, '重要')).toBe('zhòng yào');
		expect(read(p, '音樂')).toBe('yīn yuè');
		expect(read(p, '快樂')).toBe('kuài lè');
		expect(read(p, '看著')).toBe('kàn zhe');
		expect(read(p, '著名')).toBe('zhù míng');
		expect(read(p, '乾隆')).toBe('qián lóng');
	});

	test('context of a longer run selects the reading of the suffix', () => {
		const readings = p.readings('我在銀行工作');
		expect(readings[3]?.marked).toBe('háng');
	});

	test('dictionary style by default; 一/不 tone changes only when enabled', () => {
		expect(read(p, '一個')).toBe('yī gè');
		expect(read(p, '不是')).toBe('bù shì');
		const spoken = plain({ markYiBuSandhi: true });
		expect(read(spoken, '一個')).toBe('yí gè');
		expect(read(spoken, '一天')).toBe('yì tiān');
		expect(read(spoken, '不是')).toBe('bú shì');
		expect(read(spoken, '第一')).toBe('dì yī');
		expect(read(spoken, '你好')).toBe('nǐ hǎo');
		expect(read(spoken, '一個不是')).toBe('yí gè bú shì');
		expect(read(p, '一個不是')).toBe('yī gè bù shì');
	});

	test('non-Han characters have no reading', () => {
		expect(p.readings('學，A')).toEqual([expect.objectContaining({ marked: 'xué' }), null, null]);
		expect(p.readings('々')).toEqual([null]);
	});

	test('reading script never changes the character count', () => {
		const text = '看著乾淨的頭髮，計程車';
		expect(Array.from(readingScript(text))).toHaveLength(Array.from(text).length);
		expect(readingScript('計程車')).toBe('计程车');
	});

	test('alternatives include other valid readings', () => {
		const alts = p.alternatives('長');
		expect(alts[0]?.map((r) => r.marked)).toEqual(expect.arrayContaining(['zhǎng', 'cháng']));
	});
});

describe('overrides', () => {
	test('validation normalises numbers and v, and rejects mismatches', () => {
		expect(validateOverride('理髮', 'li3 fa4')).toEqual({ ok: true, entry: { phrase: '理髮', pinyin: 'lǐ fà' } });
		expect(validateOverride(' 綠 ', 'lv4')).toEqual({ ok: true, entry: { phrase: '綠', pinyin: 'lǜ' } });
		expect(validateOverride('理髮', 'lifa')).toMatchObject({ ok: false });
		expect(validateOverride('理a', 'li a')).toMatchObject({ ok: false });
		expect(validateOverride('理髮', 'li3 fxa4')).toMatchObject({ ok: false });
		expect(validateOverride('', 'li')).toMatchObject({ ok: false });
	});

	test('exact override wins over the library, including inside a longer run', () => {
		const p = plain({ overrides: new Map(buildOverrideMap([{ phrase: '理髮', pinyin: 'lǐ fà' }])) });
		expect(read(plain(), '理髮')).toBe('lǐ fā');
		expect(read(p, '理髮')).toBe('lǐ fà');
		expect(read(p, '我去理髮店')).toBe('wǒ qù lǐ fà diàn');
		expect(read(p, '理发')).toBe('lǐ fā');
	});

	test('longest override match wins', () => {
		const overrides = buildOverrideMap([
			{ phrase: '行', pinyin: 'xíng' },
			{ phrase: '銀行', pinyin: 'yín háng' },
		]);
		const p = new Pronouncer({ markYiBuSandhi: false, overrides });
		expect(read(p, '銀行')).toBe('yín háng');
	});

	test('overrides are scoped to one instance and do not leak', () => {
		const withOverride = plain({ overrides: new Map([['學習', ['xuě', 'xǐ']]]) });
		expect(read(withOverride, '學習')).toBe('xuě xǐ');
		expect(read(plain(), '學習')).toBe('xué xí');
	});
});
