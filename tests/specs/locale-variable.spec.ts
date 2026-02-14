import { testSuite, expect } from 'manten';
import { build } from 'webpack-test-utils';
import { localesSingle, localesMulti } from '../utils/localization-data.js';
import { configureWebpack } from '../utils/configure-webpack.js';
import WebpackLocalizeAssetsPlugin from '#webpack-localize-assets-plugin'; // eslint-disable-line import/no-unresolved

export default testSuite(({ describe }) => {
	describe('localeVariable', ({ test }) => {
		test('single locale', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __locale;',
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
			expect(enBuild).toBe('en');
		});

		test('multi locale', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __locale;',
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
			expect(enBuild).toBe('en');

			const esBuild = built.require('/dist/index.es.js');
			expect(esBuild).toBe('es');

			const jaBuild = built.require('/dist/index.ja.js');
			expect(jaBuild).toBe('ja');

			const statsOutput = built.stats.toString();
			expect(statsOutput).toMatch(/index\.en\.js/);
			expect(statsOutput).toMatch(/index\.es\.js/);
			expect(statsOutput).toMatch(/index\.ja\.js/);
		});

		test('with different name', async () => {
			const built = await build(
				{
					'/src/index.js': 'export default __localeName;',
				},
				(config) => {
					configureWebpack(config);

					config.plugins!.push(
						new WebpackLocalizeAssetsPlugin({
							locales: localesSingle,
							localeVariable: '__localeName',
						}),
					);
				},
			);

			const enBuild = built.require('/dist/index.en.js');
			expect(enBuild).toBe('en');
		});
	});
});
