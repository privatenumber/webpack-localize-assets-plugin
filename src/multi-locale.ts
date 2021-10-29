import MagicString from 'magic-string';
import { RawSource, SourceMapSource, SourceAndMapResult } from 'webpack-sources';
import WebpackError from 'webpack/lib/WebpackError.js';
import { RawSourceMap } from 'source-map';
import acorn from 'acorn';
import type { Literal, SimpleCallExpression } from 'estree';
import { isWebpack5Compilation, deleteAsset } from './utils/webpack';
import { sha256 } from './utils/sha256';
import * as base64 from './utils/base64';
import {
	Compilation,
	LocalesMap,
	LocaleName,
	WP5,
	LocalizeCompiler,
} from './types';
import type { StringKeysCollection } from './utils/track-unused-localized-strings';
import { callLocalizeCompiler } from './utils/localize-compiler';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../package.json');

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
	index: number;
	endIndex: number;
} & ({ expr: SimpleCallExpression } | { key: string });

export const fileNameTemplatePlaceholder = `[locale:${sha256('locale-placeholder').slice(0, 8)}]`;

const fileNameTemplatePlaceholderPattern = new RegExp(fileNameTemplatePlaceholder.replace(/[[\]]/g, '\\$&'), 'g');
const isJsFile = /\.js$/;
const isSourceMap = /\.js\.map$/;

const placeholderPrefix = sha256('localize-assets-plugin-placeholder-prefix').slice(0, 8);
const placeholderSuffix = '|';

function locatePlaceholders(sourceString: string, expectCallExpression: boolean) {
	const placeholderLocations: PlaceholderLocation[] = [];

	const possibleLocations = findSubstringLocations(sourceString, placeholderPrefix);
	for (const placeholderIndex of possibleLocations) {
		const startIndex = placeholderIndex + placeholderPrefix.length;
		const suffixIndex = sourceString.indexOf(placeholderSuffix, startIndex);

		if (suffixIndex === -1) {
			continue;
		}

		const placeholder = sourceString.slice(startIndex, suffixIndex);

		const decoded = base64.decode(placeholder);

		if (expectCallExpression) {
			// the decoded string is a JS expression
			const expr = acorn.parseExpressionAt(decoded, 0, { ecmaVersion: 'latest' });
			placeholderLocations.push({
				expr: expr as unknown as SimpleCallExpression,
				index: placeholderIndex,
				endIndex: suffixIndex + placeholderSuffix.length,
			});
		} else {
			// the decoded string is the stringKey
			placeholderLocations.push({
				key: decoded,
				index: placeholderIndex,
				endIndex: suffixIndex + placeholderSuffix.length,
			});
		}
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
	map: RawSourceMap | null,
	compilation: Compilation,
	localizeCompiler: LocalizeCompiler<LocalizedData> | undefined,
	trackStringKeys: StringKeysCollection | undefined,
) {
	const localeData = locales[locale];
	const magicStringInstance = new MagicString(source);

	// Localze strings
	for (const loc of placeholderLocations) {
		let stringKey;

		if (localizeCompiler) {
			const callExpr = (loc as { expr: SimpleCallExpression }).expr;
			stringKey = (callExpr.arguments[0] as Literal).value as string;
			const localizedCode = callLocalizeCompiler(
				localizeCompiler,
				{
					callNode: callExpr,
					resolve: (key: string) => localeData[key],
					emitWarning: (message) => {
						compilation.warnings.push(new WebpackError(message));
					},
					emitError(message) {
						compilation.errors.push(new WebpackError(message));
					},
				},
				locale,
			);

			// we're running before minification, so we can safely assume that the
			// placeholder is directly inside a string literal.
			// `localizedCode` is an arbitrary JS expression,
			// so we want to replace code one character either side of the placeholder
			// in order to eat the string literal's quotes.
			magicStringInstance.overwrite(
				loc.index - 1,
				loc.endIndex + 1,
				localizedCode,
			);
		} else {
			// if localizedCompiler is undefined then LocalizedValue = string.
			stringKey = (loc as { key: string }).key;

			// we're running after minification, which means that the placeholder
			// may have (eg) been concated into another string.
			// so here we're going to replace only the placeholder itself
			const localizedString = JSON.stringify(localeData[stringKey] || stringKey).slice(1, -1);
			magicStringInstance.overwrite(
				loc.index,
				loc.endIndex,
				localizedString,
			);
		}

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
	localizeCompiler: LocalizeCompiler<LocalizedData> | undefined,
) {
	const generateLocalizedAssetsHandler = async () => {
		const assetsWithInfo = (compilation as WP5.Compilation).getAssets()
			.filter(asset => asset.name.includes(fileNameTemplatePlaceholder));

		await Promise.all(assetsWithInfo.map(async (asset) => {
			const { source, map } = asset.source.sourceAndMap() as SourceAndMapResult;
			const localizedAssetNames: string[] = [];

			if (isJsFile.test(asset.name)) {
				const sourceString = source.toString();
				const placeholderLocations = locatePlaceholders(sourceString, !!localizeCompiler);
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

					// Add localce to hash for RealContentHashPlugin plugin
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
						(
							sourceMapForLocales.includes(locale)
								? map
								: null
						),
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

	// When we have a custom localisation compiler,
	// we have to run asset generation before minification,
	// since the compiler may generate code which needs minifying.
	// Otherwise, we can run after minification as an optimisation
	if (isWebpack5Compilation(compilation)) {
		const Webpack5Compilation = compilation.constructor as typeof WP5.Compilation;
		const stage = localizeCompiler
			? Webpack5Compilation.PROCESS_ASSETS_STAGE_DERIVED
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
			: Webpack5Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE - 1;
		compilation.hooks.processAssets.tapPromise(
			{ name, stage, additionalAssets: true },
			generateLocalizedAssetsHandler,
		);
	} else {
		const hook = localizeCompiler
			? compilation.hooks.additionalAssets
			: compilation.hooks.optimizeAssets;
		hook.tapPromise(
			name,
			generateLocalizedAssetsHandler,
		);
	}
}

export function getPlaceholder(value: string) {
	return placeholderPrefix + base64.encode(value) + placeholderSuffix;
}
