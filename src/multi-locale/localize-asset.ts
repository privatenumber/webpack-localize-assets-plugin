import MagicString from 'magic-string';
import { RawSource, SourceMapSource } from 'webpack-sources';
import WebpackError from 'webpack/lib/WebpackError.js';
import { RawSourceMap } from 'source-map';
import { parseExpressionAt } from 'acorn';
import type {
	Literal,
	SimpleCallExpression,
} from 'estree';
import { callLocalizeCompiler } from '../utils/call-localize-compiler.js';
import type {
	Compilation,
	LocaleName,
	LocalizeCompiler,
	LocaleStrings,
} from '../types-internal.js';
import type { StringKeysCollection } from '../utils/warn-on-unused-keys.js';
import { fileNameTemplatePlaceholder } from './asset-name';
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

	for (const { code, location, escapeDoubleQuotes } of placeholderLocations) {
		const callNode = parseCallExpression(code);
		const stringKey = (callNode.arguments[0] as Literal).value as string;
		let localizedCode = callLocalizeCompiler(
			localizeCompiler,
			{
				callNode,
				resolveKey: (key = stringKey) => localeData[key],

				// TODO deduplicate logic across threse two and reportModuleWarning/Error
				emitWarning: (message) => {
					const hasWarning = compilation.warnings.find(warning => warning.message === message);
					if (!hasWarning) {
						compilation.warnings.push(new WebpackError(message));
					}
				},
				emitError: (message) => {
					const hasError = compilation.errors.find(error => error.message === message);
					if (!hasError) {
						compilation.errors.push(new WebpackError(message));
					}
				},
			},
			locale,
		);

		if (escapeDoubleQuotes) {
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
			location + fileNameTemplatePlaceholder.length,
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
