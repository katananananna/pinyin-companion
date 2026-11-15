import { describe, expect, test } from 'vitest';
import { applyTone, comparisonKey, parseSyllable, toMarkedSyllable } from '../src/core/pinyin-normalize';
import { osaDistance, typoBudget } from '../src/core/typo';
import { isValidSyllable } from '../src/core/syllables';

describe('parseSyllable', () => {
	test('reads tone marks, tone numbers and neutral tone', () => {
		expect(parseSyllable('xué')).toMatchObject({ base: 'xue', tone: 2 });
		expect(parseSyllable('xue2')).toMatchObject({ base: 'xue', tone: 2 });
		expect(parseSyllable('men')).toMatchObject({ base: 'men', tone: 5 });
		expect(parseSyllable('men0')).toMatchObject({ base: 'men', tone: 5 });
		expect(parseSyllable('men5')).toMatchObject({ base: 'men', tone: 5 });
	});

	test('accepts ü, v and u: spellings', () => {
		expect(parseSyllable('lǜ')).toMatchObject({ base: 'lü', tone: 4 });
		expect(parseSyllable('lv4')).toMatchObject({ base: 'lü', tone: 4 });
		expect(parseSyllable('lu:4')).toMatchObject({ base: 'lü', tone: 4 });
		expect(parseSyllable('NV3')).toMatchObject({ base: 'nü', tone: 3 });
	});

	test('rejects two tone indications or junk', () => {
		expect(parseSyllable('xué2')).toBeNull();
		expect(parseSyllable('x@e')).toBeNull();
		expect(parseSyllable('')).toBeNull();
	});
});

describe('comparisonKey', () => {
	test('treats ju / jv / ju: as the same syllable but keeps lu and lü apart', () => {
		expect(comparisonKey('ju')).toBe(comparisonKey('jü'));
		expect(comparisonKey('xue')).toBe('xve');
		expect(comparisonKey('lu')).not.toBe(comparisonKey('lü'));
	});
});

describe('applyTone', () => {
	test('places marks by the standard rules', () => {
		expect(applyTone('xue', 2)).toBe('xué');
		expect(applyTone('hao', 3)).toBe('hǎo');
		expect(applyTone('gui', 4)).toBe('guì');
		expect(applyTone('liu', 2)).toBe('liú');
		expect(applyTone('zhou', 1)).toBe('zhōu');
		expect(applyTone('lüe', 4)).toBe('lüè');
		expect(applyTone('lü', 4)).toBe('lǜ');
		expect(applyTone('men', 5)).toBe('men');
	});

	test('round-trips numbered input to marked output', () => {
		expect(toMarkedSyllable('nv3')).toBe('nǚ');
		expect(toMarkedSyllable('jv2')).toBe('jú');
		expect(toMarkedSyllable('xu:e2')).toBe('xué');
		expect(toMarkedSyllable('shang4')).toBe('shàng');
	});
});

describe('syllable table', () => {
	test('knows common and rare syllables, rejects non-syllables', () => {
		for (const s of ['xue', 'zhuang', 'lü', 'nüe', 'er', 'ng', 'yo', 'den']) expect(isValidSyllable(s)).toBe(true);
		for (const s of ['xuei', 'bv', 'coffee', 'ti a']) expect(isValidSyllable(s)).toBe(false);
	});
});

describe('osaDistance', () => {
	test('counts an adjacent transposition as one edit', () => {
		expect(osaDistance('xueix', 'xuexi', 2)).toBe(1);
		expect(osaDistance('xuexi', 'xuexi', 2)).toBe(0);
		expect(osaDistance('shagnwei', 'shangwei', 1)).toBe(1);
	});

	test('stops at the budget', () => {
		expect(osaDistance('abcdef', 'uvwxyz', 1)).toBe(2);
		expect(osaDistance('a', 'abcd', 1)).toBe(2);
	});

	test('budget is zero for short input', () => {
		expect(typoBudget(4)).toBe(0);
		expect(typoBudget(5)).toBe(1);
		expect(typoBudget(9)).toBe(2);
	});
});
