import assert from 'assert';
import { RawSource, SourceMapSource } from 'webpack-sources';
import MagicString from 'magic-string';
import hasOwnProp from 'has-own-prop';
import WebpackError from 'webpack/lib/WebpackError.js';
import {
	sha256,
	findSubstringLocations,
	toConstantDependency,
	isWebpack5Compilation,
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
const SHA256_LENGTH = nameTemplatePlaceholder.length;
const QUOTES_LENGTH = 2;

class LocalizeAssetsPlugin implements Plugin {
	options: Options;

	localePlaceholders = new Map<string, string>();

	validatedLocales = new Set<string>();

	constructor(options: Options) {
		OptionsSchema.parse(options);
		this.options = options;
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
		compiler.hooks.make.tap(
			LocalizeAssetsPlugin.name,
			(compilation) => {
				this.generateLocalizedAssets(compilation);
			},
		);
	}

	interpolateLocaleToFileName(compilation: Compilation) {
		const interpolate = (path) => {
			if (typeof path === 'string') {
				path = path.replace(/\[locale]/g, nameTemplatePlaceholder);
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

		const missingFromLocales = Object.keys(locales).filter(
			locale => !hasOwnProp(locales[locale], stringKey),
		);

		if (missingFromLocales.length > 0) {
			const error = new WebpackError(`Missing localization for key "${stringKey}" in locales: ${missingFromLocales.join(', ')}`);
			if (throwOnMissing) {
				throw error;
			} else {
				compilation.warnings.push(error);
			}
		}

		this.validatedLocales.add(stringKey);
	}

	insertLocalePlaceholders(
		compilation: Compilation,
		normalModuleFactory: NormalModuleFactory,
	) {
		const { localePlaceholders } = this;
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

					const placeholder = JSON.stringify(LocalizeAssetsPlugin.name + sha256(stringKey));
					localePlaceholders.set(placeholder, stringKey);
					toConstantDependency(parser, placeholder)(callExpressionNode);
					return true;
				}
				const location = callExpressionNode.loc.start;
				const error = new WebpackError(
					`Ignoring confusing usage of localization function "${functionName}" in ${parser.state.module.resource}:${location.line}:${location.column}`,
				);
				compilation.warnings.push(error);
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
		const { locales } = this.options;
		const { devtool } = compilation.compiler.options;

		const generateLocalizedAssets = () => {
			const assetsWithInfo = Object.keys(compilation.assets)
				.filter(assetName => assetName.includes(nameTemplatePlaceholder))
				.map(assetName => compilation.getAsset(assetName));

			for (const asset of assetsWithInfo) {
				const { source, map } = asset.source.sourceAndMap();
				const sourceString = source.toString();
				const sourceMapString = devtool ? JSON.stringify(map) : undefined;
				const localizationReplacements = this.locatePlaceholders(sourceString);
				const localePlaceholderLocations = findSubstringLocations(
					sourceString,
					nameTemplatePlaceholder,
				);
				const localizedAssetNames: string[] = [];

				for (const locale in locales) {
					if (!hasOwnProp(locales, locale)) {
						continue;
					}
					const newAssetName = asset.name.replace(new RegExp(nameTemplatePlaceholder, 'g'), locale);
					localizedAssetNames.push(newAssetName);

					const localizedSource = this.localizeAsset(
						locale,
						newAssetName,
						localizationReplacements,
						localePlaceholderLocations,
						sourceString,
						sourceMapString,
					);

					// @ts-expect-error Outdated @type
					compilation.emitAsset(
						newAssetName,
						localizedSource,
						asset.info,
					);
				}

				// Delete original unlocalized asset
				if (isWebpack5Compilation(compilation)) {
					compilation.deleteAsset(asset.name);
				} else {
					delete compilation.assets[asset.name];

					/**
					 * To support terser-webpack-plugin v1.4.5 (bundled with Webpack 4)
					 * which iterates over chunks instead of assets
					 * https://github.com/webpack-contrib/terser-webpack-plugin/blob/v1.4.5/src/index.js#L176
					 */
					for (const chunk of compilation.chunks) {
						const hasAsset = chunk.files.indexOf(asset.name);
						if (hasAsset > -1) {
							chunk.files.splice(hasAsset, 1, ...localizedAssetNames);
						}
					}
				}
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
		map?: string,
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
