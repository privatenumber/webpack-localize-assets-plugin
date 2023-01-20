import { SourceAndMapResult, RawSource, SourceMapSource } from 'webpack-sources';
import MagicString from 'magic-string';
import { RawSourceMap } from 'source-map';
import { deleteAsset } from '../utils/webpack.js';
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

export const generateLocalizedAssets = (
	compilation: Compilation,
	locales: LocaleData,
	sourceMapForLocales: LocaleName[],
	trackStringKeys: StringKeysCollection | undefined,
	localizeCompiler: LocalizeCompiler,
) => {
	const assets = (compilation as WP5.Compilation)
		.getAssets()
		.filter(
			asset => asset.name.includes(assetNamePlaceholder),
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
			const insertLocalizedStrings = createLocalizedStringInserter(
				code,
				compilation,
				localizeCompiler,
				locales,
				trackStringKeys,
			);
			const insertLocalizedAssetName = createLocalizedAssetNameInserter(code);
			const insertLocalizedContentHash = hashManager.getHashLocations(code);

			for (const locale of locales.names) {
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

				localizedAssetNames.push(localizedAssetName);

				// @ts-expect-error Outdated @type
				compilation.emitAsset(
					localizedAssetName,
					transformAsset(
						{
							name: localizedAssetName,
							code,
							locale,
						},
						[
							insertLocalizedStrings,
							insertLocalizedAssetName,
							insertLocalizedContentHash,
						],
						map,
					),
					newInfo,
				);
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

		// Delete original unlocalized asset
		deleteAsset(compilation, asset.name, localizedAssetNames);
	}
};
