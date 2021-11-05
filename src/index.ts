import WebpackError from 'webpack/lib/WebpackError.js';
import type { SimpleCallExpression } from 'estree';
import {
	Options,
	validateOptions,
	Compiler,
	Module,
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
	reportModuleError,
} from './utils/webpack';
import { localizedStringKeyValidator } from './utils/localized-string-key-validator';
import {
	generateLocalizedAssets,
	getPlaceholder,
	fileNameTemplatePlaceholder,
} from './multi-locale';
import { printAST } from './utils/print-ast';
import { callLocalizeCompiler } from './utils/localize-compiler';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../package.json');

class LocalizeAssetsPlugin<LocalizedData = string> {
	private readonly options: Options<LocalizedData>;

	private locales: LocalesMap<LocalizedData> = {};

	private readonly localeNames: LocaleName[];

	private readonly singleLocale?: LocaleName;

	private fileDependencies = new Set<LocaleFilePath>();

	private trackStringKeys?: StringKeysCollection;

	constructor(options: Options<LocalizedData>) {
		validateOptions(options);
		this.options = options;

		this.localeNames = Object.keys(options.locales);
		if (this.localeNames.length === 1) {
			[this.singleLocale] = this.localeNames;
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
						this.options.sourceMapForLocales || this.localeNames,
						this.trackStringKeys,
						this.options.localizeCompiler,
					);

					// Update chunkHash based on localized content
					compilation.hooks.chunkHash.tap(name, (chunk, hash) => {
						const modules = chunk.getModules();
						const localizedModules = modules
							.map(module => module.buildInfo.localized)
							.filter(Boolean);

						if (localizedModules.length > 0) {
							hash.update(JSON.stringify(localizedModules));
						}
					});
				}
			},
		);
	}

	private interceptTranslationFunctionCalls(
		normalModuleFactory: NormalModuleFactory,
	) {
		const { locales } = this;
		const { functionName = '__' } = this.options;
		const validator = localizedStringKeyValidator(locales, this.options.throwOnMissing);

		onFunctionCall(
			normalModuleFactory,
			functionName,
			(parser, callExpressionNode) => {
				const { module } = parser.state;
				const firstArgumentNode = callExpressionNode.arguments[0];

				if (
					!(
						(this.options.localizeCompiler || callExpressionNode.arguments.length === 1)
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

				const replacement = this.getReplacementExpr(callExpressionNode, stringKey, module);
				toConstantDependency(parser, replacement)(callExpressionNode);

				return true;
			},
		);
	}

	private getReplacementExpr(callExpr: SimpleCallExpression, key: string, module: Module): string {
		if (this.singleLocale) {
			// single locale - let's insert the localised version of the string right now,
			// no need to use placeholder for string replacement on the asset

			const locale = this.locales[this.singleLocale];
			const localizedData = locale[key];

			if (this.options.localizeCompiler) {
				return callLocalizeCompiler(
					this.options.localizeCompiler,
					{
						callNode: callExpr,
						resolve: (stringKey: string) => this.locales[this.singleLocale!][stringKey],
						emitWarning(message) {
							reportModuleWarning(module, new WebpackError(message));
						},
						emitError(message) {
							reportModuleError(module, new WebpackError(message));
						},
					},
					this.singleLocale,
				);
			}

			this.trackStringKeys?.delete(key);

			return JSON.stringify(localizedData || key);
		}

		if (!module.buildInfo.localized) {
			module.buildInfo.localized = {};
		}

		if (!module.buildInfo.localized[key]) {
			module.buildInfo.localized[key] = this.localeNames.map(
				locale => this.locales[locale][key],
			);
		}

		// OK, we have multiple locales. Let's replace the `__()` call
		// with a string literal containing a placeholder value.
		// Then during asset generation we'll parse that placeholder
		// and use it to generate localised assets.
		//
		// If localizeCompiler is overridden, we'll write the entire CallExpression
		// into the placeholder so that we can re-parse it and give it to localizeCompiler later.
		// Otherwise, we'll just write the stringKey.
		// (This is an optimisation - avoid printing and parsing the expression if we don't need to)
		const placeholderContent = this.options.localizeCompiler
			? printAST(callExpr)
			: JSON.stringify(key);

		return getPlaceholder(placeholderContent);
	}
}

export = LocalizeAssetsPlugin;
