import assert from 'assert';
import { RawSource, SourceMapSource, SourceAndMapResult } from 'webpack-sources';
import { RawSourceMap } from 'source-map';
import MagicString from 'magic-string';
import hasOwnProp from 'has-own-prop';
import WebpackError from 'webpack/lib/WebpackError.js';
import {
	sha256,
	findSubstringLocations,
	toConstantDependency,
	isWebpack5Compilation,
	deleteAsset,
} from './utils';
import {
	Options,
	OptionsSchema,
	Plugin,
	Compiler,
	Compilation,
	NormalModuleFactory,
	WP5,
} from './types';

const nameTemplatePlaceholder = sha256('[locale:placeholder]');
const nameTemplatePlaceholderPattern = new RegExp(nameTemplatePlaceholder, 'g');
const SHA256_LENGTH = nameTemplatePlaceholder.length;
const QUOTES_LENGTH = 2;
const isJsFile = /\.js$/;
const isSourceMap = /\.js\.map$/;

class LocalizeAssetsPlugin implements Plugin {
	options: Options;

	localeNames: string[];

	singleLocale?: string;

	localePlaceholders = new Map<string, string>();

	validatedLocales = new Set<string>();

	trackStringKeys = new Set<string>();

	constructor(options: Options) {
		OptionsSchema.parse(options);
		this.options = options;

		this.localeNames = Object.keys(options.locales);
		if (this.localeNames.length === 1) {
			[this.singleLocale] = this.localeNames;
		}

		if (options.warnOnUnusedString) {
			for (const locale of this.localeNames) {
				for (const stringKey of Object.keys(options.locales[locale])) {
					this.trackStringKeys.add(stringKey);
				}
			}
		}
	}

	apply(compiler: Compiler) {
		// Validate output file name
		compiler.hooks.thisCompilation.tap(
			LocalizeAssetsPlugin.name,
			(compilation: Compilation) => {
				const { filename, chunkFilename } = compilation.outputOptions;
				assert(filename.includes('[locale]'), 'output.filename must include [locale]');
				assert(chunkFilename.includes('[locale]'), 'output.chunkFilename must include [locale]');
			},
		);

		// Insert locale placeholders into assets and asset names
		compiler.hooks.compilation.tap(
			LocalizeAssetsPlugin.name,
			(compilation: Compilation, { normalModuleFactory }) => {
				this.interpolateLocaleToFileName(compilation);
				this.insertLocalePlaceholders(compilation, normalModuleFactory);
			},
		);

		compiler.hooks.make.tap(
			LocalizeAssetsPlugin.name,
			(compilation) => {
				if (!this.singleLocale) {
					// Create localized assets by swapping out placeholders with localized strings
					this.generateLocalizedAssets(compilation);
				}

				if (this.options.warnOnUnusedString && this.trackStringKeys.size > 0) {
					for (const unusedStringKey of this.trackStringKeys) {
						const error = new WebpackError(`[${LocalizeAssetsPlugin.name}] Unused string key "${unusedStringKey}"`);
						compilation.warnings.push(error);
					}
				}
			},
		);
	}

