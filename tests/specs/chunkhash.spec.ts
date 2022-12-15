import { testSuite, expect } from 'manten';
import { build } from 'webpack-test-utils';
import { localesSingle, localesMulti } from '../utils/localization-data';
import { configureWebpack } from '../utils/configure-webpack';
import WebpackLocalizeAssetsPlugin from '#webpack-localize-assets-plugin'; // eslint-disable-line import/no-unresolved

export default testSuite(({ describe }) => {
	describe('chunkhash', ({ test }) => {
		test('single locale', async () => {
			const volume = {
				'/src/index.js': 'export default __("hello-key");',
			};

			const builtA = await build(
				volume,
				(config) => {
					configureWebpack(config);

					config.output!.filename = '[name].[chunkhash].[locale].js';
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
					configureWebpack(config);

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

					config.output!.filename = '[name].[chunkhash].[locale].js';
					config.plugins!.push(
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

					config.output!.filename = '[name].[chunkhash].[locale].js';
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
			const assetFilenameB = assetsB[0];

			const enBuildB = builtB.require(`/dist/${assetFilenameB}`);
			expect(enBuildB).toBe('Wazzup');

			expect(assetFilenameA).not.toBe(assetFilenameB);

			// All assets are coming from the same chunk, so they should share the same chunkhash
			const hashPattern = /[a-f\d]{20}/;
			expect(assetsB[0].match(hashPattern)?.[0]).toBe(assetsB[1].match(hashPattern)?.[0]);
		});
	});
});
