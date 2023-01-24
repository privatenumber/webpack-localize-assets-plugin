import MagicString from 'magic-string';
import WebpackError from 'webpack/lib/WebpackError.js';
import { parseExpressionAt } from 'acorn';
import type {
	Literal,
	SimpleCallExpression,
} from 'estree';
import { stringifyAstNode } from '../utils/stringify-ast-node.js';
import type { StringKeyHit } from '../utils/on-localizer-call.js';
import type { LocaleData } from '../utils/load-locale-data.js';
import { sha256 } from '../utils/sha256.js';
import { findSubstringLocations } from '../utils/strings.js';
import { name } from '../../package.json';
import type {
	Location, Compilation, WP5, LocalizeCompiler,
} from '../types-internal.js';
import { pushUniqueError } from '../utils/webpack.js';
import { callLocalizeCompiler } from '../utils/call-localize-compiler.js';

const placeholderFunctionName = `_placeholder${sha256(name).slice(0, 8)}`;

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

type PlaceholderLocation = {
	location: Location;
	code: string;
};

const locatePlaceholderFunctions = (
	assetCode: string,
) => {
	const placeholderIndices = findSubstringLocations(assetCode, placeholderFunctionName);
	const locations: PlaceholderLocation[] = [];

	while (placeholderIndices.length > 0) {
		const start = placeholderIndices.shift()!;
		const end = placeholderIndices.shift()!;

		const code = assetCode.slice(
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
			code,
			location: {
				start,
				end: (
					end
					+ placeholderFunctionName.length
					+ 1 // closing bracket
				),
			},
		});
	}

	return locations;
};

const unescape = (string: string) => string.replace(/\\(.)/g, '$1');
const escape = (string: string) => JSON.stringify(string).slice(1, -1);
const parseCallExpression = (code: string) => parseExpressionAt(
	code,
	0,
	{ ecmaVersion: 'latest' },
) as unknown as SimpleCallExpression;

export const createLocalizedStringInserter = (
	assetCode: string,
	compilation: Compilation,
	localizeCompiler: LocalizeCompiler,
	locales: LocaleData,
	trackStringKeys: Set<string> | undefined,
) => {
	const { devtool } = (compilation as WP5.Compilation).options;
	const isDevtoolEval = devtool && devtool.includes('eval');
	const placeholderLocations = locatePlaceholderFunctions(assetCode);

	return (
		ms: MagicString.default,
		{ locale }: { locale: string },
	) => {
		const localeData = locales.data[locale];
		for (const placeholder of placeholderLocations) {
			let { code } = placeholder;

			/**
			 * When devtools: 'eval', the entire module is wrapped in an eval("")
			 * so double quotes are escaped. For example: __(\\"hello-key\\")
			 *
			 * The double quotes need to be unescaped for it to be parsable
			 */
			if (isDevtoolEval) {
				code = unescape(code);
			}

			const callNode = parseCallExpression(code);
			const stringKey = (callNode.arguments[0] as Literal).value as string;
			let localizedString = callLocalizeCompiler(
				localizeCompiler,
				{
					callNode,
					resolveKey: (key = stringKey) => localeData[key],
					emitWarning: (message) => {
						pushUniqueError(
							compilation.warnings,
							new WebpackError(message),
						);
					},
					emitError: (message) => {
						pushUniqueError(
							compilation.errors,
							new WebpackError(message),
						);
					},
				},
				locale,
			);

			if (isDevtoolEval) {
				// Re-escape before putting it back into eval("")
				localizedString = escape(localizedString);
			}

			ms.overwrite(
				placeholder.location.start,
				placeholder.location.end,
				localizedString,
			);

			// For Webpack 5 cache hits
			trackStringKeys?.delete(stringKey);
		}
	};
};
