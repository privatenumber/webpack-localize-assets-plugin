import fs from 'fs/promises';
import { testSuite, expect } from 'manten';
import { build, watch } from 'webpack-test-utils';
import TerserPlugin from 'terser-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import webpack from 'webpack';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import tempy from 'tempy';
import type { Compilation } from 'webpack5';
import { configureWebpack } from '../utils/configure-webpack';
import { localesSingle, localesMulti, specialKey } from '../utils/localization-data';
import WebpackLocalizeAssetsPlugin from '#webpack-localize-assets-plugin'; // eslint-disable-line import/no-unresolved

export default testSuite(({ describe }, isWebpack5?: boolean) => {
	describe('passing', ({ test }) => {
		test('single locale', async () => {
			const built = await build(
				{
					'/src/index.js': `export default [${
						Object.keys(localesSingle.en)
							.map((key) => '__(' + JSON.stringify(key) + ')')
							.join(',')
					}]`,
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(Object.keys(assets).length).toBe(1);

			const enBuild = built.require('/dist/index.js');
			expect(enBuild).toEqual(Object.values(localesMulti.en));

			const statsOutput = built.stats.toString();
			expect(statsOutput).toMatch(/index\.js/);
		});

		test('multi locale', async () => {
			const built = await build(
				{
					'/src/index.js': `export default [${
						Object.keys(localesMulti.en)
							.map((key) => '__(' + JSON.stringify(key) + ')')
							.join(',')
					}]`,
				},
				(config) => {
					configureWebpack(config);

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(Object.keys(assets).length).toBe(3);

			const enBuild = built.require('/dist/index.en.js');
			expect(enBuild).toEqual(Object.values(localesMulti.en));

			const esBuild = built.require('/dist/index.es.js');
			expect(esBuild).toEqual(Object.values(localesMulti.es));

			const jaBuild = built.require('/dist/index.ja.js');
			expect(jaBuild).toEqual(Object.values(localesMulti.ja));

			const statsOutput = built.stats.toString();
			expect(statsOutput).toMatch(/index\.en\.js/);
			expect(statsOutput).toMatch(/index\.es\.js/);
			expect(statsOutput).toMatch(/index\.ja\.js/);
		});

		test('localize assets with chunks', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default import("./async-import").then(module => module.default);',
					'/src/async-import.js': 'export default import("./async-import2").then(module => module.default);',
					'/src/async-import2.js': 'export default __("hello-key");',
				},
				(config) => {
					configureWebpack(config);

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(Object.keys(assets).length).toBe(9);

			const enBuild = await built.require('/dist/index.en.js');
			expect(enBuild).toBe(localesMulti.en['hello-key']);

			const esBuild = await built.require('/dist/index.es.js');
			expect(esBuild).toBe(localesMulti.es['hello-key']);

			const jaBuild = await built.require('/dist/index.ja.js');
			expect(jaBuild).toBe(localesMulti.ja['hello-key']);
		});

		test('works with minification and different contexts for __() usages', async () => {
			const built = await build(
				{
					'/src/index.js': `
						export default {
							test1: __("hello-key") + " world and " + __("stringWithDoubleQuotes"),
						    test2: __("hello-key").length,
						    test3: [__("hello-key"), __("stringWithDoubleQuotes")],
						    test4: __("hello-key") || "hello",
						    test5: __("hello-key") ? "hello" : "goodbye",
						};
					`,
				},
				(config) => {
					configureWebpack(config);

					config.optimization!.minimize = true;

					if (isWebpack5) {
						config.optimization!.minimizer = [
							new TerserPlugin({
								parallel: false,
							}),
						];
					}

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			expect(built.stats.hasWarnings()).toBe(false);
			expect(built.stats.hasErrors()).toBe(false);

			const enBuild = await built.require('/dist/index.en.js');
			expect(enBuild.test1).toBe(`${localesMulti.en['hello-key']} world and ${localesMulti.en.stringWithDoubleQuotes}`);
			expect(enBuild.test2).toBe(localesMulti.en['hello-key'].length);
			expect(enBuild.test3).toEqual([localesMulti.en['hello-key'], localesMulti.en.stringWithDoubleQuotes]);
			expect(enBuild.test4).toBe(localesMulti.en['hello-key']);
			expect(enBuild.test5).toBe('hello');

			// Assert that asset is minified
			expect(built.fs.readFileSync('/dist/index.en.js').toString()).not.toMatch(/\s{2,}/);
			expect(built.fs.readFileSync('/dist/index.ja.js').toString()).not.toMatch(/\s{2,}/);
		});

		test('handle CSS', async () => {
			const built = await build(
				{
					'/src/index.js': 'import "./style.css";',
					'/src/style.css': 'body { color: red; }',
				},
				(config) => {
					configureWebpack(config);

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
						}) as any,
					);
				},
			);

			const { assets } = built.stats.compilation;

			expect(assets).toHaveProperty(['index.en.css']);
			expect(assets).toHaveProperty(['index.ja.css']);
		});

		test('handle CSS without localization', async () => {
			const built = await build(
				{
					'/src/index.js': 'import "./style.css";',
					'/src/style.css': 'body { color: red; }',
				},
				(config) => {
					configureWebpack(config);

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
						new MiniCssExtractPlugin() as any,
					);
				},
			);

			const { assets } = built.stats.compilation;

			expect(assets).toHaveProperty(['index.css']);
		});

		test('no placeholders in single locale', async () => {
			const FakeMinifier = {
				name: 'FakeMinfier',

				apply(compiler: any) {
					compiler.hooks.compilation.tap(FakeMinifier.name, (compilation: Compilation) => {
						const checkAssets = () => {
							const assets = Object.keys(compilation.assets);
							expect(assets.length).toBe(1);
							expect(assets[0]).toBe('index.en.js');

							const asset = compilation.getAsset('index.en.js');
							expect(asset.source.source()).toMatch(/"Hello"/);
						};

						if (isWebpack5) {
							compilation.hooks.processAssets.tap(
								{
									name: FakeMinifier.name,
									stage: (compilation.constructor as typeof Compilation)
										.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
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
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					configureWebpack(config);

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
						FakeMinifier,
					);
				},
			);
		});

		test('unused locale with minification', async () => {
			const built = await build(
				{
					'/src/index.js': '__("hello-key")',
				},
				(config) => {
					configureWebpack(config);

					config.optimization!.minimize = true;

					if (isWebpack5) {
						config.optimization!.minimizer = [
							new TerserPlugin({
								parallel: false,
							}),
						];
					}

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;

			expect(Object.keys(assets)).toStrictEqual(['index.en.js', 'index.es.js', 'index.ja.js']);
		});

		test('devtool eval', async () => {
			const built = await build(
				{
					'/src/index.js': `export default [${
						[
							'__("hello-key")',
							'__("stringWithDoubleQuotes")',
							'__("stringWithSingleQuotes")',
							"__('stringWithDoubleQuotes')",
							"__('stringWithSingleQuotes')",
						].join(',')
					}];`,
				},
				(config) => {
					configureWebpack(config);

					config.devtool = 'eval';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;

			expect(Object.keys(assets)).toStrictEqual(['index.en.js', 'index.es.js', 'index.ja.js']);

			const enBuild = built.require('/dist/index.en.js');
			expect(enBuild).toEqual([
				localesMulti.en['hello-key'],
				localesMulti.en.stringWithDoubleQuotes,
				localesMulti.en.stringWithSingleQuotes,
				localesMulti.en.stringWithDoubleQuotes,
				localesMulti.en.stringWithSingleQuotes,
			]);
		});

		test('emits source-maps', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					configureWebpack(config);

					config.devtool = 'source-map';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;

			expect(assets).toHaveProperty(['index.en.js.map']);
			expect(assets).toHaveProperty(['index.es.js.map']);
			expect(assets).toHaveProperty(['index.ja.js.map']);
			expect(Object.keys(assets).length).toBe(6);
		});

		test('only emit source-maps for specified locales', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					configureWebpack(config);

					config.devtool = 'source-map';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
							sourceMapForLocales: ['en'],
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(Object.keys(assets).length).toBe(4);
			expect(assets).toHaveProperty(['index.en.js.map']);
			expect(assets).not.toHaveProperty(['index.ja.js.map']);
		});

		test('warn on warnOnUnusedString', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default true',
				},
				(config) => {
					configureWebpack(config);

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
							warnOnUnusedString: true,
						}),
					);
				},
			);

			expect(built.stats.hasWarnings()).toBe(true);

			const keys = Object.keys(localesMulti.en);
			expect(built.stats.compilation.warnings.length).toBe(keys.length);

			for (let i = 1; i < keys.length; i += 1) {
				expect(built.stats.compilation.warnings[i].message).toMatch(`Unused string key "${keys[i]}"`);
			}
		});

		test('works with WebpackManifestPlugin', async () => {
			const hasLocale = /\.(?:en|es|ja)\.\w{2}(?:\.map)?$/;
			const localeNames = Object.keys(localesMulti);
			const built = await build(
				{
					'/src/index.js': 'import "./style.css";',
					'/src/style.css': 'body { color: red; }',
				},
				(config) => {
					configureWebpack(config);

					config.devtool = 'source-map';

					config.module!.rules.push({
						test: /\.css$/,
						use: [
							MiniCssExtractPlugin.loader,
							'css-loader',
						],
					});

					config.plugins!.push(
						new MiniCssExtractPlugin() as any,
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
						...localeNames.map(locale => new WebpackManifestPlugin({
							fileName: `manifest.${locale}.json`,
							// eslint-disable-next-line unicorn/prefer-regexp-test
							filter: file => !file.isAsset && (!hasLocale.test(file.path) || !!file.path.match(`.${locale}.`)),
						})),
					);
				},
			);

			const manifestEn = built.require('/dist/manifest.en.json');
			expect(manifestEn).toMatchObject({
				'index.css': 'index.css',
				'index.js': 'index.en.js',
			});

			const manifestEs = built.require('/dist/manifest.es.json');
			expect(manifestEs).toMatchObject({
				'index.css': 'index.css',
				'index.js': 'index.es.js',
			});

			const manifestJa = built.require('/dist/manifest.ja.json');
			expect(manifestJa).toMatchObject({
				'index.css': 'index.css',
				'index.js': 'index.ja.js',
			});
		});

		test('works with Webpack 5 cache', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};
			const cacheDirectory = tempy.directory();

			const configure = (config: webpack.Configuration) => {
				configureWebpack(config);

				config.cache = {
					type: 'filesystem',
					cacheDirectory,
				};

				config.plugins!.push(
					new WebpackLocalizeAssetsPlugin({
						locales: localesMulti,
					}),
				);
			};

			const builtA = await build(
				volume,
				configure,
			);

			const indexEnA = builtA.require('/dist/index.en.js');
			expect(indexEnA).toBe('Hello');

			const builtB = await build(
				volume,
				configure,
			);

			const indexEnB = builtB.require('/dist/index.en.js');
			expect(indexEnB).toBe(indexEnA);

			await fs.rm(cacheDirectory, { recursive: true, force: true });
		});

		test('warnOnUnusedString works with Webpack 5 cache', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const configure = (config: webpack.Configuration) => {
				configureWebpack(config);

				config.cache = {
					type: 'filesystem',
				};

				config.plugins!.push(
					new WebpackLocalizeAssetsPlugin({
						locales: localesMulti,
						warnOnUnusedString: true,
					}),
				);
			};

			const builtA = await build(
				volume,
				configure,
			);

			const keys = Object.keys(localesMulti.en).filter(key => key !== 'hello-key');

			const { warnings: warningsA } = builtA.stats.compilation;
			expect(warningsA.length).toBe(keys.length);

			for (let i = 0; i < keys.length; i += 1) {
				expect(warningsA[i].message).toMatch(`Unused string key "${keys[i]}"`);
			}

			const builtB = await build(
				volume,
				configure,
			);

			const { warnings: warningsB } = builtB.stats.compilation;
			expect(warningsA.length).toBe(keys.length);
			for (let i = 0; i < keys.length; i += 1) {
				expect(warningsB[i].message).toMatch(`Unused string key "${keys[i]}"`);
			}
		});

		test('dynamically load relative locale json path', async () => {
			const originalCwd = process.cwd();

			process.chdir('/');

			const watching = watch(
				{
					'/src/index.js': 'export default __("hello-key") + " " + __("world-key");',
					'/src/locales/en.json': JSON.stringify(localesSingle.en),
				},
				(config) => {
					configureWebpack(config);

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: {
								en: './src/locales/en.json',
							},
						}),
					);
				},
			);

			let stats = await watching.build(true);

			let { warnings } = stats.compilation;
			expect(warnings.length).toBe(1);
			expect(warnings[0].message).toMatch('Missing localization for key "world-key" used in /src/index.js:1:39 from locales: en');

			let enBuild = watching.require('/dist/index.en.js');
			expect(enBuild).toBe('Hello world-key');

			watching.fs.writeFileSync('/src/locales/en.json', JSON.stringify({
				...localesSingle.en,
				'world-key': 'World',
			}));

			stats = await watching.build(true);

			expect(stats.hasWarnings()).toBe(false);

			delete watching.require.cache[watching.require.resolve('/dist/index.en.js')];
			enBuild = watching.require('/dist/index.en.js');
			expect(enBuild).toBe('Hello World');

			watching.fs.writeFileSync('/src/locales/en.json', JSON.stringify({
				'world-key': 'World',
			}));

			stats = await watching.build(true);
			warnings = stats.compilation.warnings;

			expect(warnings.length).toBe(1);
			expect(warnings[0].message).toMatch('Missing localization for key "hello-key" used in /src/index.js:1:15 from locales: en');

			delete watching.require.cache[watching.require.resolve('/dist/index.en.js')];
			enBuild = watching.require('/dist/index.en.js');
			expect(enBuild).toBe('hello-key World');

			await watching.close();

			process.chdir(originalCwd);
		});

		test('warnOnUnusedString to work with json path', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default true;',
					'/src/locales/en.json': JSON.stringify(localesSingle.en),
				},
				(config) => {
					configureWebpack(config);

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: {
								en: '/src/locales/en.json',
							},
							warnOnUnusedString: true,
						}),
					);
				},
			);

			const { warnings } = built.stats.compilation;
			const keys = Object.keys(localesSingle.en);
			expect(warnings.length).toBe(keys.length);
			for (let i = 0; i < keys.length; i += 1) {
				expect(warnings[i].message).toMatch(`Unused string key "${keys[i]}"`);
			}

			const buildStatsUsed = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
					'/src/locales/en.json': JSON.stringify(localesSingle.en),
				},
				(config) => {
					configureWebpack(config);

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: {
								en: '/src/locales/en.json',
							},
							warnOnUnusedString: true,
						}),
					);
				},
			);

			expect(buildStatsUsed.stats.compilation.warnings.length).toBe(keys.length - 1);
		});

		test('function filename with Wepback placeholder', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					if (isWebpack5) {
						config.output!.filename = () => '[name].fn.[locale].[fullhash].js';
						// @ts-expect-error Webpack 5 config
						config.output!.chunkFilename = () => '[name].fn.[locale].[fullhash].js';
					} else {
						config.output!.filename = () => '[name].fn.[locale].[hash].js';
						config.output!.chunkFilename = '[name].fn.[locale].[hash].js';
					}

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(Object.keys(assets).length).toBe(3);

			const { hash } = built.stats;

			const enBuild = built.require(`/dist/index.fn.en.${hash}.js`);
			expect(enBuild).toBe(localesMulti.en['hello-key']);

			const esBuild = built.require(`/dist/index.fn.es.${hash}.js`);
			expect(esBuild).toBe(localesMulti.es['hello-key']);

			const jaBuild = built.require(`/dist/index.fn.ja.${hash}.js`);
			expect(jaBuild).toBe(localesMulti.ja['hello-key']);

			const statsOutput = built.stats.toString();
			expect(statsOutput).toMatch(/index\.fn\.en\./);
			expect(statsOutput).toMatch(/index\.fn\.es\./);
			expect(statsOutput).toMatch(/index\.fn\.ja\./);
		});
	});
});
