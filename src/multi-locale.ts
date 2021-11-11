import MagicString from 'magic-string';
import { RawSource, SourceMapSource, SourceAndMapResult } from 'webpack-sources';
import WebpackError from 'webpack/lib/WebpackError.js';
import { RawSourceMap } from 'source-map';
import acorn from 'acorn';
import type {
	BinaryExpression,
	Literal,
	SimpleCallExpression,
} from 'estree';
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
import { callLocalizeCompiler } from './utils/localize-compiler';
import { stringifyAst } from './utils/stringify-ast';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../package.json');

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
};

export const fileNameTemplatePlaceholder = `[locale:${sha256('locale-placeholder').slice(0, 8)}]`;

const fileNameTemplatePlaceholderPattern = new RegExp(fileNameTemplatePlaceholder.replace(/[[\]]/g, '\\$&'), 'g');
const isJsFile = /\.js$/;
const isSourceMap = /\.js\.map$/;

const placeholderFunctionName = `localizeAssetsPlugin${sha256('localize-assets-plugin-placeholder').slice(0, 8)}`;

export function markLocalizeFunction(callExpression: SimpleCallExpression) {
	if (callExpression.callee.type !== 'Identifier') {
		throw new Error('Should not happen');
	}

	callExpression.callee.name = placeholderFunctionName;
	return `${stringifyAst(callExpression)}+${placeholderFunctionName}`;
}

function assertBinaryExpression(node: any): asserts node is BinaryExpression {
	if (node.type !== 'BinaryExpression') {
		throw new Error('Expected BinaryExpression');
	}
}

function locatePlaceholders(sourceString: string) {
	const placeholderRanges = findSubstringRanges(sourceString, placeholderFunctionName);
	const placeholderLocations: PlaceholderLocation[] = [];

	for (const placeholderRange of placeholderRanges) {
		const code = sourceString.slice(placeholderRange.start, placeholderRange.end);
		const node = acorn.parseExpressionAt(code, 0, { ecmaVersion: 'latest', ranges: true });

		assertBinaryExpression(node);

		placeholderLocations.push({
			node: node.left as SimpleCallExpression,
			range: placeholderRange,
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
	source: string,
	map: RawSourceMap | null | false,
	compilation: Compilation,
	localizeCompiler: LocalizeCompiler<LocalizedData>,
	trackStringKeys: StringKeysCollection | undefined,
) {
	const localeData = locales[locale];
	const magicStringInstance = new MagicString(source);

	// Localize strings
	for (const loc of placeholderLocations) {
		const stringKey = (loc.node.arguments[0] as Literal).value as string;

		const localizedCode = callLocalizeCompiler(
			localizeCompiler,
			{
				callNode: loc.node,
				resolve: (key: string) => localeData[key],
				emitWarning: (message) => {
					compilation.warnings.push(new WebpackError(message));
				},
				emitError: (message) => {
					compilation.errors.push(new WebpackError(message));
				},
			},
			locale,
		);

		magicStringInstance.overwrite(
			loc.range.start,
			loc.range.end!,
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

				await Promise.all(localeNames.map(async (locale) => {
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
						let { contenthash } = newInfo;

						if (Array.isArray(contenthash)) {
							contenthash = contenthash.map((chash) => {
								const newContentHash = sha256(chash + locale).slice(0, chash.length);
								newAssetName = newAssetName.replace(chash, newContentHash);
								return newContentHash;
							});
						} else {
							const newContentHash = sha256(contenthash + locale).slice(0, contenthash.length);
							newAssetName = newAssetName.replace(contenthash, newContentHash);
							contenthash = newContentHash;
						}

						newInfo.contenthash = contenthash;
					}

					localizedAssetNames.push(newAssetName);

					const localizedSource = localizeAsset(
						locales,
						locale,
						newAssetName,
						placeholderLocations,
						fileNamePlaceholderLocations,
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
		 * Important this this happens before PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
		 * which is where RealContentHashPlugin re-hashes assets:
		 * https://github.com/webpack/webpack/blob/f0298fe46f/lib/optimize/RealContentHashPlugin.js#L140
		 *
		 * PROCESS_ASSETS_STAGE_SUMMARIZE happens after minification
		 * (PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE) but before re-hashing
		 * (PROCESS_ASSETS_STAGE_OPTIMIZE_HASH). PROCESS_ASSETS_STAGE_SUMMARIZE
		 * isn't actually used by Webpack, but there seemed to be other plugins
		 * that were relying on it to summarize assets, so it makes sense to run just before that.
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
