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

	validatedLocales = new Map<string, boolean>();

	constructor(options: Options) {
		OptionsSchema.parse(options);
		this.options = options;

		this.localeNames = Object.keys(this.options.locales);
		if (this.localeNames.length === 1) {
			[this.singleLocale] = this.localeNames;
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

		// Create localized assets by swapping out placeholders with localized strings
		if (!this.singleLocale) {
			compiler.hooks.make.tap(
				LocalizeAssetsPlugin.name,
				(compilation) => {
					this.generateLocalizedAssets(compilation);
				},
			);
		}
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
			return this.validatedLocales.get(stringKey);
		}

		const {
			locales,
			throwOnMissing,
		} = this.options;

		const missingFromLocales = this.localeNames.filter(
			locale => !hasOwnProp(locales[locale], stringKey),
		);
		const isMissingFromLocales = missingFromLocales.length > 0;

		this.validatedLocales.set(stringKey, !isMissingFromLocales);

		if (isMissingFromLocales) {
			const error = new WebpackError(`Missing localization for key "${stringKey}" in locales: ${missingFromLocales.join(', ')}`);
			if (throwOnMissing) {
				throw error;
			} else {
				compilation.warnings.push(error);
			}
		}

		return !isMissingFromLocales;
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
					const isValid = this.validateLocale(compilation, stringKey);

					if (singleLocale) {
						if (isValid) {
							toConstantDependency(
								parser,
								JSON.stringify(this.options.locales[singleLocale][stringKey]),
							)(callExpressionNode);
						}
					} else {
						const placeholder = JSON.stringify(LocalizeAssetsPlugin.name + sha256(stringKey));
						toConstantDependency(parser, placeholder)(callExpressionNode);
						localePlaceholders.set(placeholder, stringKey);
					}

					return true;
				}

				const location = callExpressionNode.loc.start;
				const error = new WebpackError(
					`Ignoring confusing usage of localization function "${functionName}" in ${parser.state.module.resource}:${location.line}:${location.column}`,
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

		const generateLocalizedAssets = () => {
			// @ts-expect-error Outdated @type
			const assetsWithInfo = compilation.getAssets()
				.filter(asset => asset.name.includes(nameTemplatePlaceholder));

			for (const asset of assetsWithInfo) {
				const { source, map } = asset.source.sourceAndMap() as SourceAndMapResult;
				const localizedAssetNames: string[] = [];

				if (isJsFile.test(asset.name)) {
					const sourceString = source.toString();
					const localizationReplacements = this.locatePlaceholders(sourceString);
					const localePlaceholderLocations = findSubstringLocations(
						sourceString,
						nameTemplatePlaceholder,
					);

					for (const locale of localeNames) {
						const newAssetName = asset.name.replace(nameTemplatePlaceholderPattern, locale);
						localizedAssetNames.push(newAssetName);

						const localizedSource = this.localizeAsset(
							locale,
							newAssetName,
							localizationReplacements,
							localePlaceholderLocations,
							sourceString,
							map,
						);

						// @ts-expect-error Outdated @type
						compilation.emitAsset(
							newAssetName,
							localizedSource,
							asset.info,
						);
					}
				} else {
					let localesToIterate = localeNames;
					if (isSourceMap.test(asset.name) && sourceMapsForLocales) {
						localesToIterate = sourceMapsForLocales;
					}

					for (const locale of localesToIterate) {
						const newAssetName = asset.name.replace(nameTemplatePlaceholderPattern, locale);
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

		// Apply after minification since we don't want to
		// duplicate the costs of that for each asset
		if (isWebpack5Compilation(compilation)) {
			compilation.hooks.afterProcessAssets.tap(
				LocalizeAssetsPlugin.name,
				generateLocalizedAssets,
			);
		} else {
			compilation.hooks.afterOptimizeChunkAssets.tap(
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
