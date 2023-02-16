import {
	SourceAndMapResult, RawSource, SourceMapSource,
} from 'webpack-sources';
import MagicString from 'magic-string';
import type { RawSourceMap } from 'source-map';
import { deleteAsset, isWebpack5Compilation } from '../utils/webpack.js';
import {
	Compilation,
	LocaleName,
	WP5,
	LocalizeCompiler,
} from '../types-internal.js';
import type { StringKeysCollection } from '../utils/warn-on-unused-keys.js';
import type { LocaleData } from '../utils/load-locale-data.js';
import { createLocalizedStringInserter } from './localizer-function.js';
import {
	assetNamePlaceholder,
	createLocalizedAssetNameInserter,
	localizeAssetName,
} from './asset-name.js';
import { createHashManager } from './content-hash.js';

type SourceBase = {
	name: string;
	code: string;
};

const transformAsset = <Source extends SourceBase>(
	source: Source,
	transformations: ((
		magicStringInstance: MagicString.default,
		source: Source,
	) => void)[],
	map?: RawSourceMap | null | false,
) => {
	// @ts-expect-error incorrect MagicString types
	const magicStringInstance = new MagicString(source.code) as MagicString.default;

	for (const transformer of transformations) {
		transformer(magicStringInstance, source);
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

// eslint-disable-next-line complexity
export const generateLocalizedAssets = (
	compilation: Compilation,
	locales: LocaleData,
	sourceMapForLocales: LocaleName[],
	trackStringKeys: StringKeysCollection | undefined,
	localizeCompiler: LocalizeCompiler,
	hmrLocale?: string,
) => {
	const isWP5 = isWebpack5Compilation(compilation);
	// include localized filenames and hot module replacements
	const assets = (compilation as WP5.Compilation)
		.getAssets()
		.filter(
			// XXX test point - webpack 5 only here
			asset => asset.name.includes(assetNamePlaceholder)
				|| (asset.info.hotModuleReplacement && isWP5),
		);

	const hashManager = createHashManager(
		assets,
		locales,
	);

	for (const asset of assets) {
		const { source, map } = asset.source.sourceAndMap() as SourceAndMapResult;
		const localizedAssetNames: string[] = [];

		if (isJsFile.test(asset.name)) {
			const code = source.toString();
			// XXX TODO ensure undefined is ok for return type in all uses of these 3 functions
			const insertLocalizedStrings = createLocalizedStringInserter(
				code,
				compilation,
				localizeCompiler,
				locales,
				trackStringKeys,
			);
			const insertLocalizedAssetName = createLocalizedAssetNameInserter(code);
			const insertLocalizedContentHash = hashManager.getHashLocations(code);

			// if the work is already done, do nothing. we may be receiving this after its replaced
			if (isWP5
				&& asset.info.hotModuleReplacement
				&& !insertLocalizedStrings
				&& !insertLocalizedAssetName
				&& !insertLocalizedContentHash) {
				console.log(`XXX already processed or nothing to do ${asset.name}`); // XXX
				continue;
			}

			for (const locale of locales.names) {
				// only do user specified or english fallback for HMR for the moment.
				// TODO ideally would be nice to write a new file that loads the
				// 	appropriate one based on client-side code
				if (isWP5 && locale !== (hmrLocale ?? 'en-US') && asset.info.hotModuleReplacement) {
					console.log(`XXX skipping non-english/non-hmrlocale locale parsing ${locale} ${asset.name}`); // XXX
					continue;
				}

				let localizedAssetName = localizeAssetName(asset.name, locale);

				const newInfo = {
					...asset.info,
					locale,
				};

				// Add locale to hash for RealContentHashPlugin plugin
				localizedAssetName = hashManager.insertLocalizedContentHash(
					localizedAssetName,
					newInfo,
					locale,
				);

				const newAsset = transformAsset(
					{
						name: localizedAssetName,
						code,
						locale,
					},
					[
						// some may have no work to do, checked above
						...(insertLocalizedStrings ? [insertLocalizedStrings] : []),
						...(insertLocalizedAssetName ? [insertLocalizedAssetName] : []),
						...(insertLocalizedContentHash ? [insertLocalizedContentHash] : []),
					],
					map,
				);

				// for HMR, simply update the asset, same filename
				if (isWP5 && asset.info.hotModuleReplacement) {
					compilation.updateAsset(
						localizedAssetName,
						// @ts-expect-error Outdated @type
						newAsset,
						newInfo,
					);
					console.log('XXX updating localized asset!', localizedAssetName); // XXX
				} else {
					// push to list for later deletion
					localizedAssetNames.push(localizedAssetName);
					// @ts-expect-error Outdated @type
					compilation.emitAsset(
						localizedAssetName,
						newAsset,
						newInfo,
					);
					console.log('XXX emitting localized asset!', localizedAssetName); // XXX
				}
			}
		} else {
			const localesToIterate = (
				isSourceMap.test(asset.name) && sourceMapForLocales
					? sourceMapForLocales
					: locales.names
			);

			for (const locale of localesToIterate) {
				const newAssetName = localizeAssetName(asset.name, locale);
				localizedAssetNames.push(newAssetName);

				// @ts-expect-error Outdated @type
				compilation.emitAsset(
					newAssetName,
					asset.source,
					asset.info,
				);
			}
		}

		// Delete original unlocalized asset, unless HMR asset
		// (was updated earlier, should not be deleted)
		if (!asset.info.hotModuleReplacement || !isWP5) {
			deleteAsset(compilation, asset.name, localizedAssetNames);
		}
	}
};
