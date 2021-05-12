import crypto from 'crypto';
import webpack from 'webpack';
import {
	Webpack,
	Compilation,
	WP5,
} from './types';

export const sha256 = (input: string) => crypto.createHash('sha256').update(input).digest('hex');

export function findSubstringLocations(
	string: string,
	substring: string,
): number[] {
	const indices: number[] = [];
	let index = string.indexOf(substring);

	while (index > -1) {
		indices.push(index);
		index = string.indexOf(substring, index + 1);
	}

	return indices;
}

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
