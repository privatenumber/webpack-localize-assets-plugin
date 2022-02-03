import type { Identifier } from 'estree';
import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import tempy from 'tempy';
import { build, watch, DefaultWebpackConfig } from 'webpack-test-utils';
import WebpackLocalizeAssetsPlugin from '../dist/index.js';
import { Compiler, WP5 } from '../src/types';

const localesEmpty = {};
const localesSingle = {
	en: {
		'hello-key': 'Hello',
	},
};
const localesMulti = {
	en: {
		'hello-key': 'Hello',
		stringWithQuotes: '"quotes"',
	},
	es: {
		'hello-key': 'Hola',
		stringWithQuotes: '"quotes"',
	},
	ja: {
		'hello-key': 'こんにちは',
		stringWithQuotes: '"quotes"',
	},
};

function configureWebpack(config: DefaultWebpackConfig) {
	config.output.filename = '[name].[locale].js';
}

describe(`Webpack ${webpack.version}`, () => {
	const isWebpack5 = webpack.version?.startsWith('5.');

	describe('error-cases', () => {
		test('no option', async () => {
			await expect(async () => {
				await build(
					{},
					(config) => {
						config.plugins.push(
							// @ts-expect-error testing no option
							new WebpackLocalizeAssetsPlugin(),
						);
					},
				);
			}).rejects.toThrow(/Options are required/);
		});

		test('no option.locales', async () => {
			await expect(async () => {
				await build(
					{},
					(config) => {
						config.plugins.push(
							// @ts-expect-error testing no option.locales
							new WebpackLocalizeAssetsPlugin({}),
						);
					},
				);
			}).rejects.toThrow(/Locales are required/);
		});

		test('no locales', async () => {
			await expect(async () => {
				await build(
					{},
					(config) => {
						config.plugins.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesEmpty,
							}),
						);
					},
				);
			}).rejects.toThrow(/locales must contain at least one locale/);
		});

		test('empty object for localizeCompiler', async () => {
			await expect(async () => {
				await build(
					{},
					(config) => {
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesSingle,
								localizeCompiler: {},
							}),
						);
					},
				);
			}).rejects.toThrow(/empty/);
		});

		test('functionName and localizeCompiler together', async () => {
			await expect(async () => {
				await build(
					{},
					(config) => {
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								functionName: 'bar',
								locales: localesSingle,
								localizeCompiler: {
									foo() { return ''; },
								},
							}),
						);
					},
				);
			}).rejects.toThrow(/also/);
		});

		test('can use string [locale] in source', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default "[locale]";',
				},
				(config) => {
					configureWebpack(config);

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const enBuild = built.require('/dist/index.en.js');
			expect(enBuild).toBe('[locale]');
		});

		test('can use string [locale] in name multiple times', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default "[locale]";',
				},
				(config) => {
					config.output.filename = '[name].[locale].[locale].js';
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(assets).toHaveProperty(['index.en.en.js']);
		});

		test('warn on confusing function usage', async () => {
			const built = await build(
				{
					'/src/index.js': `
						export default [
							__(),
							__(1234),
						];
					`,
				},
				(config) => {
					configureWebpack(config);

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			expect(built.stats.hasWarnings()).toBe(true);
			expect(built.stats.compilation.warnings.length).toBe(2);
			expect(built.stats.compilation.warnings[0].message).toMatch('Ignoring confusing usage of localization function "__" in /src/index.js:3:7');
			expect(built.stats.compilation.warnings[1].message).toMatch('Ignoring confusing usage of localization function "__" in /src/index.js:4:7');
		});

		test('sourceMapForLocales - invalid locale', async () => {
			await expect(async () => {
				await build(
					{
						'/src/index.js': '',
					},
					(config) => {
						configureWebpack(config);

						config.plugins.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesSingle,
								sourceMapForLocales: ['non-existent-locale'],
							}),
						);
					},
				);
			}).rejects.toThrow('sourceMapForLocales must contain valid locales');
		});

		describe('missing key', () => {
			test('warning - single locale', async () => {
				const built = await build(
					{
						'/src/index.js': 'export default __("bad key");',
					},
					(config) => {
						configureWebpack(config);

						config.plugins.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesSingle,
							}),
						);
					},
				);

				expect(built.require('/dist/index.en.js')).toBe('bad key');

				expect(built.stats.hasWarnings()).toBe(true);
				expect(built.stats.compilation.warnings.length).toBe(1);
				expect(built.stats.compilation.warnings[0].message).toMatch('Missing localization for key "bad key" used in /src/index.js:1:15 from locales: en');
			});

			test('warning - multi locale', async () => {
				const built = await build(
					{
						'/src/index.js': 'export default __("bad key");',
					},
					(config) => {
						configureWebpack(config);

						config.plugins.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesMulti,
							}),
						);
					},
				);

				expect(built.require('/dist/index.en.js')).toBe('bad key');

				const { warnings } = built.stats.compilation;
				expect(warnings.length).toBe(1);
				expect(warnings[0].message).toMatch('Missing localization for key "bad key" used in /src/index.js:1:15 from locales: en, es, ja');
			});

			test('throwOnMissing', async () => {
				const built = await build(
					{
						'/src/index.js': 'export default __("bad key");',
					},
					(config) => {
						configureWebpack(config);

						config.plugins.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesMulti,
								throwOnMissing: true,
							}),
						);
					},
				);

				const { errors } = built.stats.compilation;
				expect(errors.length).toBe(1);
				expect(errors[0].message).toMatch('Missing localization for key "bad key" used in /src/index.js:1:15 from locales: en, es, ja');
			});

			test('missing [locale] from filename', async () => {
				await expect(async () => {
					await build(
						{
							'/src/index.js': '',
						},
						(config) => {
							config.output.filename = '[name].js';
							config.plugins.push(
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
							configureWebpack(config);

							config.output.chunkFilename = '[name].js';
							config.plugins.push(
								new WebpackLocalizeAssetsPlugin({
									locales: localesSingle,
								}),
							);
						},
					);
				}).rejects.toThrow('output.chunkFilename must include [locale]');
			});

			test('watch - should re-warn on compile', async () => {
				const watching = watch(
					{
						'/src/index.js': 'export default __("missing-key-1");',
					},
					(config) => {
						configureWebpack(config);

						config.plugins.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesSingle,
							}),
						);
					},
				);

				let stats = await watching.build(true);

				let { warnings } = stats.compilation;
				expect(warnings.length).toBe(1);
				expect(warnings[0].message).toMatch('Missing localization for key "missing-key-1" used in /src/index.js:1:15 from locales: en');

				watching.fs.writeFileSync('/src/index.js', 'export default [__("missing-key-1"), __("missing-key-2")];');

				stats = await watching.build(true);
				warnings = stats.compilation.warnings;

				expect(warnings.length).toBe(2);
				expect(warnings[0].message).toMatch('Missing localization for key "missing-key-1" used in /src/index.js:1:16 from locales: en');
				expect(warnings[1].message).toMatch('Missing localization for key "missing-key-2" used in /src/index.js:1:37 from locales: en');

				watching.fs.writeFileSync('/src/index.js', 'export default __("missing-key-1");');

				stats = await watching.build(true);
				warnings = stats.compilation.warnings;

				expect(warnings.length).toBe(1);
				expect(warnings[0].message).toMatch('Missing localization for key "missing-key-1" used in /src/index.js:1:15 from locales: en');

				await watching.close();
			});

			test('watch - unused', async () => {
				const watching = watch(
					{
						'/src/index.js': 'export default true;',
					},
					(config) => {
						configureWebpack(config);

						config.plugins.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesMulti,
								warnOnUnusedString: true,
							}),
						);
					},
				);

				let stats = await watching.build(true);

				const { warnings } = stats.compilation;
				expect(warnings.length).toBe(2);
				expect(warnings[0].message).toMatch('Unused string key "hello-key"');
				expect(warnings[1].message).toMatch('Unused string key "stringWithQuotes"');

				watching.fs.writeFileSync('/src/index.js', 'export default [__("hello-key"), __("stringWithQuotes")];');

				stats = await watching.build(true);
				expect(stats.compilation.warnings.length).toBe(0);

				await watching.close();
			});
		});

		test('default localizeCompiler to error on misuse', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __("hello-key", "2nd arg not allowed");',
				},
				(config) => {
					configureWebpack(config);

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			expect(built.require('/dist/index.en.js')).toBe('hello-key');

			const { warnings } = built.stats.compilation;
			expect(warnings.length).toBe(1);
			expect(warnings[0].message).toMatch('Ignoring confusing usage of localization function: __("hello-key", "2nd arg not allowed")');
		});
	});

	describe('passing', () => {
		test('single locale', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					configureWebpack(config);

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(Object.keys(assets).length).toBe(1);

			const enBuild = built.require('/dist/index.en.js');
			expect(enBuild).toBe(localesMulti.en['hello-key']);

			const statsOutput = built.stats.toString();
			expect(statsOutput).toMatch(/index\.en\.js/);
		});

		test('multi locale', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					configureWebpack(config);

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(Object.keys(assets).length).toBe(3);

			const enBuild = built.require('/dist/index.en.js');
			expect(enBuild).toBe(localesMulti.en['hello-key']);

			const esBuild = built.require('/dist/index.es.js');
			expect(esBuild).toBe(localesMulti.es['hello-key']);

			const jaBuild = built.require('/dist/index.ja.js');
			expect(jaBuild).toBe(localesMulti.ja['hello-key']);

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

					config.plugins.push(
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
							test1: __("hello-key") + " world and " + __("stringWithQuotes"),
						    test2: __("hello-key").length,
						    test3: [__("hello-key"), __("stringWithQuotes")],
						    test4: __("hello-key") || "hello",
						    test5: __("hello-key") ? "hello" : "goodbye",
						};
					`,
				},
				(config) => {
					configureWebpack(config);

					config.optimization.minimize = true;
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const enBuild = await built.require('/dist/index.en.js');
			expect(enBuild.test1).toBe(`${localesMulti.en['hello-key']} world and "quotes"`);
			expect(enBuild.test2).toBe(localesMulti.en['hello-key'].length);
			expect(enBuild.test3).toEqual([localesMulti.en['hello-key'], localesMulti.en.stringWithQuotes]);
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

					config.module.rules.push({
						test: /\.css$/,
						use: [
							MiniCssExtractPlugin.loader,
							'css-loader',
						],
					});

					config.plugins.push(
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

					config.module.rules.push({
						test: /\.css$/,
						use: [
							MiniCssExtractPlugin.loader,
							'css-loader',
						],
					});

					config.plugins.push(
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

				apply(compiler: Compiler) {
					compiler.hooks.compilation.tap(FakeMinifier.name, (compilation) => {
						const checkAssets = () => {
							const assets = Object.keys(compilation.assets);
							expect(assets.length).toBe(1);
							expect(assets[0]).toBe('index.en.js');

							const asset = compilation.getAsset('index.en.js');
							expect(asset.source.source()).toMatch(/"Hello"/);
						};

						if (isWebpack5) {
							(compilation as WP5.Compilation).hooks.processAssets.tap(
								{
									name: FakeMinifier.name,
									stage: (compilation.constructor as typeof WP5.Compilation)
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

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
						FakeMinifier,
					);
				},
			);
		});

		test('emits source-maps', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					configureWebpack(config);

					config.devtool = 'source-map';
					config.plugins.push(
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
					config.plugins.push(
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

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
							warnOnUnusedString: true,
						}),
					);
				},
			);

			expect(built.stats.hasWarnings()).toBe(true);
			expect(built.stats.compilation.warnings.length).toBe(2);
			expect(built.stats.compilation.warnings[0].message).toMatch('Unused string key "hello-key"');
			expect(built.stats.compilation.warnings[1].message).toMatch('Unused string key "stringWithQuotes"');
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

					config.module.rules.push({
						test: /\.css$/,
						use: [
							MiniCssExtractPlugin.loader,
							'css-loader',
						],
					});

					config.plugins.push(
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
			const configure = (config: DefaultWebpackConfig) => {
				configureWebpack(config);

				config.cache = {
					type: 'filesystem',
					cacheDirectory,
				};

				config.plugins.push(
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
		});

		test('warnOnUnusedString works with Webpack 5 cache', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const configure = (config: DefaultWebpackConfig) => {
				configureWebpack(config);

				config.cache = {
					type: 'filesystem',
				};

				config.plugins.push(
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

			const { warnings: warningsA } = builtA.stats.compilation;
			expect(warningsA.length).toBe(1);
			expect(warningsA[0].message).toMatch('Unused string key "stringWithQuotes"');

			const builtB = await build(
				volume,
				configure,
			);

			const { warnings: warningsB } = builtB.stats.compilation;
			expect(warningsB.length).toBe(1);
			expect(warningsB[0].message).toMatch('Unused string key "stringWithQuotes"');
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

					config.plugins.push(
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

			delete watching.require.cache['/dist/index.en.js'];
			enBuild = watching.require('/dist/index.en.js');
			expect(enBuild).toBe('Hello World');

			watching.fs.writeFileSync('/src/locales/en.json', JSON.stringify({
				'world-key': 'World',
			}));

			stats = await watching.build(true);
			warnings = stats.compilation.warnings;

			expect(warnings.length).toBe(1);
			expect(warnings[0].message).toMatch('Missing localization for key "hello-key" used in /src/index.js:1:15 from locales: en');

			delete watching.require.cache['/dist/index.en.js'];
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

					config.plugins.push(
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
			expect(warnings.length).toBe(1);
			expect(warnings[0].message).toMatch('Unused string key "hello-key"');

			const buildStatsUsed = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
					'/src/locales/en.json': JSON.stringify(localesSingle.en),
				},
				(config) => {
					configureWebpack(config);

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: {
								en: '/src/locales/en.json',
							},
							warnOnUnusedString: true,
						}),
					);
				},
			);

			expect(buildStatsUsed.stats.compilation.warnings.length).toBe(0);
		});

		test('function filename with Wepback placeholder', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					if (isWebpack5) {
						// @ts-expect-error Webpack 5 config
						config.output.filename = () => '[name].fn.[locale].[fullhash].js';
						// @ts-expect-error Webpack 5 config
						config.output.chunkFilename = () => '[name].fn.[locale].[fullhash].js';
					} else {
						// @ts-expect-error Webpack 5 config
						config.output.filename = () => '[name].fn.[locale].[hash].js';
						config.output.chunkFilename = '[name].fn.[locale].[hash].js';
					}

					config.plugins.push(
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

	describe('localizeCompiler', () => {
		test('single locale', async () => {
			const built = await build(
				{
					'/src/index.js': `
					function compiled(x) {
						return x + "-compiled";
					}
					export default __('hello-key');
					`,
				},
				(config) => {
					configureWebpack(config);

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
							localizeCompiler: {
								__(callArguments, locale) {
									expect(locale).toBe('en');
									expect((this.callNode.callee as Identifier).name).toBe('__');
									expect(this.resolveKey()).toBe('Hello');
									return `compiled('${this.resolveKey(callArguments[0].slice(1, -1))}')`;
								},
							},
						}),
					);
				},
			);

			const enBuild = built.require('/dist/index.en.js');
			expect(enBuild).toBe(`${localesMulti.en['hello-key']}-compiled`);
		});

		test('multi locale', async () => {
			const compilerCalls: string[][] = [];
			const built = await build(
				{
					'/src/index.js': `
					function compiled(x) {
						return x + '-compiled';
					}

					const a = 1;
					export default __('hello-key', { a });
					`,
				},
				(config) => {
					configureWebpack(config);

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
							localizeCompiler: {
								__(callArguments, localeName) {
									compilerCalls.push([
										...callArguments,
										localeName,
										this.resolveKey(),
										(this.callNode.callee as Identifier).name,
									]);
									return `compiled('${this.resolveKey(callArguments[0].slice(1, -1))}')`;
								},
							},
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(Object.keys(assets).length).toBe(3);

			const enBuild = built.require('/dist/index.en.js');
			expect(enBuild).toBe(`${localesMulti.en['hello-key']}-compiled`);

			const esBuild = built.require('/dist/index.es.js');
			expect(esBuild).toBe(`${localesMulti.es['hello-key']}-compiled`);

			const jaBuild = built.require('/dist/index.ja.js');
			expect(jaBuild).toBe(`${localesMulti.ja['hello-key']}-compiled`);

			const statsOutput = built.stats.toString();
			expect(statsOutput).toMatch(/index\.en\.js/);
			expect(statsOutput).toMatch(/index\.es\.js/);
			expect(statsOutput).toMatch(/index\.ja\.js/);

			expect(compilerCalls).toEqual([
				["'hello-key'", '{a}', 'en', 'Hello', '__'],
				["'hello-key'", '{a}', 'es', 'Hola', '__'],
				["'hello-key'", '{a}', 'ja', 'こんにちは', '__'],
			]);
		});

		test('multiple functions', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default [_f("hello-key"), _g("hello-key")]',
				},
				(config) => {
					configureWebpack(config);

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
							localizeCompiler: {
								_f([key]) { return JSON.stringify(`_f:${this.resolveKey(JSON.parse(key))}`); },
								_g([key]) { return JSON.stringify(`_g:${this.resolveKey(JSON.parse(key))}`); },
							},
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(Object.keys(assets).length).toBe(1);

			const enBuild = built.require('/dist/index.en.js');
			expect(enBuild[0]).toBe(`_f:${localesSingle.en['hello-key']}`);
			expect(enBuild[1]).toBe(`_g:${localesSingle.en['hello-key']}`);
		});
	});

	describe('throwOnMissingLocaleInFileName', () => {
		test('single locale', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					configureWebpack(config);

					config.output.filename = '[name].js';
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
							throwOnMissingLocaleInFileName: false,
						}),
					);
				},
			);

			const { assets } = built.stats.compilation;
			expect(Object.keys(assets).length).toBe(1);

			const enBuild = built.require('/dist/index.js');
			expect(enBuild).toBe(localesMulti.en['hello-key']);

			const statsOutput = built.stats.toString();
			expect(statsOutput).toMatch(/index\.js/);
		});

		test('multi locale, option is ignored', async () => {
			await expect(async () => {
				await build(
					{
						'/src/index.js': 'export default __("hello-key");',
					},
					(config) => {
						configureWebpack(config);

						config.output.filename = '[name].js';
						config.plugins.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesMulti,
								throwOnMissingLocaleInFileName: false,
							}),
						);
					},
				);
			}).rejects.toThrow('output.filename must include [locale]');
		});
	});

	describe('chunkhash', () => {
		test('single locale', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const builtA = await build(
				volume,
				(config) => {
					configureWebpack(config);

					config.output.filename = '[name].[chunkhash].[locale].js';
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const assetFilenameA = Object.keys(builtA.stats.compilation.assets)[0];

			const enBuildA = builtA.require(`/dist/${assetFilenameA}`);
			expect(enBuildA).toBe('Hello');

			const builtB = await build(
				volume,
				(config) => {
					configureWebpack(config);

					config.output.filename = '[name].[chunkhash].[locale].js';
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: {
								...localesSingle,
								en: {
									'hello-key': 'Wazzup',
								},
							},
						}),
					);
				},
			);

			const assetFilenameB = Object.keys(builtB.stats.compilation.assets)[0];

			const enBuildB = builtB.require(`/dist/${assetFilenameB}`);
			expect(enBuildB).toBe('Wazzup');

			expect(assetFilenameA).not.toBe(assetFilenameB);
		});

		test('multi locale', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const builtA = await build(
				volume,
				(config) => {
					configureWebpack(config);

					config.output.filename = '[name].[chunkhash].[locale].js';
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const assetFilenameA = Object.keys(builtA.stats.compilation.assets)[0];

			const enBuildA = builtA.require(`/dist/${assetFilenameA}`);
			expect(enBuildA).toBe('Hello');

			const builtB = await build(
				volume,
				(config) => {
					configureWebpack(config);

					config.output.filename = '[name].[chunkhash].[locale].js';
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: {
								...localesMulti,
								en: {
									'hello-key': 'Wazzup',
									stringWithQuotes: '"quotes"',
								},
							},
						}),
					);
				},
			);

			const assetsB = Object.keys(builtB.stats.compilation.assets);
			const assetFilenameB = assetsB[0];

			const enBuildB = builtB.require(`/dist/${assetFilenameB}`);
			expect(enBuildB).toBe('Wazzup');

			expect(assetFilenameA).not.toBe(assetFilenameB);

			// All assets are coming from the same chunk, so they should share the same chunkhash
			const hashPattern = /[a-f\d]{20}/;
			expect(assetsB[0].match(hashPattern)?.[0]).toBe(assetsB[1].match(hashPattern)?.[0]);
		});
	});

	describe('contenthash', () => {
		test('single locale', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const builtA = await build(
				volume,
				(config) => {
					config.output.filename = '[name].[contenthash].[locale].js';
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const assetFilenameA = Object.keys(builtA.stats.compilation.assets)[0];

			const enBuildA = builtA.require(`/dist/${assetFilenameA}`);
			expect(enBuildA).toBe('Hello');

			const builtB = await build(
				volume,
				(config) => {
					config.output.filename = '[name].[contenthash].[locale].js';
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: {
								...localesSingle,
								en: {
									'hello-key': 'Wazzup',
								},
							},
						}),
					);
				},
			);

			const assetFilenameB = Object.keys(builtB.stats.compilation.assets)[0];

			const enBuildB = builtB.require(`/dist/${assetFilenameB}`);
			expect(enBuildB).toBe('Wazzup');

			expect(assetFilenameA).not.toBe(assetFilenameB);
		});

		// remove skip after implementing hashing w/o realcontenthash
		(isWebpack5 ? test : test.skip)('multi locale', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const builtA = await build(
				volume,
				(config) => {
					config.output.filename = '[name].[contenthash].[locale].js';
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const assetsA = Object.keys(builtA.stats.compilation.assets);
			const [assetFilenameA] = assetsA;

			const enBuildA = builtA.require(`/dist/${assetFilenameA}`);
			expect(enBuildA).toBe('Hello');

			const builtB = await build(
				volume,
				(config) => {
					config.output.filename = '[name].[contenthash].[locale].js';
					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: {
								...localesMulti,
								en: {
									'hello-key': 'Wazzup',
									stringWithQuotes: '"quotes"',
								},
							},
						}),
					);
				},
			);

			const assetsB = Object.keys(builtB.stats.compilation.assets);
			const [assetFilenameB] = assetsB;

			const enBuildB = builtB.require(`/dist/${assetFilenameB}`);
			expect(enBuildB).toBe('Wazzup');

			expect(assetFilenameA).not.toBe(assetFilenameB);
			expect(assetsB[1]).toBe(assetsA[1]);
		});

		(isWebpack5 ? test : test.skip)('async chunks', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default import("./async-import").then(module => module.default);',
					'/src/async-import.js': 'export default import("./async-import2").then(module => module.default);',
					'/src/async-import2.js': 'export default __("hello-key");',
				},
				(config) => {
					config.output.filename = '[name].[contenthash].[locale].js';

					config.plugins.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const assets = Object.keys(built.stats.compilation.assets);
			const indexAsset = assets.find(a => a.includes('index') && a.includes('.en.js'));

			expect(await built.require(`/dist/${indexAsset}`)).toBe(localesMulti.en['hello-key']);
		});
	});
});
