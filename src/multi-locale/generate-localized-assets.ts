import { SourceAndMapResult } from 'webpack-sources';
import { deleteAsset } from '../utils/webpack.js';
import { sha256 } from '../utils/sha256.js';
import {
	Compilation,
	LocaleName,
	WP5,
	LocalizeCompiler,
} from '../types-internal.js';
import type { StringKeysCollection } from '../utils/warn-on-unused-keys.js';
import type { LocaleData } from '../utils/load-locale-data.js';
import { findSubstringLocations } from '../utils/strings.js';
import { locatePlaceholders, type Location } from './insert-placeholder-function.js';
import { localizeAsset } from './localize-asset.js';
import { fileNameTemplatePlaceholder, fileNameTemplatePlaceholderPattern } from './asset-name.js';

const isJsFile = /\.js$/;
const isSourceMap = /\.js\.map$/;

type ContentHash = string;
type ContentHashMap = Map<ContentHash, Map<LocaleName, ContentHash>>;

export const generateLocalizedAssets = async (
	compilation: Compilation,
	locales: LocaleData,
	sourceMapForLocales: LocaleName[],
	trackStringKeys: StringKeysCollection | undefined,
	localizeCompiler: LocalizeCompiler,
) => {
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
					new Map(locales.names.map(locale => [
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
					] as [Location, Map<LocaleName, string>]));

			await Promise.all(locales.names.map(async (locale) => {
				const contentHashReplacements = contentHashLocations.map(([range, hashesByLocale]) => [
					range,
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					hashesByLocale.get(locale)!,
				] as [Location, string]);

				let localizedAssetName = asset.name.replace(fileNameTemplatePlaceholderPattern, locale);

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
							localizedAssetName = localizedAssetName.replace(chash, newContentHash);
						}
						newInfo.contenthash = newContentHashes;
					} else {
						const newContentHash = contentHashMap.get(contenthash)?.get(locale) ?? contenthash;
						localizedAssetName = localizedAssetName.replace(contenthash, newContentHash);
						newInfo.contenthash = newContentHash;
					}
				}

				localizedAssetNames.push(localizedAssetName);

				const localizedSource = localizeAsset(
					locales.data[locale],
					locale,
					localizedAssetName,
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
					localizedAssetName,
					localizedSource,
					newInfo,
				);
			}));
		} else {
			const localesToIterate = (
				isSourceMap.test(asset.name) && sourceMapForLocales
					? sourceMapForLocales
					: locales.names
			);

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
