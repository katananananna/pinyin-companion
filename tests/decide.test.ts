import { describe, expect, test } from 'vitest';
import { findRegions } from '../src/core/annotation';
import { correctAtCursor, decideAutomatic, planSelectionInsert, type Proposal } from '../src/core/decide';
import { Pronouncer } from '../src/core/pronouncer';

const pronouncer = new Pronouncer({ markYiBuSandhi: false, overrides: new Map() });

function applyProposal(line: string, p: Proposal): string {
	return line.slice(0, p.from) + p.insert + line.slice(p.to);
}

/** Run the correction command with the cursor at the end of `line` (or at `|`). */
function correct(input: string, separator: 'space' | 'parentheses' = 'space') {
	const cursor = input.includes('|') ? input.indexOf('|') : input.length;
	const line = input.replace('|', '');
	return { line, outcome: correctAtCursor(line, cursor, pronouncer, separator) };
}

function corrected(input: string, separator: 'space' | 'parentheses' = 'space'): string {
	const { line, outcome } = correct(input, separator);
	if (outcome.type !== 'apply') throw new Error(`expected apply, got ${outcome.type}: ${JSON.stringify(outcome)}`);
	return applyProposal(line, outcome.proposal);
}

function auto(input: string, suggestions = true, extra: { bracketsOnly?: boolean; removeBrackets?: boolean } = {}) {
	const cursor = input.includes('|') ? input.indexOf('|') : input.length;
	const line = input.replace('|', '');
	const options = { separator: 'space' as const, suggestions, bracketsOnly: false, removeBrackets: false, ...extra };
	return { line, outcome: decideAutomatic(line, cursor, pronouncer, options) };
}

/** Result of automatic mode applied to the line, or the line itself when nothing happens. */
function autoResult(input: string, extra: { bracketsOnly?: boolean; removeBrackets?: boolean } = {}): string {
	const { line, outcome } = auto(input, true, extra);
	return outcome.type === 'apply' ? applyProposal(line, outcome.proposal) : line;
}

