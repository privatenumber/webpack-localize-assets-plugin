import { testSuite, expect } from 'manten';
import { build } from 'webpack-test-utils';
import { localesSingle, localesMulti } from '../utils/localization-data';
import WebpackLocalizeAssetsPlugin from '#webpack-localize-assets-plugin'; // eslint-disable-line import/no-unresolved

export default testSuite(({ describe }, isWebpack5?: boolean) => {
	describe('contenthash', ({ test }) => {
		test('single locale', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const builtA = await build(
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

			const assetFilenameA = Object.keys(builtA.stats.compilation.assets)[0];

			const enBuildA = builtA.require(`/dist/${assetFilenameA}`);
			expect(enBuildA).toBe('Hello');

			const builtB = await build(
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

			const assetFilenameB = Object.keys(builtB.stats.compilation.assets)[0];

			const enBuildB = builtB.require(`/dist/${assetFilenameB}`);
			expect(enBuildB).toBe('Wazzup');

			expect(assetFilenameA).not.toBe(assetFilenameB);
		});

		test('async chunks', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default import("./async-import").then(module => module.default);',
					'/src/async-import.js': 'export default import("./async-import2").then(module => module.default);',
					'/src/async-import2.js': 'export default __("hello-key");',
				},
				(config) => {
					config.output!.filename = '[name].[contenthash].[locale].js';

					config.plugins!.push(
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

		/**
		 * Updating contenthash only works with Webpack 5 because of `realContentHash`
		 * https://webpack.js.org/configuration/optimization/#optimizationrealcontenthash
		 *
		 * Without it, Webpack doesn't recalculate the hash after minification/optimization
		 */
		if (isWebpack5) {
			test('multi locale', async () => {
				const volume = {
					'/src/index.js': 'export default __("hello-key");',
				};

				const builtA = await build(
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

				const assetsA = Object.keys(builtA.stats.compilation.assets);
				const [assetFilenameA] = assetsA;

				const enBuildA = builtA.require(`/dist/${assetFilenameA}`);
				expect(enBuildA).toBe('Hello');

				const builtB = await build(
					volume,
					(config) => {
						config.output!.filename = '[name].[contenthash].[locale].js';
						config.plugins!.push(
							new WebpackLocalizeAssetsPlugin({
								locales: {
									...localesMulti,
									en: {
										'hello-key': 'Wazzup',
										stringWithDoubleQuotes: '"quotes"',
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
		}
	});
});
