import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import tempy from 'tempy';
import { createFsRequire } from 'fs-require';
import { isWebpack5 } from '../src/utils';
import WebpackLocalizeAssetsPlugin from '../src/index';
import { build, watch, assertFsWithReadFileSync } from './utils';

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

		describe('missing locale', () => {
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
	});

	describe('passing', () => {
		test('localize assets', async () => {
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

		test('works with minification (string concatenation)', async () => {
			const buildStats = await build(
				{
					'/src/index.js': 'export default __("hello-key") + " world and " + __("stringWithQuotes");',
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
			expect(enBuild).toBe(`${localesMulti.en['hello-key']} world and "quotes"`);

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
					'/src/index.js': 'export default __("hello-key");',
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
			const configure = (config) => {
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
			const configure = (config) => {
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
	});
});
