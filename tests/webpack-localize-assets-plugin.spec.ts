import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { isWebpack5 } from '../src/utils';
import WebpackLocalizeAssetsPlugin from '../src/index';
import { build, assertFsWithReadFileSync } from './utils';
import { createMemRequire } from './memfs-require';

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
								locales: {},
							}),
						);
					},
				);
			}).rejects.toThrow(/locales must contain at least one locale/);
		});

		test('can use string [locale] in source', async () => {
			const locales = {
				en: {},
			};
			const buildStats = await build(
				{
					'/src/index.js': 'export default "[locale]";',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales,
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
			const locales = {
				en: {},
			};
			const buildStats = await build(
				{
					'/src/index.js': 'export default "[locale]";',
				},
				(config) => {
					config.output!.filename = '[name].[locale].[locale].js';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales,
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;
			expect(assets).toHaveProperty(['index.en.en.js']);
		});

		test('missing locale - warning', async () => {
			const locales = {
				en: {},
				es: {},
				ja: {},
			};

			const buildStats = await build(
				{
					'/src/index.js': 'export default __("bad key");',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales,
						}),
					);
				},
			);

			expect(buildStats.hasWarnings()).toBe(true);
			expect(buildStats.compilation.warnings.length).toBe(1);
			expect(buildStats.compilation.warnings[0].message).toMatch('Missing localization for key "bad key" in locales: en, es, ja');
		});

		test('missing locale - throwOnMissing', async () => {
			const locales = {
				en: {},
				es: {},
				ja: {},
			};

			await expect(async () => {
				await build(
					{
						'/src/index.js': 'export default __("bad key");',
					},
					(config) => {
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales,
								throwOnMissing: true,
							}),
						);
					},
				);
			}).rejects.toThrow(/Missing localization for key "bad key" in locale/);
		});

		test('missing [locale] from filename', async () => {
			const locales = {
				en: {},
			};

			await expect(async () => {
				await build(
					{
						'/src/index.js': '',
					},
					(config) => {
						config.output!.filename = '[name].js';
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales,
							}),
						);
					},
				);
			}).rejects.toThrow('output.filename must include [locale]');
		});

		test('missing [locale] from chunkFilename', async () => {
			const locales = {
				en: {},
			};

			await expect(async () => {
				await build(
					{
						'/src/index.js': '',
					},
					(config) => {
						config.output!.chunkFilename = '[name].js';
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales,
							}),
						);
					},
				);
			}).rejects.toThrow('output.chunkFilename must include [locale]');
		});

		test('warn on confusing function usage', async () => {
			const locales = {
				en: {},
			};

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
							locales,
						}),
					);
				},
			);

			expect(buildStats.hasWarnings()).toBe(true);
			expect(buildStats.compilation.warnings.length).toBe(2);
			expect(buildStats.compilation.warnings[0].message).toMatch('Ignoring confusing usage of localization function "__" in /src/index.js:3:7');
			expect(buildStats.compilation.warnings[1].message).toMatch('Ignoring confusing usage of localization function "__" in /src/index.js:4:7');
		});
	});

	describe('passing', () => {
		test('localize assets', async () => {
			const locales = {
				en: {
					helloWorld: 'Hello world!',
				},
				ja: {
					helloWorld: 'こんにちは！',
				},
			};
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("helloWorld");',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales,
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;
			expect(Object.keys(assets).length).toBe(2);

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createMemRequire(mfs);

			const enBuild = mRequire('/dist/index.en.js');
			expect(enBuild).toBe(locales.en.helloWorld);

			const jaBuild = mRequire('/dist/index.ja.js');
			expect(jaBuild).toBe(locales.ja.helloWorld);

			const statsOutput = buildStats.toString();
			expect(statsOutput).toMatch(/index\.en\.js/);
			expect(statsOutput).toMatch(/index\.ja\.js/);
		});

		test('localize assets with chunks', async () => {
			const locales = {
				en: {
					helloWorld: 'Hello world!',
				},
				ja: {
					helloWorld: 'こんにちは！',
				},
			};
			const buildStats = await build(
				{
					'/src/index.js': 'export default import("./async-import").then(module => module.default);',
					'/src/async-import.js': 'export default import("./async-import2").then(module => module.default);',
					'/src/async-import2.js': 'export default __("helloWorld");',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales,
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;
			expect(Object.keys(assets).length).toBe(6);

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createMemRequire(mfs);

			const enBuild = await mRequire('/dist/index.en.js');
			expect(enBuild).toBe(locales.en.helloWorld);

			const jaBuild = await mRequire('/dist/index.ja.js');
			expect(jaBuild).toBe(locales.ja.helloWorld);
		});

		test('works with minification', async () => {
			const locales = {
				en: {
					helloWorld: 'Hello world!',
				},
				ja: {
					helloWorld: 'こんにちは！',
				},
			};
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("helloWorld");',
				},
				(config) => {
					config.optimization!.minimize = true;
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales,
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
			const locales = {
				en: {},
				ja: {},
			};
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
							locales,
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
			const locales = {
				en: {},
				ja: {},
			};
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
							locales,
						}),
						new MiniCssExtractPlugin(),
					);
				},
			);

			const { assets } = buildStats.compilation;

			expect(assets).toHaveProperty(['index.css']);
		});

		/**
		 * Important to localize after minification so that minification
		 * doesn't get applied to new assets.
		 *
		 * (Although it might still with `additionalAssets: true` in processAssets)
		 */
		test('localize after minification', async () => {
			/**
			 * Mocked hooks after terser-webpack-plugin v4.2.3
			 * https://github.com/webpack-contrib/terser-webpack-plugin/blob/v4.2.3/src/index.js#L664
			 */
			const FakeMinifier = {
				name: 'FakeMinfier',

				apply(compiler) {
					compiler.hooks.compilation.tap(FakeMinifier.name, (compilation) => {
						const checkAssets = () => {
							const assets = Object.keys(compilation.assets);
							expect(assets.length).toBe(1);
						};

						if (isWebpack5(webpack)) {
							compilation.hooks.processAssets.tap(
								{
									name: FakeMinifier.name,
									stage: compilation.constructor.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
									/**
									 * Added in v5.1.0 to minifiy assets added in later stages.
									 * It should not apply to the localized assets.
									 * https://github.com/webpack-contrib/terser-webpack-plugin/blob/v5.1.0/src/index.js#L637
									 */
									additionalAssets: true,
								},
								checkAssets,
							);
						} else {
							compilation.hooks.optimizeChunkAssets.tap(FakeMinifier.name, checkAssets);
						}
					});
				},
			};

			const locales = {
				en: {
					helloWorld: 'Hello world!',
				},
			};

			await build(
				{
					'/src/index.js': 'export default __("helloWorld");',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales,
						}),
						FakeMinifier,
					);
				},
			);
		});
	});
});
