/**
 * Table of valid toneless Hanyu Pinyin syllables (about 420), written with ü.
 * Used only to validate user pronunciation overrides; matching against the
 * pronunciation library does not depend on it. Slightly permissive: rare
 * syllables that appear in dictionaries (e.g. "den", "fiao", "lo") are included.
 */

const FINALS_BY_INITIAL: Record<string, string> = {
	b: 'a o ai ei ao an en ang eng i ie iao ian in ing u',
	p: 'a o ai ei ao ou an en ang eng i ie iao ian in ing u',
	m: 'a o e ai ei ao ou an en ang eng i ie iao iu ian in ing u',
	f: 'a o ei ou an en ang eng iao u',
	d: 'a e ai ei ao ou an en ang eng ong i ia ie iao iu ian ing u uo ui uan un',
	t: 'a e ai ei ao ou an ang eng ong i ie iao ian ing u uo ui uan un',
	n: 'a e ai ei ao ou an en ang eng ong i ie iao iu ian in iang ing u uo uan un ü üe',
	l: 'a o e ai ei ao ou an ang eng ong i ia ie iao iu ian in iang ing u uo uan un ü üe',
	g: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
	k: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
	h: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
	j: 'i ia ie iao iu ian in iang ing iong u ue uan un',
	q: 'i ia ie iao iu ian in iang ing iong u ue uan un',
	x: 'i ia ie iao iu ian in iang ing iong u ue uan un',
	zh: 'a e ai ei ao ou an en ang eng ong i u ua uo uai ui uan un uang',
	ch: 'a e ai ao ou an en ang eng ong i u ua uo uai ui uan un uang',
	sh: 'a e ai ei ao ou an en ang eng i u ua uo uai ui uan un uang',
	r: 'e ao ou an en ang eng ong i u ua uo ui uan un',
	z: 'a e ai ei ao ou an en ang eng ong i u uo ui uan un',
	c: 'a e ai ao ou an en ang eng ong i u uo ui uan un',
	s: 'a e ai ao ou an en ang eng ong i u uo ui uan un',
	y: 'a o e ao ou an in ang ing ong i u ue uan un',
	w: 'a o ai ei an en ang eng u',
};

const STANDALONE = 'a o e ê ai ei ao ou an en ang eng er m n ng hm hng';

function buildSyllableSet(): ReadonlySet<string> {
	const set = new Set<string>(STANDALONE.split(' '));
	for (const [initial, finals] of Object.entries(FINALS_BY_INITIAL)) {
		for (const final of finals.split(' ')) {
			set.add(initial + final);
		}
	}
	return set;
}

const VALID_SYLLABLES = buildSyllableSet();

/** `base` is lowercase toneless pinyin with ü (e.g. "lü", "xue", "zhuang"). */
export function isValidSyllable(base: string): boolean {
	return VALID_SYLLABLES.has(base);
}