describe('correct pinyin annotation at cursor', () => {
	test('specification examples', () => {
		expect(corrected('局限於 ju xian yu')).toBe('局限於 jú xiàn yú');
		expect(corrected('尚未成熟 shang wei cheng shu')).toBe('尚未成熟 shàng wèi chéng shú');
		expect(corrected('潛移默化 qian yi mo hua')).toBe('潛移默化 qián yí mò huà');
		expect(corrected('回饋 hui kui')).toBe('回饋 huí kuì');
		expect(corrected('學習 xuexi')).toBe('學習 xué xí');
	});

	test('Simplified Chinese', () => {
		expect(corrected('学习 xuexi')).toBe('学习 xué xí');
		expect(corrected('银行 yin hang')).toBe('银行 yín háng');
	});

	test('joined, numbered, v and u: input', () => {
		expect(corrected('潛移默化 qianyimohua')).toBe('潛移默化 qián yí mò huà');
		expect(corrected('學習 xue2xi2')).toBe('學習 xué xí');
		expect(corrected('學習 xue2 xi2')).toBe('學習 xué xí');
		expect(corrected('綠色 lv se')).toBe('綠色 lǜ sè');
		expect(corrected('綠色 lu:4 se4')).toBe('綠色 lǜ sè');
		expect(corrected('局限 jv xian')).toBe('局限 jú xiàn');
		expect(corrected('學習 XUE XI')).toBe('學習 xué xí');
	});

	test('already-correct annotations are left alone', () => {
		expect(correct('學習 xué xí').outcome.type).toBe('unchanged');
		expect(correct('我們 wǒ men').outcome.type).toBe('unchanged');
	});

	test('typed tones that disagree produce a choice, not a silent change', () => {
		const { outcome } = correct('學習 xue4 xi2');
		expect(outcome.type).toBe('choose');
		if (outcome.type !== 'choose') return;
		expect(outcome.proposals.map((p) => p.insert)).toEqual(['xué xí', 'xuè xí']);
	});

	test('a different valid reading of a polyphonic character produces a choice', () => {
		const { outcome } = correct('長大 chang da');
		expect(outcome.type).toBe('choose');
		if (outcome.type !== 'choose') return;
		expect(outcome.proposals.map((p) => p.insert)).toEqual(['cháng dà', 'zhǎng dà']);
	});

	test('small transposition typo is suggested', () => {
		const { outcome } = correct('學習 xueix');
		expect(outcome.type).toBe('choose');
		if (outcome.type !== 'choose') return;
		expect(outcome.proposals).toHaveLength(1);
		expect(outcome.proposals[0]).toMatchObject({ insert: 'xué xí', kind: 'typo', chinese: '學習' });
	});

	test('short ambiguous input is not corrected', () => {
		expect(correct('學習 xie').outcome.type).toBe('none');
		expect(correct('好 hap').outcome.type).toBe('none');
		expect(correct('女 nu').outcome).toMatchObject({ type: 'choose' });
	});

	test('chooses the phrase boundary after a longer sentence', () => {
		expect(corrected('我今天在圖書館學習 xuexi')).toBe('我今天在圖書館學習 xué xí');
		expect(corrected('他說這個想法尚未成熟 shang wei cheng shu')).toBe('他說這個想法尚未成熟 shàng wèi chéng shú');
		expect(corrected('我在銀行 yin hang')).toBe('我在銀行 yín háng');
	});

	test('annotation after a full four-character idiom and a whole sentence', () => {
		expect(corrected('潛移默化 qian yi mo hua')).toBe('潛移默化 qián yí mò huà');
		expect(corrected('我在銀行工作 wo zai yin hang gong zuo')).toBe('我在銀行工作 wǒ zài yín háng gōng zuò');
	});

	test('multiple annotations on one line: only the one at the cursor changes', () => {
		const line = '學習 xue xi，回饋 hui kui，局限於 ju xian yu';
		expect(corrected(line)).toBe('學習 xue xi，回饋 hui kui，局限於 jú xiàn yú');
		expect(corrected('學習 xue xi|，回饋 hui kui')).toBe('學習 xué xí，回饋 hui kui');
		expect(corrected('學習 xue xi，回饋 hui| kui')).toBe('學習 xue xi，回饋 huí kuì');
	});

	test('repeated phrases: the occurrence at the cursor is edited', () => {
		expect(corrected('學習 xuexi 學習 xuexi|')).toBe('學習 xuexi 學習 xué xí');
		expect(corrected('學習 xuexi| 學習 xuexi')).toBe('學習 xué xí 學習 xuexi');
	});

	test('cursor inside the pinyin or inside the Chinese', () => {
		expect(corrected('局限於 ju xi|an yu')).toBe('局限於 jú xiàn yú');
		expect(corrected('局|限於 ju xian yu')).toBe('局限於 jú xiàn yú');
	});

	test('punctuation and whitespace around the annotation are preserved', () => {
		expect(corrected('「回饋  hui kui」。')).toBe('「回饋  huí kuì」。');
		expect(corrected('（學習 xuexi）')).toBe('（學習 xué xí）');
		expect(corrected('  - **回饋** hui kui!')).toBe('  - **回饋** huí kuì!');
	});

	test('English after the pinyin is untouched', () => {
		expect(corrected('學習 xuexi| is fun')).toBe('學習 xué xí is fun');
		const { outcome } = correct('我用 Obsidian 寫作');
		expect(outcome.type).toBe('none');
		expect(correct('我喜歡 coffee').outcome.type).toBe('none');
	});

	test('parentheses: existing wrapper is kept, new output follows the setting', () => {
		expect(corrected('學習 (xuexi)')).toBe('學習 (xué xí)');
		expect(corrected('學習（xue xi）')).toBe('學習（xué xí）');
		expect(corrected('學習 xuexi', 'parentheses')).toBe('學習 (xué xí)');
		expect(correct('學習 xué xí', 'parentheses').outcome.type).toBe('unchanged');
	});

	test('protected inline Markdown is not edited', () => {
		expect(correct('`學習 xuexi`').outcome.type).toBe('none');
		expect(correct('[[學習 xuexi]]').outcome.type).toBe('none');
		expect(correct('https://example.com/學習xuexi').outcome.type).toBe('none');
	});

	test('no annotation or empty line', () => {
		expect(correct('').outcome.type).toBe('none');
		expect(correct('just english').outcome.type).toBe('none');
		expect(correct('學習').outcome.type).toBe('none');
	});
});

