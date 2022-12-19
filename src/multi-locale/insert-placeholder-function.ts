import { stringifyAstNode } from '../utils/stringify-ast-node.js';
import type { StringKeyHit } from '../utils/on-localizer-call.js';
import type { LocaleData } from '../utils/load-locale-data.js';
import { sha256 } from '../utils/sha256.js';

export const placeholderFunctionName = `localizeAssetsPlugin${sha256('localize-assets-plugin-placeholder').slice(0, 8)}`;

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

	/**
	 * TODO
	 * Shouldn't this be moved to the onLocalizerCall hook?
	 * Maybe it should only be applied to multiple locales?
	 */
	if (callNode.callee.type !== 'Identifier') {
		throw new Error('Expected Identifier');
	}

	const callExpression = stringifyAstNode(callNode);

	// TODO I wonder if `placeholderFunctionName` can be passed in as the second argument?
	return `${placeholderFunctionName}(${callExpression})+${placeholderFunctionName}`;
};
