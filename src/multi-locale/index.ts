import type {
	NormalModuleFactory,
	WP5,
	LocalizeCompiler,
	Options,
} from '../types-internal.js';
import type { LocaleData } from '../utils/load-locale-data.js';
import {
	onLocalizerCall,
	onStringKey,
} from '../utils/on-localizer-call.js';
import { onAssetPath, onOptimizeAssets } from '../utils/webpack.js';
import { interpolateLocaleToFileName } from '../utils/localize-filename.js';
import { name } from '../../package.json';
import { insertPlaceholderFunction } from './insert-placeholder-function.js';
import { generateLocalizedAssets, fileNameTemplatePlaceholder } from './generate-localized-assets.js';

export const handleMultiLocaleLocalization = (
	compilation: WP5.Compilation,
	normalModuleFactory: NormalModuleFactory,
	options: Options,
	locales: LocaleData,
	localizeCompiler: LocalizeCompiler,
	functionNames: string[],
	trackUsedKeys?: Set<string>,
) => {
	onLocalizerCall(
		normalModuleFactory,
		functionNames,
		onStringKey(
			locales,
			options,
			stringKeyHit => insertPlaceholderFunction(
				locales,
				stringKeyHit,
			),
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
		interpolateLocaleToFileName(
			compilation,
			fileNameTemplatePlaceholder,
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

	// TODO Maybe change compilation type above WP4 + WP5
	// And type-guard the below WP5 code?

	// Update chunkHash based on localized content
	compilation.hooks.chunkHash.tap(
		name,
		(chunk, hash) => {
			const modules = compilation.chunkGraph // WP5
				? compilation.chunkGraph.getChunkModules(chunk)
				: chunk.getModules();

			const localizedModules = modules
				.map(module => module.buildInfo.localized)
				.filter(Boolean);
				// TODO is this necessary? Wouldn't it always be true based on multi-locale code

			// TODO: Probably needs to be sorted?
			if (localizedModules.length > 0) {
				hash.update(JSON.stringify(localizedModules));
			}
		},
	);
};
