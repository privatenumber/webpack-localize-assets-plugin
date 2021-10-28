import assert from 'assert';
import {
	Compilation,
	LocaleName,
} from '../types';
import {
	isWebpack5Compilation,
} from './webpack';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../../package.json');

export const interpolateLocaleToFileName = (
	compilation: Compilation,
	replaceWith: LocaleName,
) => {
	const { filename, chunkFilename } = compilation.outputOptions;

	assert(filename.includes('[locale]'), 'output.filename must include [locale]');
	assert(chunkFilename.includes('[locale]'), 'output.chunkFilename must include [locale]');

	const interpolateHook = (filePath: string) => {
		if (typeof filePath === 'string') {
			filePath = filePath.replace(/\[locale\]/g, replaceWith);
		}

		return filePath;
	};

	if (isWebpack5Compilation(compilation)) {
		compilation.hooks.assetPath.tap(
			name,
			interpolateHook,
		);
	} else {
		// @ts-expect-error Missing assetPath hook from @type
		compilation.mainTemplate.hooks.assetPath.tap(
			name,
			interpolateHook,
		);
	}
};
