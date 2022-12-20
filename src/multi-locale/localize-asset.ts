import MagicString from 'magic-string';
import { RawSource, SourceMapSource } from 'webpack-sources';
import WebpackError from 'webpack/lib/WebpackError.js';
import { RawSourceMap } from 'source-map';
import { parseExpressionAt } from 'acorn';
import type {
	Literal,
	SimpleCallExpression,
} from 'estree';
import { pushUniqueError } from '../utils/webpack.js';
import { callLocalizeCompiler } from '../utils/call-localize-compiler.js';
import type {
	WP5,
	Compilation,
	LocaleName,
	LocalizeCompiler,
	LocaleStrings,
} from '../types-internal.js';
import type { StringKeysCollection } from '../utils/warn-on-unused-keys.js';
import { assetNamePlaceholder } from './asset-name';
import type { Location, PlaceholderLocation } from './insert-placeholder-function.js';

const parseCallExpression = (code: string) => parseExpressionAt(
	code,
	0,
	{ ecmaVersion: 'latest' },
) as unknown as SimpleCallExpression;

export const localizeAsset = (
	localeData: LocaleStrings<string>,
	locale: LocaleName,
	assetName: string,
	placeholderLocations: PlaceholderLocation[],
	fileNamePlaceholderLocations: number[],
	contentHashReplacements: [Location, string][],
	source: string,
	map: RawSourceMap | null | false,
	compilation: Compilation,
	localizeCompiler: LocalizeCompiler,
	trackStringKeys?: StringKeysCollection,
) => {
	const magicStringInstance = new MagicString(source);
	const { devtool } = (compilation as WP5.Compilation).options;
	const isDevtoolEval = devtool && devtool.includes('eval');

	for (let { code, location } of placeholderLocations) {
		/**
		 * When devtools: 'eval', the entire module is wrapped in an eval("")
		 * so double quotes are escaped. For example: __(\\"hello-key\\")
		 *
		 * The double quotes need to be unescaped for it to be parsable
		 */
		if (isDevtoolEval) {
			code = code.replace(/\\(.)/g, '$1');
		}

		const callNode = parseCallExpression(code);
		const stringKey = (callNode.arguments[0] as Literal).value as string;
		let localizedCode = callLocalizeCompiler(
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
			localizedCode = JSON.stringify(localizedCode).slice(1, -1);
		}

		magicStringInstance.overwrite(
			location.start,
			location.end,
			localizedCode,
		);

		// For Webpack 5 cache hits
		trackStringKeys?.delete(stringKey);
	}

	// Localize chunk requests
	for (const location of fileNamePlaceholderLocations) {
		magicStringInstance.overwrite(
			location,
			location + assetNamePlaceholder.length,
			locale,
		);
	}

	for (const [range, replacement] of contentHashReplacements) {
		magicStringInstance.overwrite(
			range.start,
			range.end,
			replacement,
		);
	}

	const localizedCode = magicStringInstance.toString();

	if (map) {
		const newSourceMap = magicStringInstance.generateMap({
			source: assetName,
			includeContent: true,
		});

		return new SourceMapSource(
			localizedCode,
			assetName,
			newSourceMap,
			source,
			map,
			true,
		);
	}
	return new RawSource(localizedCode);
};
