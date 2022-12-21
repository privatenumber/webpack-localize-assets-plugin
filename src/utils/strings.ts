export const findSubstringLocations = (
	string: string,
	substring: string,
) => {
	const indices: number[] = [];
	let index = string.indexOf(substring);

	while (index > -1) {
		indices.push(index);
		index = string.indexOf(substring, index + 1);
	}

	return indices;
};

export const replaceAll = (
	string: string,
	searchValue: string,
	replaceValue: string,
) => {
	const locations = findSubstringLocations(string, searchValue);

	for (let i = locations.length - 1; i >= 0; i -= 1) {
		const location = locations[i];
		string = string.slice(0, location) + replaceValue + string.slice(location + searchValue.length);
	}

	return string;
};
