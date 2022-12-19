import { name } from '../package.json';
import {
	Options,
	validateOptions,
	LocalizeCompiler,
	WP5,
	LocalizeCompilerContext,
} from './types-internal.js';
import { loadLocaleData } from './utils/load-locale-data.js';
import { interpolateLocaleToFileName } from './utils/localize-filename.js';
import {
	generateLocalizedAssets,
	fileNameTemplatePlaceholder,
	getMarkedFunctionPlaceholder,
} from './multi-locale.js';
import { stringifyAst } from './utils/stringify-ast.js';
import { getLocalizedString } from './single-locale.js';
import {
	onLocalizerCall,
	onStringKey,
} from './utils/on-localizer-call.js';
import { onOptimizeAssets, onAssetPath } from './utils/webpack.js';
import { warnOnUnsuedKeys } from './utils/warn-on-unused-keys.js';

const defaultLocalizerName = '__';

function defaultLocalizeCompilerFunction(
	this: LocalizeCompilerContext,
	localizerArguments: string[],
) {
	const [key] = localizerArguments;

	if (localizerArguments.length > 1) {
		let code = stringifyAst(this.callNode);
		if (code.length > 80) {
			code = `${code.slice(0, 80)}…`;
		}
		this.emitWarning(`[${name}] Ignoring confusing usage of localization function: ${code})`);
		return key;
	}

	const keyResolved = this.resolveKey();
	return keyResolved ? JSON.stringify(keyResolved) : key;
}

class LocalizeAssetsPlugin {
	private readonly options: Options;

	private readonly localizeCompiler: LocalizeCompiler;

	constructor(options: Options) {
		validateOptions(options);
		this.options = options;
		this.localizeCompiler = options.localizeCompiler ?? {
			[options.functionName ?? defaultLocalizerName]: defaultLocalizeCompilerFunction,
		};
	}

	apply(compiler: WP5.Compiler) {
		const { options } = this;

		compiler.hooks.thisCompilation.tap(
			name,
			(compilation, { normalModuleFactory }) => {
				const locales = loadLocaleData(compiler, options.locales);
				const functionNames = Object.keys(this.localizeCompiler);
				const trackUsedKeys = (
					options.warnOnUnusedString
						? warnOnUnsuedKeys(compilation, locales.data)
						: undefined
				);

				if (locales.names.length === 1) {
					const [localeName] = locales.names;

					onLocalizerCall(
						normalModuleFactory,
						functionNames,
						onStringKey(
							locales,
							options,
							stringKeyHit => {
								trackUsedKeys?.delete(stringKeyHit.key);

								return getLocalizedString(
									this.localizeCompiler,
									locales,
									stringKeyHit,
									localeName,
								);
							},
						),
					);

					onAssetPath(
						compilation,
						interpolateLocaleToFileName(compilation, localeName),
					);
				} else {
					onLocalizerCall(
						normalModuleFactory,
						functionNames,
						onStringKey(
							locales,
							options,
							stringKeyHit => getMarkedFunctionPlaceholder(
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
							this.localizeCompiler,
						),
					);

					// Update chunkHash based on localized content
					compilation.hooks.chunkHash.tap(
						name,
						(chunk, hash) => {
							const modules = compilation.chunkGraph // WP5
								? compilation.chunkGraph.getChunkModules(chunk)
								: chunk.getModules();

							const localizedModules = modules
								.map(module => module.buildInfo.localized)
								.filter(Boolean); // TODO is this necessary? Wouldn't it always be true based on multi-locale code

							// TODO: Probably needs to be sorted?
							if (localizedModules.length > 0) {
								hash.update(JSON.stringify(localizedModules));
							}
						},
					);
				}
			},
		);
	}

	static defaultLocalizeCompiler: LocalizeCompiler = {
		[defaultLocalizerName]: defaultLocalizeCompilerFunction,
	};
}

export default LocalizeAssetsPlugin;
