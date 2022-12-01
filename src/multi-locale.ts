import MagicString from 'magic-string';
import { RawSource, SourceMapSource, SourceAndMapResult } from 'webpack-sources';
import WebpackError from 'webpack/lib/WebpackError.js';
import { RawSourceMap } from 'source-map';
import { parseExpressionAt } from 'acorn';
import type {
	Expression,
	Literal,
	SimpleCallExpression,
} from 'estree';
import { name } from '../package.json';
import { isWebpack5Compilation, deleteAsset } from './utils/webpack';
import { sha256 } from './utils/sha256';
import {
	Compilation,
	LocalesMap,
	LocaleName,
	WP5,
	LocalizeCompiler,
} from './types';
import type { StringKeysCollection } from './utils/track-unused-localized-strings';
import { callLocalizeCompiler } from './utils/call-localize-compiler';
import { stringifyAst } from './utils/stringify-ast';

type ContentHash = string;
type ContentHashMap = Map<ContentHash, Map<LocaleName, ContentHash>>;

type Range = {
	start: number;
	end?: number;
};

function findSubstringRanges(
	string: string,
	substring: string,
) {
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
}

function findSubstringLocations(
	string: string,
	substring: string,
): number[] {
	const indices: number[] = [];
	let index = string.indexOf(substring);
	while (index > -1) {
		indices.push(index);
		index = string.indexOf(substring, index + 1);
	}
	return indices;
}

export type PlaceholderLocation = {
	range: Range;
	node: SimpleCallExpression;
	escapeDoubleQuotes: boolean;
};

export const fileNameTemplatePlaceholder = `[locale:${sha256('locale-placeholder').slice(0, 8)}]`;

const fileNameTemplatePlaceholderPattern = new RegExp(fileNameTemplatePlaceholder.replace(/[[\]]/g, '\\$&'), 'g');
const isJsFile = /\.js$/;
const isSourceMap = /\.js\.map$/;

const placeholderFunctionName = `localizeAssetsPlugin${sha256('localize-assets-plugin-placeholder').slice(0, 8)}`;

export function markLocalizeFunction(callExpression: SimpleCallExpression) {
	if (callExpression.callee.type !== 'Identifier') {
		throw new Error('Expected Identifier');
	}

	return `${placeholderFunctionName}(${stringifyAst(callExpression)})+${placeholderFunctionName}`;
}

function getOriginalCall(node: Expression): SimpleCallExpression {
	if (node.type === 'BinaryExpression') {
		if (node.left.type !== 'CallExpression') {
			throw new Error('Expected CallExpression');
		}

		if (node.left.arguments[0].type !== 'CallExpression') {
			throw new Error('Expected CallExpression');
		}

		return node.left.arguments[0];
	}

	/*
	If the localized value is not used anywhere (eg. assigned to a variable)
	Terser converts the + operator to a , because it has no effect
	*/
	if (node.type === 'SequenceExpression') {
		const [firstExpression] = node.expressions;

		if (firstExpression.type !== 'CallExpression') {
			throw new Error('Expected CallExpression');
		}

		if (firstExpression.arguments[0].type !== 'CallExpression') {
			throw new Error('Expected CallExpression');
		}

		return firstExpression.arguments[0];
	}

	throw new Error('Expected BinaryExpression or SequenceExpression');
}

function locatePlaceholders(sourceString: string) {
	const placeholderRanges = findSubstringRanges(sourceString, placeholderFunctionName);
	const placeholderLocations: PlaceholderLocation[] = [];

	for (const placeholderRange of placeholderRanges) {
		let code = sourceString.slice(placeholderRange.start, placeholderRange.end);
		const escapedDoubleQuotesPattern = /\\"/g;
		const escapeDoubleQuotes = escapedDoubleQuotesPattern.test(code);

		if (escapeDoubleQuotes) {
			/**
			 * When devtools: 'eval', the entire module is wrapped in an eval("")
			 * so double quotes are escaped. For example: __(\\"hello-key\\")
			 *
			 * The double quotes need to be unescaped for it to be parsable
			 */

			code = code.replace(escapedDoubleQuotesPattern, '"');
		}

		const node = parseExpressionAt(code, 0, { ecmaVersion: 'latest' }) as Expression;

		placeholderLocations.push({
			node: getOriginalCall(node),
			range: placeholderRange,
			escapeDoubleQuotes,
		});
	}

	return placeholderLocations;
}

