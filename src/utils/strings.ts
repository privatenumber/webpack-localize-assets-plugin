export type Range = {
	start: number;
	end?: number;
};

export const findSubstringRanges = (
	string: string,
	substring: string,
) => {
	const ranges: Range[] = [];
	let range: Range | null = null;
	let index = string.indexOf(substring);

	while (index > -1) {
		if (!range) {
			range = { start: index };
		} else {
			range.end = index + substring.length;
			ranges.push(range);
			range = null;
		}

		index = string.indexOf(substring, index + 1);
	}

	return ranges;
};

export const findSubstringLocations = (
	string: string,
	substring: string,
): number[] => {
	const indices: number[] = [];
	let index = string.indexOf(substring);

	while (index > -1) {
		indices.push(index);
		index = string.indexOf(substring, index + 1);
	}

	return indices;
};
