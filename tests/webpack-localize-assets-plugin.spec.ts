import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import { isWebpack5 } from '../src/utils';
import WebpackLocalizeAssetsPlugin from '../src/index';
import { build, assertFsWithReadFileSync } from './utils';
import { createMemRequire } from './memfs-require';

const localesEmpty = {};
const localesSingle = {
	en: {
		hello: 'Hello',
	},
};
const localesMulti = {
	en: {
		hello: 'Hello',
	},
	es: {
		hello: 'Hola',
	},
	ja: {
		hello: 'こんにちは',
	},
};

describe(`Webpack ${webpack.version}`, () => {
	describe('error-cases', () => {
		test('no option', async () => {
			await expect(async () => {
				await build(
					{},
					(config) => {
						config.plugins!.push(
							// @ts-expect-error testing no option
							new WebpackLocalizeAssetsPlugin(),
						);
					},
				);
			}).rejects.toThrow(/Required/);
		});

		test('no option.locales', async () => {
			await expect(async () => {
				await build(
					{},
					(config) => {
						config.plugins!.push(
							// @ts-expect-error testing no option.locales
							new WebpackLocalizeAssetsPlugin({}),
						);
					},
				);
			}).rejects.toThrow(/Required/);
		});

		test('no locales', async () => {
			await expect(async () => {
				await build(
					{},
					(config) => {
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesEmpty,
							}),
						);
					},
				);
			}).rejects.toThrow(/locales must contain at least one locale/);
		});

		test('can use string [locale] in source', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default "[locale]";',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const mfs = buildStats.compilation.compiler.outputFileSystem;

			assertFsWithReadFileSync(mfs);

			const mRequire = createMemRequire(mfs);

			const enBuild = mRequire('/dist/index.en.js');
			expect(enBuild).toBe('[locale]');
		});

		test('can use string [locale] in name multiple times', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default "[locale]";',
				},
				(config) => {
					config.output!.filename = '[name].[locale].[locale].js';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;
			expect(assets).toHaveProperty(['index.en.en.js']);
		});

		test('missing locale - warning', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("bad key");',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			expect(buildStats.hasWarnings()).toBe(true);
			expect(buildStats.compilation.warnings.length).toBe(1);
			expect(buildStats.compilation.warnings[0].message).toMatch('Missing localization for key "bad key" in locales: en, es, ja');
		});

		test('missing locale - throwOnMissing', async () => {
			await expect(async () => {
				await build(
					{
						'/src/index.js': 'export default __("bad key");',
					},
					(config) => {
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesMulti,
								throwOnMissing: true,
							}),
						);
					},
				);
			}).rejects.toThrow(/Missing localization for key "bad key" in locale/);
		});

		test('missing [locale] from filename', async () => {
			await expect(async () => {
				await build(
					{
						'/src/index.js': '',
					},
					(config) => {
						config.output!.filename = '[name].js';
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesSingle,
							}),
						);
					},
				);
			}).rejects.toThrow('output.filename must include [locale]');
		});

		test('missing [locale] from chunkFilename', async () => {
			await expect(async () => {
				await build(
					{
						'/src/index.js': '',
					},
					(config) => {
						config.output!.chunkFilename = '[name].js';
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesSingle,
							}),
						);
					},
				);
			}).rejects.toThrow('output.chunkFilename must include [locale]');
		});

		test('warn on confusing function usage', async () => {
			const buildStats = await build(
				{
					'/src/index.js': `
						export default [
							__(1234),
							__('string', 'second param'),
						];
					`,
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			expect(buildStats.hasWarnings()).toBe(true);
			expect(buildStats.compilation.warnings.length).toBe(2);
			expect(buildStats.compilation.warnings[0].message).toMatch('Ignoring confusing usage of localization function "__" in /src/index.js:3:7');
			expect(buildStats.compilation.warnings[1].message).toMatch('Ignoring confusing usage of localization function "__" in /src/index.js:4:7');
		});

		test('sourceMapsForLocales - invalid locale', async () => {
			await expect(async () => {
				await build(
					{
						'/src/index.js': '',
					},
					(config) => {
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesSingle,
								sourceMapsForLocales: ['non-existent-locale'],
							}),
						);
					},
				);
			}).rejects.toThrow('sourceMapsForLocales must contain valid locales');
		});
	});

	describe('passing', () => {
		test('localize assets', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello");',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;
			expect(Object.keys(assets).length).toBe(3);

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createMemRequire(mfs);

			const enBuild = mRequire('/dist/index.en.js');
			expect(enBuild).toBe(localesMulti.en.hello);

			const esBuild = mRequire('/dist/index.es.js');
			expect(esBuild).toBe(localesMulti.es.hello);

			const jaBuild = mRequire('/dist/index.ja.js');
			expect(jaBuild).toBe(localesMulti.ja.hello);

			const statsOutput = buildStats.toString();
			expect(statsOutput).toMatch(/index\.en\.js/);
			expect(statsOutput).toMatch(/index\.es\.js/);
			expect(statsOutput).toMatch(/index\.ja\.js/);
		});

		test('localize assets with chunks', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default import("./async-import").then(module => module.default);',
					'/src/async-import.js': 'export default import("./async-import2").then(module => module.default);',
					'/src/async-import2.js': 'export default __("hello");',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;
			expect(Object.keys(assets).length).toBe(9);

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createMemRequire(mfs);

			const enBuild = await mRequire('/dist/index.en.js');
			expect(enBuild).toBe(localesMulti.en.hello);

			const esBuild = await mRequire('/dist/index.es.js');
			expect(esBuild).toBe(localesMulti.es.hello);

			const jaBuild = await mRequire('/dist/index.ja.js');
			expect(jaBuild).toBe(localesMulti.ja.hello);
		});

		test('works with minification', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello");',
				},
				(config) => {
					config.optimization!.minimize = true;
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			// Assert that asset is minified
			expect(mfs.readFileSync('/dist/index.en.js').toString()).not.toMatch(/\s{2,}/);
			expect(mfs.readFileSync('/dist/index.ja.js').toString()).not.toMatch(/\s{2,}/);
		});

		test('handle CSS', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'import "./style.css";',
					'/src/style.css': 'body { color: red; }',
				},
				(config) => {
					config.module!.rules.push({
						test: /\.css$/,
						use: [
							MiniCssExtractPlugin.loader,
							'css-loader',
						],
					});

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
						new MiniCssExtractPlugin({
							filename: '[name].[locale].css',
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;

			expect(assets).toHaveProperty(['index.en.css']);
			expect(assets).toHaveProperty(['index.ja.css']);
		});

		test('handle CSS without localization', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'import "./style.css";',
					'/src/style.css': 'body { color: red; }',
				},
				(config) => {
					config.module!.rules.push({
						test: /\.css$/,
						use: [
							MiniCssExtractPlugin.loader,
							'css-loader',
						],
					});

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
						new MiniCssExtractPlugin(),
					);
				},
			);

			const { assets } = buildStats.compilation;

			expect(assets).toHaveProperty(['index.css']);
		});

		test('no placeholders in single locale', async () => {
			const FakeMinifier = {
				name: 'FakeMinfier',

				apply(compiler) {
					compiler.hooks.compilation.tap(FakeMinifier.name, (compilation) => {
						const checkAssets = () => {
							const assets = Object.keys(compilation.assets);
							expect(assets.length).toBe(1);
							expect(assets[0]).toBe('index.en.js');

							const asset = compilation.getAsset('index.en.js');
							expect(asset.source.source()).toMatch(/"Hello"/);
						};

						if (isWebpack5(webpack)) {
							compilation.hooks.processAssets.tap(
								{
									name: FakeMinifier.name,
									stage: compilation.constructor.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
								},
								checkAssets,
							);
						} else {
							compilation.hooks.optimizeChunkAssets.tap(FakeMinifier.name, checkAssets);
						}
					});
				},
			};

			await build(
				{
					'/src/index.js': 'export default __("hello");',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
						FakeMinifier,
					);
				},
			);
		});

		test('emits source-maps', async () => {
			const locales = {
				en: {
					hello: 'Hello',
				},
				ja: {
					hello: 'こんにちは',
				},
			};
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello");',
				},
				(config) => {
					config.devtool = 'source-map';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales,
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;

			expect(assets).toHaveProperty(['index.en.js.map']);
			expect(assets).toHaveProperty(['index.ja.js.map']);
			expect(Object.keys(assets).length).toBe(4);
		});

		test('only emit source-maps for specified locales', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello");',
				},
				(config) => {
					config.devtool = 'source-map';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
							sourceMapsForLocales: ['en'],
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;
			expect(Object.keys(assets).length).toBe(4);
			expect(assets).toHaveProperty(['index.en.js.map']);
			expect(assets).not.toHaveProperty(['index.ja.js.map']);
		});

		test('warn on warnOnUnusedString', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default true',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
							warnOnUnusedString: true,
						}),
					);
				},
			);

			expect(buildStats.hasWarnings()).toBe(true);
			expect(buildStats.compilation.warnings.length).toBe(1);
			expect(buildStats.compilation.warnings[0].message).toMatch('Unused string key "hello"');
		});

		test('works with WebpackManifestPlugin', async () => {
			const hasLocale = /\.(en|es|ja)\.\w{2}(\.map)?$/;
			const localeNames = Object.keys(localesMulti);
			const buildStats = await build(
				{
					'/src/index.js': 'import "./style.css";',
					'/src/style.css': 'body { color: red; }',
				},
				(config) => {
					config.devtool = 'source-map';

					config.module!.rules.push({
						test: /\.css$/,
						use: [
							MiniCssExtractPlugin.loader,
							'css-loader',
						],
					});

					config.plugins!.push(
						new MiniCssExtractPlugin(),
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
							warnOnUnusedString: true,
						}),
						...localeNames.map(locale => new WebpackManifestPlugin({
							fileName: `manifest.${locale}.json`,
							filter: file => !file.isAsset && (!hasLocale.test(file.path) || file.path.match(`.${locale}.`)),
						})),
					);
				},
			);

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createMemRequire(mfs);
			const manifestEn = mRequire('/dist/manifest.en.json');

			expect(manifestEn).toMatchObject({
				'index.css': 'index.css',
				'index.js': 'index.en.js',
			});

			const manifestEs = mRequire('/dist/manifest.es.json');
			expect(manifestEs).toMatchObject({
				'index.css': 'index.css',
				'index.js': 'index.es.js',
			});

			const manifestJa = mRequire('/dist/manifest.ja.json');
			expect(manifestJa).toMatchObject({
				'index.css': 'index.css',
				'index.js': 'index.ja.js',
			});
		});
	});
});
