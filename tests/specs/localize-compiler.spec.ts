import { testSuite, expect } from 'manten';
import { build } from 'webpack-test-utils';
import type { Identifier } from 'estree';
import { localesSingle, localesMulti } from '../utils/localization-data.js';
import { configureWebpack } from '../utils/configure-webpack.js';
import WebpackLocalizeAssetsPlugin from '#webpack-localize-assets-plugin'; // eslint-disable-line import/no-unresolved

export default testSuite(({ describe }) => {
	describe('localizeCompiler', ({ test }) => {
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

					config.plugins!.push(
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

					config.plugins!.push(
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
});
