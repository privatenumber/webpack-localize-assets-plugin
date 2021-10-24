import assert from 'assert';
import path from 'path';
import { RawSource, SourceMapSource, SourceAndMapResult } from 'webpack-sources';
import { RawSourceMap } from 'source-map';
import MagicString from 'magic-string';
import hasOwnProp from 'has-own-prop';
import WebpackError from 'webpack/lib/WebpackError.js';
// estree is a types-only package
// eslint-disable-next-line import/no-unresolved
import { CallExpression, Literal } from 'estree';
import * as astring from 'astring';
import * as acorn from 'acorn';
import {
	sha256,
	base64,
	findSubstringLocations,
	toConstantDependency,
	isWebpack5Compilation,
	deleteAsset,
	reportModuleWarning,
	loadJson,
} from './utils';
import {
	Options,
	validateOptions,
	PlaceholderLocation,
	Plugin,
	Compiler,
	Compilation,
	NormalModuleFactory,
	WP5,
	Locale,
} from './types';

const fileNameTemplatePlaceholder = `[locale:${sha256('locale-placeholder').slice(0, 8)}]`;
const fileNameTemplatePlaceholderPattern = new RegExp(fileNameTemplatePlaceholder.replace(/[[\]]/g, '\\$&'), 'g');
const isJsFile = /\.js$/;
const isSourceMap = /\.js\.map$/;

const placeholderPrefix = sha256('localize-assets-plugin-placeholder-prefix').slice(0, 8);
const placeholderSuffix = '|';

const astringOptions = Object.freeze({ indent: '', lineEnd: '' });

class LocalizeAssetsPlugin<LocalizedData = string> implements Plugin {
	private readonly options: Options<LocalizedData>;

	private readonly locales: Record<string, Locale<LocalizedData>> = {};

	private readonly localeNames: string[];

	private readonly singleLocale?: string;

	private readonly validatedLocales = new Set<string>();

	private readonly fileDependencies = new Set<string>();

	private readonly trackStringKeys = new Set<string>();

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

