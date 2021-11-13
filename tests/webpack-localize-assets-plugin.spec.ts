import webpack, { Configuration } from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import tempy from 'tempy';
import { createFsRequire } from 'fs-require';
import WebpackLocalizeAssetsPlugin from '../src/index';
import { Compiler, LocalizeCompilerContext, WP5 } from '../src/types';
import {
	build, watch, assertFsWithReadFileSync,
} from './utils';

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

describe(`Webpack ${webpack.version}`, () => {
	const isWebpack5 = webpack.version?.startsWith('5.');

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
			}).rejects.toThrow(/required/);
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
			}).rejects.toThrow(/required/);
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

			const mRequire = createFsRequire(mfs);

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

		test('warn on confusing function usage', async () => {
			const buildStats = await build(
				{
					'/src/index.js': `
						export default [
							__(),
							__(1234),
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

		test('sourceMapForLocales - invalid locale', async () => {
			await expect(async () => {
				await build(
					{
						'/src/index.js': '',
					},
					(config) => {
						config.plugins!.push(
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
				const buildStats = await build(
					{
						'/src/index.js': 'export default __("bad key");',
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

				const mRequire = createFsRequire(mfs);

				expect(mRequire('/dist/index.en.js')).toBe('bad key');

				expect(buildStats.hasWarnings()).toBe(true);
				expect(buildStats.compilation.warnings.length).toBe(1);
				expect(buildStats.compilation.warnings[0].message).toMatch('Missing localization for key "bad key" used in /src/index.js:1:15 from locales: en');
			});

			test('warning - multi locale', async () => {
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

				const mfs = buildStats.compilation.compiler.outputFileSystem;
				assertFsWithReadFileSync(mfs);

				const mRequire = createFsRequire(mfs);

				expect(mRequire('/dist/index.en.js')).toBe('bad key');

				expect(buildStats.hasWarnings()).toBe(true);
				expect(buildStats.compilation.warnings.length).toBe(1);
				expect(buildStats.compilation.warnings[0].message).toMatch('Missing localization for key "bad key" used in /src/index.js:1:15 from locales: en, es, ja');
			});

			test('throwOnMissing', async () => {
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
				}).rejects.toThrow('Missing localization for key "bad key" used in /src/index.js:1:15 from locales: en, es, ja');
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

			test('watch - should re-warn on compile', async () => {
				const buildStats = await watch(
					{
						'/src/index.js': 'export default __("missing-key-1");',
					},
					(config) => {
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesSingle,
							}),
						);
					},
					[
						(mfs, stats) => {
							expect(stats.compilation.warnings.length).toBe(1);
							expect(stats.compilation.warnings[0].message).toMatch('Missing localization for key "missing-key-1" used in /src/index.js:1:15 from locales: en');

							assertFsWithReadFileSync(mfs);
							mfs.writeFileSync('/src/index.js', 'export default [__("missing-key-1"), __("missing-key-2")];');
						},
						(mfs, stats) => {
							expect(stats.compilation.warnings.length).toBe(2);
							expect(stats.compilation.warnings[0].message).toMatch('Missing localization for key "missing-key-1" used in /src/index.js:1:16 from locales: en');
							expect(stats.compilation.warnings[1].message).toMatch('Missing localization for key "missing-key-2" used in /src/index.js:1:37 from locales: en');

							assertFsWithReadFileSync(mfs);
							mfs.writeFileSync('/src/index.js', 'export default __("missing-key-1");');
						},
					],
				);

				expect(buildStats.compilation.warnings.length).toBe(1);
				expect(buildStats.compilation.warnings[0].message).toMatch('Missing localization for key "missing-key-1" used in /src/index.js:1:15 from locales: en');
			});

			test('watch - unused', async () => {
				await watch(
					{
						'/src/index.js': 'export default true;',
					},
					(config) => {
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesMulti,
								warnOnUnusedString: true,
							}),
						);
					},
					[
						(mfs, stats) => {
							expect(stats.compilation.warnings.length).toBe(2);
							expect(stats.compilation.warnings[0].message).toMatch('Unused string key "hello-key"');
							expect(stats.compilation.warnings[1].message).toMatch('Unused string key "stringWithQuotes"');

							assertFsWithReadFileSync(mfs);
							mfs.writeFileSync('/src/index.js', 'export default [__("hello-key"), __("stringWithQuotes")];');
						},
						(mfs, stats) => {
							expect(stats.compilation.warnings.length).toBe(0);
						},
					],
				);
			});
		});

		test('default localizeCompiler to error on misuse', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello-key", "2nd arg not allowed");',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createFsRequire(mfs);
			expect(mRequire('/dist/index.en.js')).toBe('hello-key');

			expect(buildStats.hasWarnings()).toBe(true);
			expect(buildStats.compilation.warnings.length).toBe(1);
			expect(buildStats.compilation.warnings[0].message).toMatch('Ignoring confusing usage of localization function: __("hello-key", "2nd arg not allowed")');
		});
	});

	describe('passing', () => {
		test('single locale', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;
			expect(Object.keys(assets).length).toBe(1);

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createFsRequire(mfs);

			const enBuild = mRequire('/dist/index.en.js');
			expect(enBuild).toBe(localesMulti.en['hello-key']);

			const statsOutput = buildStats.toString();
			expect(statsOutput).toMatch(/index\.en\.js/);
		});

		test('multi locale', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
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

			const mRequire = createFsRequire(mfs);

			const enBuild = mRequire('/dist/index.en.js');
			expect(enBuild).toBe(localesMulti.en['hello-key']);

			const esBuild = mRequire('/dist/index.es.js');
			expect(esBuild).toBe(localesMulti.es['hello-key']);

			const jaBuild = mRequire('/dist/index.ja.js');
			expect(jaBuild).toBe(localesMulti.ja['hello-key']);

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
					'/src/async-import2.js': 'export default __("hello-key");',
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

			const mRequire = createFsRequire(mfs);

			const enBuild = await mRequire('/dist/index.en.js');
			expect(enBuild).toBe(localesMulti.en['hello-key']);

			const esBuild = await mRequire('/dist/index.es.js');
			expect(esBuild).toBe(localesMulti.es['hello-key']);

			const jaBuild = await mRequire('/dist/index.ja.js');
			expect(jaBuild).toBe(localesMulti.ja['hello-key']);
		});

		test('works with minification and different contexts for __() usages', async () => {
			const buildStats = await build(
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

			const mRequire = createFsRequire(mfs);

			const enBuild = await mRequire('/dist/index.en.js');
			expect(enBuild.test1).toBe(`${localesMulti.en['hello-key']} world and "quotes"`);
			expect(enBuild.test2).toBe(localesMulti.en['hello-key'].length);
			expect(enBuild.test3).toEqual([localesMulti.en['hello-key'], localesMulti.en.stringWithQuotes]);
			expect(enBuild.test4).toBe(localesMulti.en['hello-key']);
			expect(enBuild.test5).toBe('hello');

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
						}) as any,
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
						new MiniCssExtractPlugin() as any,
					);
				},
			);

			const { assets } = buildStats.compilation;

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
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					config.devtool = 'source-map';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;

			expect(assets).toHaveProperty(['index.en.js.map']);
			expect(assets).toHaveProperty(['index.es.js.map']);
			expect(assets).toHaveProperty(['index.ja.js.map']);
			expect(Object.keys(assets).length).toBe(6);
		});

		test('only emit source-maps for specified locales', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					config.devtool = 'source-map';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
							sourceMapForLocales: ['en'],
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
			expect(buildStats.compilation.warnings.length).toBe(2);
			expect(buildStats.compilation.warnings[0].message).toMatch('Unused string key "hello-key"');
			expect(buildStats.compilation.warnings[1].message).toMatch('Unused string key "stringWithQuotes"');
		});

		test('works with WebpackManifestPlugin', async () => {
			const hasLocale = /\.(?:en|es|ja)\.\w{2}(?:\.map)?$/;
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

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createFsRequire(mfs);
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

		test('works with Webpack 5 cache', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};
			const cacheDirectory = tempy.directory();
			const configure = (config: Configuration) => {
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

			const buildAStats = await build(
				volume,
				configure,
			);

			const mfsA = buildAStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfsA);

			const mRequireA = createFsRequire(mfsA);
			const indexEnA = mRequireA('/dist/index.en.js');
			expect(indexEnA).toBe('Hello');

			const buildBStats = await build(
				volume,
				configure,
			);

			const mfsB = buildBStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfsB);

			const mRequireB = createFsRequire(mfsB);
			const indexEnB = mRequireB('/dist/index.en.js');

			expect(indexEnB).toBe(indexEnA);
		});

		test('warnOnUnusedString works with Webpack 5 cache', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};
			const configure = (config: Configuration) => {
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

			const buildAStats = await build(
				volume,
				configure,
			);

			expect(buildAStats.hasWarnings()).toBe(true);
			expect(buildAStats.compilation.warnings.length).toBe(1);
			expect(buildAStats.compilation.warnings[0].message).toMatch('Unused string key "stringWithQuotes"');

			const buildBStats = await build(
				volume,
				configure,
			);

			expect(buildBStats.hasWarnings()).toBe(true);
			expect(buildBStats.compilation.warnings.length).toBe(1);
			expect(buildBStats.compilation.warnings[0].message).toMatch('Unused string key "stringWithQuotes"');
		});

		test('dynamically load relative locale json path', async () => {
			const originalCwd = process.cwd();

			process.chdir('/');

			await watch(
				{
					'/src/index.js': 'export default __("hello-key") + " " + __("world-key");',
					'/src/locales/en.json': JSON.stringify(localesSingle.en),
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: {
								en: './src/locales/en.json',
							},
						}),
					);
				},
				[
					(mfs, stats) => {
						expect(stats.compilation.warnings.length).toBe(1);
						expect(stats.compilation.warnings[0].message).toMatch('Missing localization for key "world-key" used in /src/index.js:1:39 from locales: en');

						assertFsWithReadFileSync(mfs);

						const mRequire = createFsRequire(mfs);
						const enBuild = mRequire('/dist/index.en.js');
						expect(enBuild).toBe('Hello world-key');

						mfs.writeFileSync('/src/locales/en.json', JSON.stringify({
							...localesSingle.en,
							'world-key': 'World',
						}));
					},
					(mfs, stats) => {
						expect(stats.hasWarnings()).toBe(false);

						assertFsWithReadFileSync(mfs);

						const mRequire = createFsRequire(mfs);
						const enBuild = mRequire('/dist/index.en.js');
						expect(enBuild).toBe('Hello World');

						mfs.writeFileSync('/src/locales/en.json', JSON.stringify({
							'world-key': 'World',
						}));
					},
					(mfs, stats) => {
						expect(stats.compilation.warnings.length).toBe(1);
						expect(stats.compilation.warnings[0].message).toMatch('Missing localization for key "hello-key" used in /src/index.js:1:15 from locales: en');

						assertFsWithReadFileSync(mfs);

						const mRequire = createFsRequire(mfs);
						const enBuild = mRequire('/dist/index.en.js');
						expect(enBuild).toBe('hello-key World');
					},
				],
			);

			process.chdir(originalCwd);
		});

		test('warnOnUnusedString to work with json path', async () => {
			const buildStatsMissing = await build(
				{
					'/src/index.js': 'export default true;',
					'/src/locales/en.json': JSON.stringify(localesSingle.en),
				},
				(config) => {
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

			expect(buildStatsMissing.compilation.warnings.length).toBe(1);
			expect(buildStatsMissing.compilation.warnings[0].message).toMatch('Unused string key "hello-key"');

			const buildStatsUsed = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
					'/src/locales/en.json': JSON.stringify(localesSingle.en),
				},
				(config) => {
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

			expect(buildStatsUsed.compilation.warnings.length).toBe(0);
		});

		test('function filename with Wepback placeholder', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello-key");',
				},
				(config) => {
					if (isWebpack5) {
						config!.output!.filename = () => '[name].fn.[locale].[fullhash].js';
						// @ts-expect-error Webpack 5 config
						config!.output!.chunkFilename = () => '[name].fn.[locale].[fullhash].js';
					} else {
						config!.output!.filename = () => '[name].fn.[locale].[hash].js';
						config!.output!.chunkFilename = '[name].fn.[locale].[hash].js';
					}

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;
			expect(Object.keys(assets).length).toBe(3);

			const { hash } = buildStats;
			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createFsRequire(mfs);

			const enBuild = mRequire(`/dist/index.fn.en.${hash}.js`);
			expect(enBuild).toBe(localesMulti.en['hello-key']);

			const esBuild = mRequire(`/dist/index.fn.es.${hash}.js`);
			expect(esBuild).toBe(localesMulti.es['hello-key']);

			const jaBuild = mRequire(`/dist/index.fn.ja.${hash}.js`);
			expect(jaBuild).toBe(localesMulti.ja['hello-key']);

			const statsOutput = buildStats.toString();
			expect(statsOutput).toMatch(/index\.fn\.en\./);
			expect(statsOutput).toMatch(/index\.fn\.es\./);
			expect(statsOutput).toMatch(/index\.fn\.ja\./);
		});
	});

	describe('localizeCompiler', () => {
		test('single locale', async () => {
			const buildStats = await build(
				{
					'/src/index.js': `
					function compiled(x) {
						return x + "-compiled";
					}
					export default __('hello-key');
					`,
				},
				(config) => {
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
							localizeCompiler(callArguments, locale) {
								expect(locale).toBe('en');
								expect(this.resolveKey()).toBe('Hello');
								return `compiled('${this.resolveKey(callArguments[0].slice(1, -1))}')`;
							},
						}),
					);
				},
			);

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createFsRequire(mfs);

			const enBuild = mRequire('/dist/index.en.js');
			expect(enBuild).toBe(`${localesMulti.en['hello-key']}-compiled`);
		});

		test('multi locale', async () => {
			const compilerCalls: string[][] = [];
			const buildStats = await build(
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
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
							localizeCompiler(callArguments, localeName) {
								compilerCalls.push([...callArguments, localeName, this.resolveKey()]);
								return `compiled('${this.resolveKey(callArguments[0].slice(1, -1))}')`;
							},
						}),
					);
				},
			);

			const { assets } = buildStats.compilation;
			expect(Object.keys(assets).length).toBe(3);

			const mfs = buildStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfs);

			const mRequire = createFsRequire(mfs);

			const enBuild = mRequire('/dist/index.en.js');
			expect(enBuild).toBe(`${localesMulti.en['hello-key']}-compiled`);

			const esBuild = mRequire('/dist/index.es.js');
			expect(esBuild).toBe(`${localesMulti.es['hello-key']}-compiled`);

			const jaBuild = mRequire('/dist/index.ja.js');
			expect(jaBuild).toBe(`${localesMulti.ja['hello-key']}-compiled`);

			const statsOutput = buildStats.toString();
			expect(statsOutput).toMatch(/index\.en\.js/);
			expect(statsOutput).toMatch(/index\.es\.js/);
			expect(statsOutput).toMatch(/index\.ja\.js/);

			expect(compilerCalls).toEqual([
				["'hello-key'", '{a}', 'en', 'Hello'],
				["'hello-key'", '{a}', 'es', 'Hola'],
				["'hello-key'", '{a}', 'ja', 'こんにちは'],
			]);
		});
	});

	describe('chunkhash', () => {
		test('single locale', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const buildAStats = await build(
				volume,
				(config) => {
					config.output!.filename = '[name].[chunkhash].[locale].js';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const assetFilenameA = Object.keys(buildAStats.compilation.assets)[0];
			const mfsA = buildAStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfsA);
			const mRequireA = createFsRequire(mfsA);
			const enBuildA = mRequireA(`/dist/${assetFilenameA}`);
			expect(enBuildA).toBe('Hello');

			const buildBStats = await build(
				volume,
				(config) => {
					config.output!.filename = '[name].[chunkhash].[locale].js';
					config.plugins!.push(
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

			const assetFilenameB = Object.keys(buildBStats.compilation.assets)[0];

			const mfsB = buildBStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfsB);
			const mRequireB = createFsRequire(mfsB);
			const enBuildB = mRequireB(`/dist/${assetFilenameB}`);
			expect(enBuildB).toBe('Wazzup');

			expect(assetFilenameA).not.toBe(assetFilenameB);
		});

		test('multi locale', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const buildAStats = await build(
				volume,
				(config) => {
					config.output!.filename = '[name].[chunkhash].[locale].js';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const assetFilenameA = Object.keys(buildAStats.compilation.assets)[0];
			const mfsA = buildAStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfsA);
			const mRequireA = createFsRequire(mfsA);
			const enBuildA = mRequireA(`/dist/${assetFilenameA}`);
			expect(enBuildA).toBe('Hello');

			const buildBStats = await build(
				volume,
				(config) => {
					config.output!.filename = '[name].[chunkhash].[locale].js';
					config.plugins!.push(
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

			const assetsB = Object.keys(buildBStats.compilation.assets);
			const assetFilenameB = assetsB[0];

			const mfsB = buildBStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfsB);
			const mRequireB = createFsRequire(mfsB);
			const enBuildB = mRequireB(`/dist/${assetFilenameB}`);
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

			const buildAStats = await build(
				volume,
				(config) => {
					config.output!.filename = '[name].[contenthash].[locale].js';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
						}),
					);
				},
			);

			const assetFilenameA = Object.keys(buildAStats.compilation.assets)[0];
			const mfsA = buildAStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfsA);
			const mRequireA = createFsRequire(mfsA);
			const enBuildA = mRequireA(`/dist/${assetFilenameA}`);
			expect(enBuildA).toBe('Hello');

			const buildBStats = await build(
				volume,
				(config) => {
					config.output!.filename = '[name].[contenthash].[locale].js';
					config.plugins!.push(
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

			const assetFilenameB = Object.keys(buildBStats.compilation.assets)[0];

			const mfsB = buildBStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfsB);
			const mRequireB = createFsRequire(mfsB);
			const enBuildB = mRequireB(`/dist/${assetFilenameB}`);
			expect(enBuildB).toBe('Wazzup');

			expect(assetFilenameA).not.toBe(assetFilenameB);
		});

		// remove skip after implementing hashing w/o realcontenthash
		(isWebpack5 ? test : test.skip)('multi locale', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const buildAStats = await build(
				volume,
				(config) => {
					config.output!.filename = '[name].[contenthash].[locale].js';
					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesMulti,
						}),
					);
				},
			);

			const assetsA = Object.keys(buildAStats.compilation.assets);
			const [assetFilenameA] = assetsA;
			const mfsA = buildAStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfsA);
			const mRequireA = createFsRequire(mfsA);
			const enBuildA = mRequireA(`/dist/${assetFilenameA}`);
			expect(enBuildA).toBe('Hello');

			const buildBStats = await build(
				volume,
				(config) => {
					config.output!.filename = '[name].[contenthash].[locale].js';
					config.plugins!.push(
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

			const assetsB = Object.keys(buildBStats.compilation.assets);
			const [assetFilenameB] = assetsB;

			const mfsB = buildBStats.compilation.compiler.outputFileSystem;
			assertFsWithReadFileSync(mfsB);
			const mRequireB = createFsRequire(mfsB);
			const enBuildB = mRequireB(`/dist/${assetFilenameB}`);
			expect(enBuildB).toBe('Wazzup');

			expect(assetFilenameA).not.toBe(assetFilenameB);
			expect(assetsB[1]).toBe(assetsA[1]);
		});
	});
});
