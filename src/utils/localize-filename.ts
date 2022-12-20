import assert from 'assert';
import { Compilation } from '../types-internal.js';

const localePlaceholderPattern = /\[locale\]/g;

export const replaceLocaleInAssetName = (
	compilation: Compilation,
	replaceWith: string,
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

	return (
		filePath: string | ((data: any) => string),
		data: any,
	) => {
		/**
		 * Only for WP4. In WP5, the function is already called.
		 * WP4: https://github.com/webpack/webpack/blob/758269e/lib/TemplatedPathPlugin.js#L84
		 */
		if (typeof filePath === 'function') {
			filePath = filePath(data);
		}

		filePath = filePath.replace(localePlaceholderPattern, replaceWith);

		return filePath;
	};
};
