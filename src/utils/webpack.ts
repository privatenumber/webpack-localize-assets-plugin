import webpack from 'webpack';
import type WebpackError from 'webpack/lib/WebpackError.js';
import type { SimpleCallExpression } from 'estree';
import {
	Webpack,
	Compilation,
	WP5,
	NormalModuleFactory,
	Module,
} from '../types-internal.js';
import { name } from '../../package.json';

export const isWebpack5 = (wp: Webpack) => {
	const [major] = wp.version ? wp.version.split('.') : [];
	return major === '5';
};

export const isWebpack5Compilation = (
	compilation: Compilation,
): compilation is WP5.Compilation => ('processAssets' in compilation.hooks);

export const { toConstantDependency } = (
	isWebpack5(webpack)
		? require('webpack/lib/javascript/JavascriptParserHelpers') // eslint-disable-line node/global-require,import/no-unresolved
		: require('webpack/lib/ParserHelpers') // eslint-disable-line node/global-require
);

export const deleteAsset = (
	compilation: Compilation,
	assetName: string,
	newAssetNames: string[],
) => {
	// Delete original unlocalized asset
	if (isWebpack5Compilation(compilation)) {
		for (const chunk of compilation.chunks) {
			if (chunk.files.has(assetName)) {
				for (const newAssetName of newAssetNames) {
					chunk.files.add(newAssetName);
				}
			}
			if (chunk.auxiliaryFiles.has(assetName)) {
				for (const newAssetName of newAssetNames) {
					chunk.auxiliaryFiles.add(newAssetName);
				}
			}
		}

		compilation.deleteAsset(assetName);
	} else {
		delete compilation.assets[assetName];

		/**
		 * To support terser-webpack-plugin v1.4.5 (bundled with Webpack 4)
		 * which iterates over chunks instead of assets
		 * https://github.com/webpack-contrib/terser-webpack-plugin/blob/v1.4.5/src/index.js#L176
		 */
		for (const chunk of compilation.chunks) {
			const hasAsset = chunk.files.indexOf(assetName);
			if (hasAsset > -1) {
				chunk.files.splice(hasAsset, 1, ...newAssetNames);
			}
		}
	}
};

export const reportModuleWarning = (
	module: Module,
	warning: WebpackError,
) => {
	if ('addWarning' in module) {
		module.addWarning(warning);
	} else {
		module.warnings.push(warning);
	}
};

export const reportModuleError = (
	module: Module,
	error: WebpackError,
) => {
	if ('addError' in module) {
		module.addError(error);
	} else {
		module.errors.push(error);
	}
};

export const onFunctionCall = (
	normalModuleFactory: NormalModuleFactory,
	functionNames: string[],
	callback: (
		functionName: string,
		parser: WP5.javascript.JavascriptParser,
		node: SimpleCallExpression,
	) => void,
) => {
	for (const functionName of functionNames) {
		const handler = (parser: WP5.javascript.JavascriptParser) => {
			parser.hooks.call
				.for(functionName)
				.tap(
					name,
					node => callback(
						functionName,
						parser,
						node as SimpleCallExpression,
					),
				);
		};

		normalModuleFactory.hooks.parser
			.for('javascript/auto')
			.tap(name, handler);
		normalModuleFactory.hooks.parser
			.for('javascript/dynamic')
			.tap(name, handler);
		normalModuleFactory.hooks.parser
			.for('javascript/esm')
			.tap(name, handler);
	}
};
