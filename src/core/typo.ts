/**
 * Bounded optimal-string-alignment distance (Damerau–Levenshtein restricted to
 * non-overlapping adjacent transpositions). "xueix" vs "xuexi" = 1.
 */
export function osaDistance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	const width = b.length + 1;
	let prevPrev: number[] = new Array<number>(width).fill(0);
	let prev: number[] = Array.from({ length: width }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const current: number[] = new Array<number>(width).fill(0);
		current[0] = i;
		let rowMin = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let value = Math.min(
				(prev[j] ?? 0) + 1,
				(current[j - 1] ?? 0) + 1,
				(prev[j - 1] ?? 0) + cost,
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				value = Math.min(value, (prevPrev[j - 2] ?? 0) + 1);
			}
			current[j] = value;
			rowMin = Math.min(rowMin, value);
		}
		if (rowMin > max) return max + 1;
		prevPrev = prev;
		prev = current;
	}
	const result = prev[b.length] ?? max + 1;
	return result > max ? max + 1 : result;
}

/** Inputs this short are never corrected: too many readings are one edit apart. */
export const MIN_TYPO_INPUT_LENGTH = 5;
/** Inputs this long may differ by two edits. */
const TWO_EDIT_INPUT_LENGTH = 9;

/**
 * Conservative edit budget based on the typed key length (letters only).
 * Returns 0 when no correction should be attempted.
 */
export function typoBudget(typedLength: number): number {
	if (typedLength < MIN_TYPO_INPUT_LENGTH) return 0;
	if (typedLength < TWO_EDIT_INPUT_LENGTH) return 1;
	return 2;
}
