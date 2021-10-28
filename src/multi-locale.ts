import MagicString from 'magic-string';
import { RawSource, SourceMapSource, SourceAndMapResult } from 'webpack-sources';
import { RawSourceMap } from 'source-map';
import acorn from 'acorn';
import astring from 'astring';
import type { CallExpression, Literal } from 'estree';
import {
	isWebpack5Compilation,
	deleteAsset,
} from './utils/webpack';
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
} & ({ expr: CallExpression } | { key: string });

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
				expr: expr as unknown as CallExpression,
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
	localizeCompiler: LocalizeCompiler<LocalizedData> | undefined,
	trackStringKeys: StringKeysCollection | undefined,
) {
	const localeData = locales[locale];
	const magicStringInstance = new MagicString(source);

	// Localze strings
	for (const loc of placeholderLocations) {
		let stringKey;

		if (localizeCompiler) {
			const callExpr = (loc as { expr: CallExpression }).expr;
			stringKey = (callExpr.arguments[0] as Literal).value as string;
			const localizedValue = localeData[stringKey];
			const localizedCode = callLocalizeCompiler(
				localizeCompiler,
				{
					callExpr,
					key: stringKey,
					locale: localeData,
					localeName: locale,
					locales,
					localizedData: localizedValue,
				},
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
					const newAssetName = asset.name.replace(fileNameTemplatePlaceholderPattern, locale);
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
						localizeCompiler,
						trackStringKeys,
					);

					// @ts-expect-error Outdated @type
					compilation.emitAsset(
						newAssetName,
						localizedSource,
						{
							...asset.info,
							locale,
						},
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
		const stage = localizeCompiler
			? (compilation.constructor as typeof WP5.Compilation).PROCESS_ASSETS_STAGE_DERIVED
			: (compilation.constructor as typeof WP5.Compilation).PROCESS_ASSETS_STAGE_ANALYSE;
		compilation.hooks.processAssets.tapPromise(
			{ name, stage },
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
