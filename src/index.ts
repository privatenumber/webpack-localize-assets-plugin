import WebpackError from 'webpack/lib/WebpackError.js';
import {
	Options,
	OptionsSchema,
	Compiler,
	NormalModuleFactory,
	LocalizedStringKey,
	LocalesMap,
	LocaleName,
	LocaleFilePath,
	WP5,
} from './types';
import { loadLocales } from './utils/load-locales';
import { interpolateLocaleToFileName } from './utils/localize-filename';
import { StringKeysCollection, getAllLocalizedStringKeys, warnOnUnusedLocalizedStringKeys } from './utils/track-unused-localized-strings';
import {
	toConstantDependency,
	reportModuleWarning,
	onFunctionCall,
} from './utils/webpack';
import { localizedStringKeyValidator } from './utils/localized-string-key-validator';
import {
	generateLocalizedAssets,
	getPlaceholder,
	fileNameTemplatePlaceholder,
} from './multi-locale';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../package.json');

class LocalizeAssetsPlugin {
	private readonly options: Options;

	private locales: LocalesMap = {};

	private readonly localeNames: LocaleName[];

	private readonly singleLocale?: LocaleName;

	private fileDependencies = new Set<LocaleFilePath>();

	private trackStringKeys?: StringKeysCollection;

	constructor(options: Options) {
		OptionsSchema.parse(options);
		this.options = options;

		this.localeNames = Object.keys(options.locales);
		if (this.localeNames.length === 1) {
			[this.singleLocale] = Object.keys(options.locales);
		}
	}

	apply(compiler: Compiler) {
		const { inputFileSystem } = compiler;

		(compiler as WP5.Compiler).hooks.thisCompilation.tap(
			name,
			(compilation, { normalModuleFactory }) => {
				// Reload on build
				const { fileDependencies, locales } = loadLocales(inputFileSystem, this.options.locales);

				this.fileDependencies = fileDependencies;
				this.locales = locales;

				this.interceptTranslationFunctionCalls(normalModuleFactory as NormalModuleFactory);

				if (this.options.warnOnUnusedString) {
					const unusedStringKeys = getAllLocalizedStringKeys(locales);

					/**
					 * Using something like compiler.done happens
					 * too late after the stats are reported in watch mode
					 */
					compilation.hooks.afterSeal.tap(
						name,
						() => warnOnUnusedLocalizedStringKeys(unusedStringKeys, compilation),
					);

					this.trackStringKeys = unusedStringKeys;
				}

				if (this.singleLocale) {
					interpolateLocaleToFileName(compilation, this.singleLocale);
				} else {
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
					interpolateLocaleToFileName(compilation, fileNameTemplatePlaceholder);

					// Create localized assets by swapping out placeholders with localized strings
					generateLocalizedAssets(
						compilation,
						this.localeNames,
						this.locales,
						this.options.sourceMapForLocales,
						this.trackStringKeys,
					);
				}
			},
		);
	}

	private interceptTranslationFunctionCalls(
		normalModuleFactory: NormalModuleFactory,
	) {
		const { singleLocale, locales } = this;
		const { functionName = '__', emitFunctionCall = false } = this.options;
		const validator = localizedStringKeyValidator(locales, this.options.throwOnMissing);

		onFunctionCall(
			normalModuleFactory,
			functionName,
			(parser, callExpressionNode) => {
				const { module } = parser.state;
				const firstArgumentNode = callExpressionNode.arguments[0];

				// If we're leaving a __() call in the output (only rewriting the first argument),
				// it's ok if there were other arguments because
				// __()'s implementation can take care of them.
				if (
					!(
						(emitFunctionCall || callExpressionNode.arguments.length === 1)
						&& firstArgumentNode.type === 'Literal'
						&& typeof firstArgumentNode.value === 'string'
					)
				) {
					const location = callExpressionNode.loc!.start;
					reportModuleWarning(
						module,
						new WebpackError(`[${name}] Ignoring confusing usage of localization function "${functionName}" in ${module.resource}:${location.line}:${location.column}`),
					);
					return;
				}

				const stringKey: LocalizedStringKey = firstArgumentNode.value;

				validator.assertValidLocaleString(
					stringKey,
					module,
					callExpressionNode,
				);

				for (const fileDependency of this.fileDependencies) {
					module.buildInfo.fileDependencies.add(fileDependency);
				}

				const nodeToReplace = emitFunctionCall
					? callExpressionNode.arguments[0]
					: callExpressionNode;

				if (singleLocale) {
					toConstantDependency(
						parser,
						JSON.stringify(locales[singleLocale][stringKey] || stringKey),
					)(nodeToReplace);

					this.trackStringKeys?.delete(stringKey);
				} else {
					const placeholder = getPlaceholder(stringKey);
					toConstantDependency(parser, JSON.stringify(placeholder))(nodeToReplace);
				}

				return true;
			},
		);
	}
}

export = LocalizeAssetsPlugin;