describe('automatic mode decisions', () => {
	test('applies a unique exact match ending at the cursor', () => {
		const { line, outcome } = auto('尚未成熟 shang wei cheng shu');
		expect(outcome.type).toBe('apply');
		if (outcome.type === 'apply') expect(applyProposal(line, outcome.proposal)).toBe('尚未成熟 shàng wèi chéng shú');
	});

	test('waits while the annotation is incomplete', () => {
		expect(auto('尚未成熟 shang wei').outcome.type).toBe('none');
		expect(auto('學習 xue').outcome.type).toBe('none');
		// "xie" fits the last 謝 alone, but could be the start of "xie xie".
		expect(auto('謝謝 xie').outcome.type).toBe('none');
		const done = auto('謝謝 xie xie');
		expect(done.outcome.type).toBe('apply');
		if (done.outcome.type === 'apply') expect(applyProposal(done.line, done.outcome.proposal)).toBe('謝謝 xiè xiè');
	});

	test('accepts trailing space or punctuation but not mid-word cursors', () => {
		expect(auto('學習 xuexi ').outcome.type).toBe('apply');
		expect(auto('學習 xuexi，').outcome.type).toBe('apply');
		expect(auto('學習 xue|xi').outcome.type).toBe('none');
	});

	test('never rewrites tone-marked text or English', () => {
		expect(auto('學習 xué xi').outcome.type).toBe('none');
		expect(auto('我喜歡 coffee').outcome.type).toBe('none');
		expect(auto('學習 xuexi is').outcome.type).toBe('none');
	});

	test('typos and alternative readings become suggestions only', () => {
		expect(auto('學習 xueix').outcome).toMatchObject({ type: 'suggest', proposals: [{ insert: 'xué xí' }] });
		expect(auto('長大 chang da').outcome).toMatchObject({ type: 'suggest' });
		expect(auto('學習 xueix', false).outcome.type).toBe('none');
	});

	test('no suggestion while the user is still typing a prefix of the reading', () => {
		expect(auto('尚未成熟 shang wei cheng sh').outcome.type).toBe('none');
	});

	test('numbered input is converted when tones agree', () => {
		const { line, outcome } = auto('學習 xue2 xi2');
		expect(outcome.type).toBe('apply');
		if (outcome.type === 'apply') expect(applyProposal(line, outcome.proposal)).toBe('學習 xué xí');
	});

	test('auto-closed parenthesis after the cursor', () => {
		const { line, outcome } = auto('學習 (xuexi|)');
		expect(outcome.type).toBe('apply');
		if (outcome.type === 'apply') expect(applyProposal(line, outcome.proposal)).toBe('學習 (xué xí)');
	});
});

describe('insert pinyin after selected Chinese', () => {
	test('inserts after the selection and keeps the Chinese', () => {
		const line = '尚未成熟';
		const plan = planSelectionInsert(line, 0, line.length, pronouncer, 'space');
		expect(plan).toEqual({ ok: true, at: 4, insert: ' shàng wèi chéng shú' });
	});

	test('works on part of a line, with punctuation and parentheses', () => {
		const line = '他說：尚未成熟，還要學習。然後';
		const from = line.indexOf('尚');
		const to = line.indexOf('然');
		expect(planSelectionInsert(line, from, to, pronouncer, 'space')).toEqual({
			ok: true,
			at: to,
			insert: ' shàng wèi chéng shú, hái yào xué xí.',
		});
		expect(planSelectionInsert('回饋', 0, 2, pronouncer, 'parentheses')).toEqual({ ok: true, at: 2, insert: ' (huí kuì)' });
	});

	test('trims surrounding whitespace and accepts reversed ranges', () => {
		expect(planSelectionInsert(' 學習 ', 6, 0, pronouncer, 'space')).toEqual({ ok: true, at: 3, insert: ' xué xí' });
	});

	test('rejects empty, mixed and non-Chinese selections', () => {
		expect(planSelectionInsert('學習', 1, 1, pronouncer, 'space')).toMatchObject({ ok: false });
		expect(planSelectionInsert('學習abc', 0, 5, pronouncer, 'space')).toMatchObject({ ok: false });
		expect(planSelectionInsert('，。', 0, 2, pronouncer, 'space')).toMatchObject({ ok: false });
		expect(planSelectionInsert('學 習', 0, 3, pronouncer, 'space')).toMatchObject({ ok: false });
	});

	test('Traditional selection gets correct readings', () => {
		expect(planSelectionInsert('還是局限於此', 0, 6, pronouncer, 'space')).toMatchObject({ insert: ' hái shì jú xiàn yú cǐ' });
	});
});

