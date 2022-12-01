import WebpackError from 'webpack/lib/WebpackError.js';
import type { SimpleCallExpression } from 'estree';
import {
	Options,
	validateOptions,
	Module,
	NormalModuleFactory,
	LocalizedStringKey,
	LocalesMap,
	LocaleName,
	LocaleFilePath,
	LocalizeCompiler,
	WP5,
	LocalizeCompilerContext,
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
	markLocalizeFunction,
	fileNameTemplatePlaceholder,
} from './multi-locale';
import { callLocalizeCompiler } from './utils/call-localize-compiler';
import { stringifyAst } from './utils/stringify-ast';
import { name } from '../package.json';

const defaultLocalizerName = '__';

class LocalizeAssetsPlugin<LocalizedData = string> {
	private readonly options: Options<LocalizedData>;

	private readonly localeNames: LocaleName[];

	private readonly singleLocale?: LocaleName;

	private readonly localizeCompiler: LocalizeCompiler<LocalizedData>;

	private readonly functionNames: string[];

	private locales: LocalesMap<LocalizedData> = {};

	private fileDependencies = new Set<LocaleFilePath>();

	private trackStringKeys?: StringKeysCollection;

	constructor(options: Options<LocalizedData>) {
		validateOptions(options);

		this.options = options;

		this.localeNames = Object.keys(options.locales);
		if (this.localeNames.length === 1) {
			[this.singleLocale] = this.localeNames;
		}

		this.localizeCompiler = this.options.localizeCompiler ?? {
			[this.options.functionName ?? defaultLocalizerName]: defaultLocalizeCompilerFunction,
		};

		this.functionNames = Object.keys(this.localizeCompiler);
	}

	apply(compiler: WP5.Compiler) {
		const { inputFileSystem } = compiler;

		compiler.hooks.thisCompilation.tap(
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
					interpolateLocaleToFileName(compilation, fileNameTemplatePlaceholder, true);

					// Create localized assets by swapping out placeholders with localized strings
					generateLocalizedAssets(
						compilation,
						this.localeNames,
						this.locales,
						this.options.sourceMapForLocales || this.localeNames,
						this.trackStringKeys,
						this.localizeCompiler,
					);

					// Update chunkHash based on localized content
					compilation.hooks.chunkHash.tap(name, (chunk, hash) => {
						const modules = compilation.chunkGraph // WP5
							? compilation.chunkGraph.getChunkModules(chunk)
							: chunk.getModules();
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
		const { locales, singleLocale, functionNames } = this;
		const validator = localizedStringKeyValidator(locales, this.options.throwOnMissing);

		const handler = (
			parser: WP5.javascript.JavascriptParser,
			callExpressionNode: SimpleCallExpression,
			functionName: string,
		) => {
			const { module } = parser.state;
			const firstArgumentNode = callExpressionNode.arguments[0];

			// Enforce minimum requirement that first argument is a string
			if (
				!(
					callExpressionNode.arguments.length > 0
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

			const replacement = (
				singleLocale
					? this.getLocalizedString(callExpressionNode, stringKey, module, singleLocale)
					: this.getMarkedFunctionPlaceholder(callExpressionNode, stringKey, module)
			);
			toConstantDependency(parser, replacement)(callExpressionNode);

			return true;
		};

		for (const functionName of functionNames) {
			onFunctionCall(
				normalModuleFactory,
				functionName,
				(parser, node) => handler(parser, node, functionName),
			);
		}
	}

	/**
	 * For Single locale
	 *
	 * Insert the localized string during Webpack JS parsing.
	 * No need to use placeholder for string replacement on asset.
	 */
	private getLocalizedString(
		callNode: SimpleCallExpression,
		key: string,
		module: Module,
		singleLocale: string,
	): string {
		this.trackStringKeys?.delete(key);

		return callLocalizeCompiler(
			this.localizeCompiler,
			{
				callNode,
				resolveKey: (stringKey = key) => this.locales[singleLocale][stringKey],
				emitWarning: message => reportModuleWarning(module, new WebpackError(message)),
				emitError: message => reportModuleError(module, new WebpackError(message)),
			},
			singleLocale,
		);
	}

	/**
	 * For Multiple locales
	 *
	 * 1. Replace the `__(...)` call with a placeholder -> `asdf(__(...)) + asdf`
	 * 2. After the asset is generated & minified, search and replace the
	 * placeholder with calls to localizeCompiler
	 * 3. Repeat for each locale
	 */
	private getMarkedFunctionPlaceholder(
		callNode: SimpleCallExpression,
		key: string,
		module: Module,
	): string {
		// Track used keys for hash
		if (!module.buildInfo.localized) {
			module.buildInfo.localized = {};
		}

		if (!module.buildInfo.localized[key]) {
			module.buildInfo.localized[key] = this.localeNames.map(
				locale => this.locales[locale][key],
			);
		}

		return markLocalizeFunction(callNode);
	}

	static defaultLocalizeCompiler: LocalizeCompiler = {
		[defaultLocalizerName]: defaultLocalizeCompilerFunction,
	};
}

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

export default LocalizeAssetsPlugin;
