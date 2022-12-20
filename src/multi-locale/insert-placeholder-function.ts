import { stringifyAstNode } from '../utils/stringify-ast-node.js';
import type { StringKeyHit } from '../utils/on-localizer-call.js';
import type { LocaleData } from '../utils/load-locale-data.js';
import { sha256 } from '../utils/sha256.js';
import { findSubstringLocations } from '../utils/strings.js';
import { name } from '../../package.json';

export const placeholderFunctionName = `_placeholder${sha256(name).slice(0, 8)}`;

/**
 * For Multiple locales
 *
 * 1. Replace the `__(...)` call with a placeholder -> `asdf(__(...)) + asdf`
 * 2. After the asset is generated & minified, search and replace the
 * placeholder with calls to localizeCompiler
 * 3. Repeat for each locale
 */
export const insertPlaceholderFunction = (
	locales: LocaleData,
	{ module, key, callNode }: StringKeyHit,
) : string => {
	// Track used keys for hash
	if (!module.buildInfo.localized) {
		module.buildInfo.localized = {};
	}

	if (!module.buildInfo.localized[key]) {
		module.buildInfo.localized[key] = locales.names.map(
			locale => locales.data[locale][key],
		);
	}

	const callExpression = stringifyAstNode(callNode);

	return `${placeholderFunctionName}(${callExpression},${placeholderFunctionName})`;
};

export type Location = {
	start: number;
	end: number;
};

export type PlaceholderLocation = {
	location: Location;
	code: string;
};

export const locatePlaceholders = (assetCode: string) => {
	const placeholderIndices = findSubstringLocations(assetCode, placeholderFunctionName);
	const locations: PlaceholderLocation[] = [];

	while (placeholderIndices.length > 0) {
		const start = placeholderIndices.shift()!;
		const end = placeholderIndices.shift()!;

		let code = assetCode.slice(
			(
				start
				+ placeholderFunctionName.length
				+ 1 // Opening bracket
			),
			(
				end
				- 1	// , operator
			),
		);

		locations.push({
			location: { start, end: end + placeholderFunctionName.length + 1 },
			code,
		});
	}

	return locations;
};
