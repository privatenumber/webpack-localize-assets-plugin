import type {
	NormalModuleFactory,
	WP5,
	LocalizeCompiler,
	Options,
} from '../types-internal.js';
import type { LocaleData } from '../utils/load-locale-data.js';
import {
	onLocaleUsage,
	onLocalizerCall,
	onStringKey,
} from '../utils/on-localizer-call.js';
import { onAssetPath, onOptimizeAssets } from '../utils/webpack.js';
import { replaceLocaleInAssetName } from '../utils/localize-filename.js';
import { name } from '../../package.json';
import { insertPlaceholderFunction, insertPlaceholderName } from './localizer-function.js';
import { generateLocalizedAssets } from './generate-localized-assets.js';
import { assetNamePlaceholder } from './asset-name.js';

export const handleMultiLocaleLocalization = (
	compilation: WP5.Compilation,
	normalModuleFactory: NormalModuleFactory,
	options: Options,
	locales: LocaleData,
	localizeCompiler: LocalizeCompiler,
	functionNames: string[],
	localeVariable: string,
	trackUsedKeys?: Set<string>,
) => {
	onLocalizerCall(
		normalModuleFactory,
		functionNames,
		localeVariable,
		onStringKey(
			locales,
			options,
			stringKeyHit => insertPlaceholderFunction(
				locales,
				stringKeyHit,
			),
		),
		onLocaleUsage(
			locales,
			variableHit => insertPlaceholderName(locales, variableHit),
		),
	);

	/**
	 * The reason why we replace "[locale]" with a placeholder instead of
	 * the actual locale is because the name is used to load chunks.
	 *
	 * That means a file can be loading another file like `load('./file.[locale].js')`.
	 * We later localize the assets by search-and-replacing instances of
	 * `[locale]` with the actual locale.
	 *
	 * The placeholder is a unique enough string to guarantee that we're not accidentally
	 * replacing `[locale]` if it happens to be in the source JS.
	 */
	onAssetPath(
		compilation,
		replaceLocaleInAssetName(
			compilation,
			assetNamePlaceholder,
			true,
		),
	);

	// Create localized assets by swapping out placeholders with localized strings
	onOptimizeAssets(
		compilation,
		() => generateLocalizedAssets(
			compilation,
			locales,
			options.sourceMapForLocales || locales.names,
			trackUsedKeys,
			localizeCompiler,
		),
	);

	// Update chunkHash based on localized content
	compilation.hooks.chunkHash.tap(
		name,
		(chunk, hash) => {
			const allModules = compilation.chunkGraph // WP5
				? compilation.chunkGraph.getChunkModules(chunk)
				: chunk.getModules();

			const localizedModules = allModules
				.map(module => module.buildInfo.localized)
				.filter(Boolean);

			if (localizedModules.length > 0) {
				hash.update(JSON.stringify(localizedModules));
			}
		},
	);
};
