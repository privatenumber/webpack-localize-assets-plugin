import { SourceAndMapResult, RawSource, SourceMapSource } from 'webpack-sources';
import MagicString from 'magic-string';
import { RawSourceMap } from 'source-map';
import { deleteAsset } from '../utils/webpack.js';
import { sha256 } from '../utils/sha256.js';
import {
	Compilation,
	LocaleName,
	WP5,
	LocalizeCompiler,
	Location,
} from '../types-internal.js';
import type { StringKeysCollection } from '../utils/warn-on-unused-keys.js';
import type { LocaleData } from '../utils/load-locale-data.js';
import { findSubstringLocations } from '../utils/strings.js';
import { createPlaceholderReplacer } from './placeholder-function.js';
import {
	assetNamePlaceholder,
	insertToAssetName,
} from './asset-name.js';

type Transformer = (
	magicStringInstance: MagicString,
) => void;

const transformAsset = (
	source: {
		name: string;
		code: string;
	},
	transformations: Transformer[],
	map?: RawSourceMap | null | false,
) => {
	const magicStringInstance = new MagicString(source.code);

	for (const transformer of transformations) {
		transformer(magicStringInstance);
	}

	const transformedCode = magicStringInstance.toString();

	if (map) {
		const newSourceMap = magicStringInstance.generateMap({
			source: source.name,
			includeContent: true,
		});

		return new SourceMapSource(
			transformedCode,
			source.name,
			newSourceMap,
			source.code,
			map,
			true,
		);
	}

	return new RawSource(transformedCode);
};

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
	const assetsToLocalize = (compilation as WP5.Compilation).getAssets()
		.filter(asset => asset.name.includes(assetNamePlaceholder));

	// Derive new hashes from the original hashes and the locale
	const contentHashMap: ContentHashMap = new Map(
		assetsToLocalize
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

	await Promise.all(assetsToLocalize.map(async (asset) => {
		const { source, map } = asset.source.sourceAndMap() as SourceAndMapResult;
		const localizedAssetNames: string[] = [];

		if (isJsFile.test(asset.name)) {
			const sourceString = source.toString();

			const replacePlaceholders = createPlaceholderReplacer(
				sourceString,
				compilation,
				localizeCompiler,
				locales,
				trackStringKeys,
			);

			const fileNamePlaceholderLocations = findSubstringLocations(
				sourceString,
				assetNamePlaceholder,
			);

			// Find references to content hash to replace with localized content hash
			const contentHashLocations = [...contentHashMap.entries()]
				.flatMap(
					([hash, hashesByLocale]) => (
						findSubstringLocations(sourceString, hash)
							.map(
								loc => [
									{ start: loc, end: loc + hash.length },
									hashesByLocale,
								] as [Location, Map<LocaleName, string>],
							)
					),
				);

			await Promise.all(locales.names.map(async (locale) => {
				const contentHashReplacements = contentHashLocations.map(([range, hashesByLocale]) => [
					range,
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					hashesByLocale.get(locale)!,
				] as [Location, string]);

				let localizedAssetName = insertToAssetName(asset.name, locale);

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

				const localizedSource = transformAsset(
					{
						name: localizedAssetName,
						code: sourceString,
					},
					[
						replacePlaceholders(locale),
						(ms) => {
							// Localize chunk requests
							for (const location of fileNamePlaceholderLocations) {
								ms.overwrite(
									location,
									location + assetNamePlaceholder.length,
									locale,
								);
							}
						},
						(ms) => {
							for (const [range, replacement] of contentHashReplacements) {
								ms.overwrite(
									range.start,
									range.end,
									replacement,
								);
							}
						},
					],
					map,
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
				const newAssetName = insertToAssetName(asset.name, locale);
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
