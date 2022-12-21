import { testSuite, expect } from 'manten';
import { build, watch } from 'webpack-test-utils';
import { localesEmpty, localesSingle, localesMulti } from '../utils/localization-data';
import { configureWebpack } from '../utils/configure-webpack';
import WebpackLocalizeAssetsPlugin from '#webpack-localize-assets-plugin'; // eslint-disable-line import/no-unresolved

export default testSuite(({ describe }) => {
	describe('error-cases', ({ test, describe }) => {
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
			}).rejects.toThrow(/Options are required/);
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
			}).rejects.toThrow(/Locales are required/);
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

					config.plugins!.push(
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
					config.output!.filename = '[name].[locale].[locale].js';
					config.plugins!.push(
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

					config.plugins!.push(
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

		describe('missing key', ({ test }) => {
			test('warning - single locale', async () => {
				const built = await build(
					{
						'/src/index.js': 'export default __("bad key");',
					},
					(config) => {
						configureWebpack(config);

						config.plugins!.push(
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

						config.plugins!.push(
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

						config.plugins!.push(
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

			test('missing [locale] from filename on multi locale', async () => {
				await expect(async () => {
					await build(
						{
							'/src/index.js': '',
						},
						(config) => {
							config.output!.filename = '[name].js';
							config.plugins!.push(
								new WebpackLocalizeAssetsPlugin({
									locales: localesMulti,
								}),
							);
						},
					);
				}).rejects.toThrow('output.filename must include [locale]');
			});

			test('missing [locale] from chunkFilename on multi locale', async () => {
				await expect(async () => {
					await build(
						{
							'/src/index.js': '',
						},
						(config) => {
							configureWebpack(config);

							config.output!.chunkFilename = '[name].js';
							config.plugins!.push(
								new WebpackLocalizeAssetsPlugin({
									locales: localesMulti,
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

						config.plugins!.push(
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

						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales: localesMulti,
								warnOnUnusedString: true,
							}),
						);
					},
				);

				let stats = await watching.build(true);

				const { warnings } = stats.compilation;
				const keys = Object.keys(localesMulti.en);
				expect(warnings.length).toBe(keys.length);
				for (let i = 0; i < keys.length; i += 1) {
					expect(warnings[i].message).toMatch(`Unused string key "${keys[i]}"`);
				}

				watching.fs.writeFileSync('/src/index.js', 'export default __("hello-key");');

				stats = await watching.build(true);
				expect(stats.compilation.warnings.length).toBe(keys.length - 1);

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

					config.plugins!.push(
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
});
