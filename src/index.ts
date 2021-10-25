import assert from 'assert';
import path from 'path';
import { RawSource, SourceMapSource, SourceAndMapResult } from 'webpack-sources';
import { RawSourceMap } from 'source-map';
import MagicString from 'magic-string';
import hasOwnProp from 'has-own-prop';
import WebpackError from 'webpack/lib/WebpackError.js';
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
	OptionsSchema,
	PlaceholderLocations,
	Plugin,
	Compiler,
	Compilation,
	NormalModuleFactory,
	WP5,
} from './types';

const fileNameTemplatePlaceholder = `[locale:${sha256('locale-placeholder').slice(0, 8)}]`;
const fileNameTemplatePlaceholderPattern = new RegExp(fileNameTemplatePlaceholder.replace(/[[\]]/g, '\\$&'), 'g');
const isJsFile = /\.js$/;
const isSourceMap = /\.js\.map$/;

const placeholderPrefix = sha256('localize-assets-plugin-placeholder-prefix').slice(0, 8);
const placeholderSuffix = '|';

class LocalizeAssetsPlugin implements Plugin {
	private readonly options: Options;

	private readonly locales: Options['locales'] = {};

	private readonly localeNames: string[];

	private readonly singleLocale?: string;

	private readonly validatedLocales = new Set<string>();

	private readonly fileDependencies = new Set<string>();

	private readonly trackStringKeys = new Set<string>();

	constructor(options: Options) {
		OptionsSchema.parse(options);
		this.options = options;

		this.localeNames = Object.keys(options.locales);
		if (this.localeNames.length === 1) {
			[this.singleLocale] = this.localeNames;
		}
	}

	apply(compiler: Compiler) {
		const { inputFileSystem } = compiler;

		// Validate output file name
		compiler.hooks.thisCompilation.tap(
			LocalizeAssetsPlugin.name,
			(compilation: Compilation, { normalModuleFactory }) => {
				this.loadLocales(inputFileSystem);

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
		const { singleLocale } = this;
		const functionNames = this.options.functionNames ?? [this.options.functionName ?? '__'];

		const handler = (parser) => {
			const callExpressionNodeHandler = functionName => (callExpressionNode) => {
				const { module } = parser.state;
				const firstArgumentNode = callExpressionNode.arguments[0];

				if (
					callExpressionNode.arguments.length === 1
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

					if (singleLocale) {
						toConstantDependency(
							parser,
							JSON.stringify(this.locales[singleLocale][stringKey] || stringKey),
						)(callExpressionNode);
					} else {
						const placeholder = placeholderPrefix + base64.encode(stringKey) + placeholderSuffix;
						toConstantDependency(parser, JSON.stringify(placeholder))(callExpressionNode);
					}

					// For single locale mode
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
			};
			for (const functionName of functionNames) {
				parser.hooks.call
					.for(functionName)
					.tap(LocalizeAssetsPlugin.name, callExpressionNodeHandler(functionName));
			}
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

	private locatePlaceholders(sourceString: string) {
		const placeholderLocations: PlaceholderLocations = [];

		const possibleLocations = findSubstringLocations(sourceString, placeholderPrefix);
		for (const placeholderIndex of possibleLocations) {
			const placeholderStartIndex = placeholderIndex + placeholderPrefix.length;
			const placeholderSuffixIndex = sourceString.indexOf(placeholderSuffix, placeholderStartIndex);

			if (placeholderSuffixIndex === -1) {
				continue;
			}

			const placeholder = sourceString.slice(
				placeholderStartIndex,
				placeholderSuffixIndex,
			);

			const stringKey = base64.decode(placeholder);
			if (stringKey) {
				placeholderLocations.push({
					stringKey,
					index: placeholderIndex,
					endIndex: placeholderSuffixIndex + placeholderSuffix.length,
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

		// Apply after minification since we don't want to
		// duplicate the costs of that for each asset
		if (isWebpack5Compilation(compilation)) {
			// Happens after PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE
			compilation.hooks.processAssets.tapPromise(
				{
					name: LocalizeAssetsPlugin.name,
					stage: (compilation.constructor as typeof WP5.Compilation).PROCESS_ASSETS_STAGE_ANALYSE,
				},
				generateLocalizedAssets,
			);
		} else {
			// Triggered after minification, which usually happens in optimizeChunkAssets
			compilation.hooks.optimizeAssets.tapPromise(
				LocalizeAssetsPlugin.name,
				generateLocalizedAssets,
			);
		}
	}

	private localizeAsset(
		locale: string,
		assetName: string,
		placeholderLocations: PlaceholderLocations,
		fileNamePlaceholderLocations: number[],
		source: string,
		map: RawSourceMap | null,
	) {
		const localeData = this.locales[locale];
		const magicStringInstance = new MagicString(source);

		// Localze strings
		for (const { stringKey, index, endIndex } of placeholderLocations) {
			const localizedString = JSON.stringify(localeData[stringKey] || stringKey).slice(1, -1);

			// For Webpack 5 cache hits
			if (this.options.warnOnUnusedString) {
				this.trackStringKeys.delete(stringKey);
			}

			magicStringInstance.overwrite(
				index,
				endIndex,
				localizedString,
			);
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
