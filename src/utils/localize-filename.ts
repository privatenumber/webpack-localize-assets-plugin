import assert from 'assert';
import {
	LocaleName,
	WP5,
} from '../types';
import {
	isWebpack5Compilation,
} from './webpack';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../../package.json');

export const interpolateLocaleToFileName = (
	compilation: WP5.Compilation,
	replaceWith: LocaleName,
	requireLocaleInFilename?: boolean,
) => {
	const { filename, chunkFilename } = compilation.outputOptions;

	if (requireLocaleInFilename) {
		if (typeof filename === 'string') {
			assert(filename.includes('[locale]'), 'output.filename must include [locale]');
		}

		if (typeof chunkFilename === 'string') {
			assert(chunkFilename.includes('[locale]'), 'output.chunkFilename must include [locale]');
		}
	}

	const interpolateHook = (
		filePath: string | ((data: any) => string),
		data: any,
	) => {
		// Only for WP4. In WP5, the function is already called.
		// WP4: https://github.com/webpack/webpack/blob/758269e/lib/TemplatedPathPlugin.js#L84
		if (typeof filePath === 'function') {
			filePath = filePath(data);
		}

		filePath = filePath.replace(/\[locale\]/g, replaceWith);

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