		compiler.hooks.thisCompilation.tap(
			LocalizeAssetsPlugin.name,
			(compilation: Compilation, { normalModuleFactory }) => {
				this.loadLocales(inputFileSystem);

				// Validate output file name
				const { filename, chunkFilename } = compilation.outputOptions;
				assert(filename.includes('[locale]'), 'output.filename must include [locale]');
				assert(chunkFilename.includes('[locale]'), 'output.chunkFilename must include [locale]');

				// Insert locale placeholders into assets and asset names
				this.validatedLocales.clear();
				this.interpolateLocaleToFileName(compilation);
				this.insertLocalePlaceholders(normalModuleFactory);

				if (!this.singleLocale) {
					// Create localized assets by swapping out placeholders with localized strings
					this.generateLocalizedAssets(compilation);
				}

				if (this.options.warnOnUnusedString) {
					/**
					 * Using something like compiler.done happens
					 * too late after the stats are reported in watch mode
					 */
					compilation.hooks.afterSeal.tap(
						LocalizeAssetsPlugin.name,
						() => {
							if (this.trackStringKeys.size > 0) {
								for (const unusedStringKey of this.trackStringKeys) {
									const error = new WebpackError(`[${LocalizeAssetsPlugin.name}] Unused string key "${unusedStringKey}"`);
									compilation.warnings.push(error);
								}
							}
						},
					);
				}
			},
		);
	}

	private loadLocales(fs) {
		this.fileDependencies.clear();
		for (const locale of this.localeNames) {
			const localeValue = this.options.locales[locale];
			if (typeof localeValue === 'string') {
				const resolvedPath = path.resolve(localeValue);
				this.locales[locale] = loadJson(fs, resolvedPath);
				this.fileDependencies.add(resolvedPath);
			} else {
				this.locales[locale] = localeValue;
			}
		}

		if (this.options.warnOnUnusedString) {
			for (const locale of this.localeNames) {
				for (const stringKey of Object.keys(this.locales[locale])) {
					this.trackStringKeys.add(stringKey);
				}
			}
		}
	}

	private interpolateLocaleToFileName(compilation: Compilation) {
		const replaceWith = this.singleLocale ?? fileNameTemplatePlaceholder;
		const interpolate = (filePath) => {
			if (typeof filePath === 'string') {
				filePath = filePath.replace(/\[locale]/g, replaceWith);
			}
			return filePath;
		};

		if (isWebpack5Compilation(compilation)) {
			compilation.hooks.assetPath.tap(
				LocalizeAssetsPlugin.name,
				interpolate,
			);
		} else {
			// @ts-expect-error Missing hook from @type
			compilation.mainTemplate.hooks.assetPath.tap(
				LocalizeAssetsPlugin.name,
				interpolate,
			);
		}
	}

	private validateLocale(
		stringKey: string,
		module,
		node,
	) {
		if (this.validatedLocales.has(stringKey)) {
			return;
		}

		const { locales } = this;
		const { throwOnMissing } = this.options;

		const missingFromLocales = this.localeNames.filter(
			locale => !hasOwnProp(locales[locale], stringKey),
		);
		const isMissingFromLocales = missingFromLocales.length > 0;

		this.validatedLocales.add(stringKey);

		if (isMissingFromLocales) {
			const location = node.loc.start;
			const error = new WebpackError(`[${LocalizeAssetsPlugin.name}] Missing localization for key "${stringKey}" used in ${module.resource}:${location.line}:${location.column} from locales: ${missingFromLocales.join(', ')}`);
			if (throwOnMissing) {
				throw error;
			} else {
				reportModuleWarning(
					module,
					error,
				);
			}
		}
	}

	private insertLocalePlaceholders(
		normalModuleFactory: NormalModuleFactory,
	) {
		const { functionName = '__' } = this.options;

		const handler = (parser) => {
			parser.hooks.call.for(functionName).tap(LocalizeAssetsPlugin.name, (callExpressionNode) => {
				const { module } = parser.state;
				const firstArgumentNode = callExpressionNode.arguments[0];

				if (
					(this.options.localizeCompiler || callExpressionNode.arguments.length === 1)
					&& firstArgumentNode.type === 'Literal'
					&& typeof firstArgumentNode.value === 'string'
				) {
					const stringKey = firstArgumentNode.value;
					this.validateLocale(
						stringKey,
						module,
						callExpressionNode,
					);

					for (const fileDependency of this.fileDependencies) {
						module.buildInfo.fileDependencies.add(fileDependency);
					}

					const replacement = this.getReplacementExpr(callExpressionNode, stringKey);
					toConstantDependency(parser, replacement)(callExpressionNode);

					if (this.options.warnOnUnusedString) {
						this.trackStringKeys.delete(stringKey);
					}

					return true;
				}

				const location = callExpressionNode.loc.start;
				reportModuleWarning(
					module,
					new WebpackError(`[${LocalizeAssetsPlugin.name}] Ignoring confusing usage of localization function "${functionName}" in ${module.resource}:${location.line}:${location.column}`),
				);
			});
		};

		normalModuleFactory.hooks.parser
			.for('javascript/auto')
			.tap(LocalizeAssetsPlugin.name, handler);
		normalModuleFactory.hooks.parser
			.for('javascript/dynamic')
			.tap(LocalizeAssetsPlugin.name, handler);
		normalModuleFactory.hooks.parser
			.for('javascript/esm')
			.tap(LocalizeAssetsPlugin.name, handler);
	}

	private getReplacementExpr(callExpr: CallExpression, key: string): string {
		if (this.singleLocale) {
			// single locale - let's insert the localised version of the string right now,
			// no need to use placeholder for string replacement on the asset

			const locale = this.locales[this.singleLocale];
			const localizedData = locale[key];

			if (this.options.localizeCompiler) {
				const result = this.options.localizeCompiler({
					callExpr,
					key,
					locale,
					localeName: this.singleLocale,
					locales: this.locales,
					localizedData,
				});
				return typeof result === 'string'
					? result
					: astring.generate(result, astringOptions);
			}

			return JSON.stringify(localizedData || key);
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
			? astring.generate(callExpr, astringOptions)
			: key;
		const placeholderContentEncoded = base64.encode(placeholderContent);
		const placeholder = placeholderPrefix + placeholderContentEncoded + placeholderSuffix;
		return JSON.stringify(placeholder);
	}

	private locatePlaceholders(sourceString: string) {
		const placeholderLocations: PlaceholderLocation[] = [];

		const possibleLocations = findSubstringLocations(sourceString, placeholderPrefix);
		for (const placeholderIndex of possibleLocations) {
			const startIndex = placeholderIndex + placeholderPrefix.length;
			const suffixIndex = sourceString.indexOf(placeholderSuffix, startIndex);

			if (suffixIndex === -1) {
				continue;
			}

			const placeholder = sourceString.slice(startIndex, suffixIndex);
			const decoded = base64.decode(placeholder);

			if (this.options.localizeCompiler) {
				// the decoded string is a JS expression
				const expr = acorn.parseExpressionAt(decoded, 0, { ecmaVersion: 'latest' });
				placeholderLocations.push({
					expr: expr as unknown as CallExpression,
					index: placeholderIndex,
					endIndex: suffixIndex + placeholderSuffix.length,
				});
			} else {
				// the decoded string is the stringKey
				placeholderLocations.push({
					key: decoded,
					index: placeholderIndex,
					endIndex: suffixIndex + placeholderSuffix.length,
				});
			}
		}

		return placeholderLocations;
	}

	private generateLocalizedAssets(compilation: Compilation) {
		const { localeNames } = this;
		const { sourceMapForLocales } = this.options;

		const generateLocalizedAssets = async () => {
			// @ts-expect-error Outdated @type
			const assetsWithInfo = compilation.getAssets()
				.filter(asset => asset.name.includes(fileNameTemplatePlaceholder));

			await Promise.all(assetsWithInfo.map(async (asset) => {
				const { source, map } = asset.source.sourceAndMap() as SourceAndMapResult;
				const localizedAssetNames: string[] = [];

				if (isJsFile.test(asset.name)) {
					const sourceString = source.toString();
					const placeholderLocations = this.locatePlaceholders(sourceString);
					const fileNamePlaceholderLocations = findSubstringLocations(
						sourceString,
						fileNameTemplatePlaceholder,
					);

					await Promise.all(localeNames.map(async (locale) => {
						const newAssetName = asset.name.replace(fileNameTemplatePlaceholderPattern, locale);
						localizedAssetNames.push(newAssetName);

						const localizedSource = this.localizeAsset(
							locale,
							newAssetName,
							placeholderLocations,
							fileNamePlaceholderLocations,
							sourceString,
							(
								(!sourceMapForLocales || sourceMapForLocales.includes(locale))
									? map
									: null
							),
						);

						// @ts-expect-error Outdated @type
						compilation.emitAsset(
							newAssetName,
							localizedSource,
							{
								...asset.info,
								locale,
							},
						);
					}));
				} else {
					let localesToIterate = localeNames;
					if (isSourceMap.test(asset.name) && sourceMapForLocales) {
						localesToIterate = sourceMapForLocales;
					}

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

		// When we have a custom localisation compiler,
		// we have to run asset generation before minification,
		// since the compiler may generate code which needs minifying.
		// Otherwise, we can run after minification as an optimisation
		if (isWebpack5Compilation(compilation)) {
			const stage = this.options.localizeCompiler
				? (compilation.constructor as typeof WP5.Compilation).PROCESS_ASSETS_STAGE_DERIVED
				: (compilation.constructor as typeof WP5.Compilation).PROCESS_ASSETS_STAGE_ANALYSE;
			compilation.hooks.processAssets.tapPromise(
				{
					name: LocalizeAssetsPlugin.name,
					stage,
				},
				generateLocalizedAssets,
			);
		} else {
			const hook = this.options.localizeCompiler
				? compilation.hooks.additionalAssets
				: compilation.hooks.optimizeAssets;
			hook.tapPromise(
				LocalizeAssetsPlugin.name,
				generateLocalizedAssets,
			);
		}
	}

	private localizeAsset(
		locale: string,
		assetName: string,
		placeholderLocations: PlaceholderLocation[],
		fileNamePlaceholderLocations: number[],
		source: string,
		map: RawSourceMap | null,
	) {
		const localeData = this.locales[locale];
		const magicStringInstance = new MagicString(source);

		// Localize strings
		for (const loc of placeholderLocations) {
			let stringKey;
			if (this.options.localizeCompiler) {
				const callExpr = (loc as { expr: CallExpression }).expr;
				stringKey = (callExpr.arguments[0] as Literal).value as string;
				const localizedValue = localeData[stringKey];
				const result = this.options.localizeCompiler({
					callExpr,
					key: stringKey,
					locale: localeData,
					localeName: locale,
					locales: this.locales,
					localizedData: localizedValue,
				});

				const localizedCode = typeof result === 'string'
					? result
					: astring.generate(result, astringOptions);

				// we're running before minification, so we can safely assume that the
				// placeholder is directly inside a string literal.
				// `localizedCode` is an arbitrary JS expression,
				// so we want to replace code one character either side of the placeholder
				// in order to eat the string literal's quotes.
				magicStringInstance.overwrite(
					loc.index - 1,
					loc.endIndex + 1,
					localizedCode,
				);
			} else {
				// if localizedCompiler is undefined then LocalizedValue = string.
				stringKey = (loc as { key: string }).key;

				// we're running after minification, which means that the placeholder
				// may have (eg) been concated into another string.
				// so here we're going to replace only the placeholder itself
				const localizedString = JSON.stringify(localeData[stringKey] || stringKey).slice(1, -1);
				magicStringInstance.overwrite(
					loc.index,
					loc.endIndex,
					localizedString,
				);
			}

			// For Webpack 5 cache hits
			if (this.options.warnOnUnusedString) {
				this.trackStringKeys.delete(stringKey);
			}
		}

		// Localize chunk requests
		for (const location of fileNamePlaceholderLocations) {
			magicStringInstance.overwrite(
				location,
				location + fileNameTemplatePlaceholder.length,
				locale,
			);
		}

		const localizedCode = magicStringInstance.toString();

		if (map) {
			const newSourceMap = magicStringInstance.generateMap({
				source: assetName,
				includeContent: true,
			});

			return new SourceMapSource(
				localizedCode,
				assetName,
				newSourceMap,
				source,
				map,
				true,
			);
		}

		return new RawSource(localizedCode);
	}
}

export = LocalizeAssetsPlugin;