	interpolateLocaleToFileName(compilation: Compilation) {
		const replaceWith = this.singleLocale ?? nameTemplatePlaceholder;
		const interpolate = (path) => {
			if (typeof path === 'string') {
				path = path.replace(/\[locale]/g, replaceWith);
			}
			return path;
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

	validateLocale(
		compilation: Compilation,
		stringKey: string,
	) {
		if (this.validatedLocales.has(stringKey)) {
			return;
		}

		const {
			locales,
			throwOnMissing,
		} = this.options;

		const missingFromLocales = this.localeNames.filter(
			locale => !hasOwnProp(locales[locale], stringKey),
		);
		const isMissingFromLocales = missingFromLocales.length > 0;

		this.validatedLocales.add(stringKey);

		if (isMissingFromLocales) {
			const error = new WebpackError(`[${LocalizeAssetsPlugin.name}] Missing localization for key "${stringKey}" in locales: ${missingFromLocales.join(', ')}`);
			if (throwOnMissing) {
				throw error;
			} else {
				compilation.warnings.push(error);
			}
		}
	}

	insertLocalePlaceholders(
		compilation: Compilation,
		normalModuleFactory: NormalModuleFactory,
	) {
		const {
			singleLocale,
			localePlaceholders,
		} = this;
		const {
			functionName = '__',
		} = this.options;

		const handler = (parser) => {
			parser.hooks.call.for(functionName).tap(LocalizeAssetsPlugin.name, (callExpressionNode) => {
				const firstArgumentNode = callExpressionNode.arguments[0];

				if (
					callExpressionNode.arguments.length === 1
					&& firstArgumentNode.type === 'Literal'
					&& typeof firstArgumentNode.value === 'string'
				) {
					const stringKey = firstArgumentNode.value;
					this.validateLocale(compilation, stringKey);

					if (this.options.warnOnUnusedString) {
						this.trackStringKeys.delete(stringKey);
					}

					if (singleLocale) {
						toConstantDependency(
							parser,
							JSON.stringify(this.options.locales[singleLocale][stringKey] || stringKey),
						)(callExpressionNode);
					} else {
						const placeholder = JSON.stringify(LocalizeAssetsPlugin.name + sha256(stringKey));
						toConstantDependency(parser, placeholder)(callExpressionNode);
						localePlaceholders.set(placeholder, stringKey);
					}

					return true;
				}

				const location = callExpressionNode.loc.start;
				const error = new WebpackError(
					`[${LocalizeAssetsPlugin.name}] Ignoring confusing usage of localization function "${functionName}" in ${parser.state.module.resource}:${location.line}:${location.column}`,
				);

				parser.state.module.warnings.push(error);
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

	locatePlaceholders(sourceString: string) {
		const { localePlaceholders } = this;

		const localizationReplacements: {
			stringKey: string;
			index: number;
		}[] = [];

		const possibleLocations = findSubstringLocations(sourceString, `"${LocalizeAssetsPlugin.name}`);
		for (const placeholderIndex of possibleLocations) {
			const placeholder = sourceString.slice(
				placeholderIndex,
				placeholderIndex + LocalizeAssetsPlugin.name.length + SHA256_LENGTH + QUOTES_LENGTH,
			);

			const stringKey = localePlaceholders.get(placeholder);
			if (stringKey) {
				localizationReplacements.push({
					stringKey,
					index: placeholderIndex,
				});
			}
		}

		return localizationReplacements;
	}

	generateLocalizedAssets(compilation: Compilation) {
		const { localeNames } = this;
		const { sourceMapsForLocales } = this.options;

		const generateLocalizedAssets = async () => {
			// @ts-expect-error Outdated @type
			const assetsWithInfo = compilation.getAssets()
				.filter(asset => asset.name.includes(nameTemplatePlaceholder));

			await Promise.all(assetsWithInfo.map(async (asset) => {
				const { source, map } = asset.source.sourceAndMap() as SourceAndMapResult;
				const localizedAssetNames: string[] = [];

				if (isJsFile.test(asset.name)) {
					const sourceString = source.toString();
					const localizationReplacements = this.locatePlaceholders(sourceString);
					const localePlaceholderLocations = findSubstringLocations(
						sourceString,
						nameTemplatePlaceholder,
					);

					await Promise.all(localeNames.map(async (locale) => {
						const newAssetName = asset.name.replace(nameTemplatePlaceholderPattern, locale);
						localizedAssetNames.push(newAssetName);

						const localizedSource = this.localizeAsset(
							locale,
							newAssetName,
							localizationReplacements,
							localePlaceholderLocations,
							sourceString,
							(
								(!sourceMapsForLocales || sourceMapsForLocales.includes(locale))
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
					if (isSourceMap.test(asset.name) && sourceMapsForLocales) {
						localesToIterate = sourceMapsForLocales;
					}

					await Promise.all(localesToIterate.map(async (locale) => {
						const newAssetName = asset.name.replace(nameTemplatePlaceholderPattern, locale);
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

	localizeAsset(
		locale: string,
		assetName: string,
		localizationReplacements: {
			stringKey: string;
			index: number;
		}[],
		localePlaceholderLocations: number[],
		source: string,
		map: RawSourceMap | null,
	) {
		const localeData = this.options.locales[locale];
		const magicStringInstance = new MagicString(source);

		// Localze strings
		for (const { stringKey, index } of localizationReplacements) {
			const localizedString = JSON.stringify(localeData[stringKey] || stringKey);

			magicStringInstance.overwrite(
				index,
				index + LocalizeAssetsPlugin.name.length + SHA256_LENGTH + QUOTES_LENGTH,
				localizedString,
			);
		}

		// Localize chunk requests
		for (const location of localePlaceholderLocations) {
			magicStringInstance.overwrite(
				location,
				location + nameTemplatePlaceholder.length,
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