describe('region scanning', () => {
	test('finds each annotation on a line', () => {
		const regions = findRegions('學習 xue xi，回饋 hui kui 然後 English');
		expect(regions.map((r) => r.han.map((c) => c.ch).join(''))).toEqual(['學習', '回饋', '然後']);
		expect(regions.map((r) => r.tokens.map((t) => t.text))).toEqual([['xue', 'xi'], ['hui', 'kui'], ['English']]);
	});

	test('an unclosed parenthesis is not an annotation', () => {
		expect(findRegions('學習 (xuexi')).toEqual([]);
	});
});

describe('bracket triggers', () => {
	test('square, full-width and round brackets are all recognised, brackets kept by default', () => {
		expect(autoResult('學習 [xuexi|]')).toBe('學習 [xué xí]');
		expect(autoResult('學習[xuexi|]')).toBe('學習[xué xí]');
		expect(autoResult('學習 【xuexi|】')).toBe('學習 【xué xí】');
		expect(autoResult('學習 (xuexi|)')).toBe('學習 (xué xí)');
		expect(autoResult('學習（xuexi|）')).toBe('學習（xué xí）');
	});

	test('removeBrackets drops the typed brackets and the cursor can sit after them', () => {
		const opts = { removeBrackets: true };
		expect(autoResult('學習 [xuexi|]', opts)).toBe('學習 xué xí');
		expect(autoResult('學習 [xuexi]|', opts)).toBe('學習 xué xí');
		expect(autoResult('學習 【xuexi|】', opts)).toBe('學習 xué xí');
		expect(autoResult('我今天學習 (xuexi|) 很好', opts)).toBe('我今天學習 xué xí 很好');
		expect(corrected('學習 [xuexi]')).toBe('學習 [xué xí]');
	});

	test('brackets-only mode ignores unbracketed pinyin but still converts bracketed pinyin', () => {
		expect(autoResult('學習 xuexi', { bracketsOnly: true })).toBe('學習 xuexi');
		expect(autoResult('學習 [xuexi|]', { bracketsOnly: true, removeBrackets: true })).toBe('學習 xué xí');
	});

	test('ordinary notes in brackets are left alone', () => {
		for (const text of ['我喜歡 [coffee|]', '學習 (study|)', '回饋 [feedback|]', '學習 [see page 3|]', '學習 [TODO|]', '學習 (xue xi xx|)']) {
			expect(auto(text).outcome.type).toBe('none');
		}
		expect(correct('我喜歡 [coffee]').outcome.type).toBe('none');
	});

	test('Markdown links, references, footnotes and wiki links are not pinyin', () => {
		for (const text of ['學習 [xuexi|](https://example.com)', '學習 [xuexi|][ref]', '學習 [xuexi|]: https://example.com', '學習[^xuexi|]', '[[學習 xuexi|]]']) {
			expect(auto(text).outcome.type).toBe('none');
		}
		expect(correct('[學習 xuexi](https://example.com)').outcome.type).toBe('none');
	});

	test('a typo inside brackets is a suggestion, and removal applies to the suggestion too', () => {
		const { outcome } = auto('學習 [xueix|]', true, { removeBrackets: true });
		expect(outcome).toMatchObject({ type: 'suggest', proposals: [{ insert: 'xué xí', original: '[xueix]' }] });
	});
});

describe('closing punctuation between the Chinese and its pinyin', () => {
	const p = new Pronouncer({ markYiBuSandhi: true, overrides: new Map() });
	const run = (line: string) => decideAutomatic(line, line.length, p, { separator: 'space', suggestions: true, bracketsOnly: false, removeBrackets: true });

	test.each(['欲速則不達」yu su ze bu da', '「欲速則不達」 yu su ze bu da', '欲速則不達，yu su ze bu da'])('%s converts', (line) => {
		const outcome = run(line);
		expect(outcome.type).toBe('apply');
		if (outcome.type === 'apply') expect(outcome.proposal.insert).toBe('yù sù zé bù dá');
	});

	test('punctuation does not make unrelated text convert', () => {
		expect(run('欲速則不達」see page 3').type).toBe('none');
	});
});