function localizeAsset<LocalizedData>(
	locales: LocalesMap<LocalizedData>,
	locale: LocaleName,
	assetName: string,
	placeholderLocations: PlaceholderLocation[],
	fileNamePlaceholderLocations: number[],
	contentHashReplacements: [Range, string][],
	source: string,
	map: RawSourceMap | null | false,
	compilation: Compilation,
	localizeCompiler: LocalizeCompiler<LocalizedData>,
	trackStringKeys: StringKeysCollection | undefined,
) {
	const localeData = locales[locale];
	const magicStringInstance = new MagicString(source);

	// Localize strings
	for (const { node, range, escapeDoubleQuotes } of placeholderLocations) {
		const stringKey = (node.arguments[0] as Literal).value as string;
		let localizedCode = callLocalizeCompiler(
			localizeCompiler,
			{
				callNode: node,
				resolveKey: (key = stringKey) => localeData[key],
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
			range.start,
			range.end!,
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
			range.end!,
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
}

export function generateLocalizedAssets<LocalizedData>(
	compilation: Compilation,
	localeNames: LocaleName[],
	locales: LocalesMap<LocalizedData>,
	sourceMapForLocales: LocaleName[],
	trackStringKeys: StringKeysCollection | undefined,
	localizeCompiler: LocalizeCompiler<LocalizedData>,
) {
	const generateLocalizedAssetsHandler = async () => {
		const assetsWithInfo = (compilation as WP5.Compilation).getAssets()
			.filter(asset => asset.name.includes(fileNameTemplatePlaceholder));

		const contentHashMap: ContentHashMap = new Map(
			assetsWithInfo
				.flatMap((asset) => {
					// Add locale to hash for RealContentHashPlugin plugin
					const { contenthash } = asset.info;
					if (!contenthash) {
						return [];
					}
					const contentHashArray = Array.isArray(contenthash)
						? contenthash
						: [contenthash];
					return contentHashArray.map(chash => [
						chash,
						new Map(localeNames.map(locale => [
							locale,
							sha256(chash + locale).slice(0, chash.length),
						])),
					]);
				}),
		);

		await Promise.all(assetsWithInfo.map(async (asset) => {
			const { source, map } = asset.source.sourceAndMap() as SourceAndMapResult;
			const localizedAssetNames: string[] = [];

			if (isJsFile.test(asset.name)) {
				const sourceString = source.toString();
				const placeholderLocations = locatePlaceholders(sourceString);
				const fileNamePlaceholderLocations = findSubstringLocations(
					sourceString,
					fileNameTemplatePlaceholder,
				);
				const contentHashLocations = [...contentHashMap.entries()]
					.flatMap(([hash, hashesByLocale]) => findSubstringLocations(sourceString, hash)
						.map(loc => [
							{ start: loc, end: loc + hash.length },
							hashesByLocale,
						] as [Range, Map<LocaleName, string>]));

				await Promise.all(localeNames.map(async (locale) => {
					const contentHashReplacements = contentHashLocations.map(([range, hashesByLocale]) => [
						range,
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						hashesByLocale.get(locale)!,
					] as [Range, string]);

					let newAssetName = asset.name.replace(fileNameTemplatePlaceholderPattern, locale);

					// object spread breaks types
					// eslint-disable-next-line prefer-object-spread
					const newInfo = Object.assign(
						{},
						asset.info,
						{ locale },
					);

					// Add locale to hash for RealContentHashPlugin plugin
					if (newInfo.contenthash) {
						const { contenthash } = newInfo;
						if (Array.isArray(contenthash)) {
							const newContentHashes = [];
							for (const chash of contenthash) {
								const newContentHash = contentHashMap.get(chash)?.get(locale) ?? chash;
								newContentHashes.push(newContentHash);
								newAssetName = newAssetName.replace(chash, newContentHash);
							}
							newInfo.contenthash = newContentHashes;
						} else {
							const newContentHash = contentHashMap.get(contenthash)?.get(locale) ?? contenthash;
							newAssetName = newAssetName.replace(contenthash, newContentHash);
							newInfo.contenthash = newContentHash;
						}
					}

					localizedAssetNames.push(newAssetName);

					const localizedSource = localizeAsset(
						locales,
						locale,
						newAssetName,
						placeholderLocations,
						fileNamePlaceholderLocations,
						contentHashReplacements,
						sourceString,
						sourceMapForLocales.includes(locale) && map,
						compilation,
						localizeCompiler,
						trackStringKeys,
					);

					// @ts-expect-error Outdated @type
					compilation.emitAsset(
						newAssetName,
						localizedSource,
						newInfo,
					);
				}));
			} else {
				let localesToIterate = localeNames;
				if (isSourceMap.test(asset.name) && sourceMapForLocales) {
					localesToIterate = sourceMapForLocales;
				}

				await Promise.all(localesToIterate.map(async (locale) => {
					const newAssetName = asset.name.replace(fileNameTemplatePlaceholderPattern, locale);
					localizedAssetNames.push(newAssetName);

					// @ts-expect-error Outdated @type
					compilation.emitAsset(
						newAssetName,
						asset.source,
						asset.info,
					);
				}));
			}

			// Delete original unlocalized asset
			deleteAsset(compilation, asset.name, localizedAssetNames);
		}));
	};

	if (isWebpack5Compilation(compilation)) {
		/**
		 * Important this this happens before PROCESS_ASSETS_STAGE_OPTIMIZE_HASH, which is where
		 * RealContentHashPlugin re-hashes assets:
		 * https://github.com/webpack/webpack/blob/f0298fe46f/lib/optimize/RealContentHashPlugin.js#L140
		 *
		 * PROCESS_ASSETS_STAGE_SUMMARIZE happens after minification
		 * (PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE) but before re-hashing
		 * (PROCESS_ASSETS_STAGE_OPTIMIZE_HASH).
		 *
		 * PROCESS_ASSETS_STAGE_SUMMARIZE isn't actually used by Webpack, but there seemed
		 * to be other plugins that were relying on it to summarize assets, so it makes sense
		 * to run just before that.
		 *
		 * All "process assets" stages:
		 * https://github.com/webpack/webpack/blob/f0298fe46f/lib/Compilation.js#L5125-L5204
		 */
		const Webpack5Compilation = compilation.constructor as typeof WP5.Compilation;
		compilation.hooks.processAssets.tapPromise(
			{
				name,
				stage: Webpack5Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE - 1,
				additionalAssets: true,
			},
			generateLocalizedAssetsHandler,
		);
	} else {
		// Triggered after minification, which usually happens in optimizeChunkAssets
		compilation.hooks.optimizeAssets.tapPromise(
			name,
			generateLocalizedAssetsHandler,
		);
	}
}
