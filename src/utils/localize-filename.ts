import assert from 'assert';
import type { Compilation } from '../types-internal.js';
import { replaceAll } from './strings.js';

export const replaceLocaleInAssetName = (
	compilation: Compilation,
	replaceWith: string,
	requireLocaleInFilename?: boolean,
) => {
	const { filename, chunkFilename } = compilation.outputOptions;

	if (requireLocaleInFilename) {
		if (typeof filename === 'string') {
			assert.ok(filename.includes('[locale]'), 'output.filename must include [locale]');
		}

		if (typeof chunkFilename === 'string') {
			assert.ok(chunkFilename.includes('[locale]'), 'output.chunkFilename must include [locale]');
		}
	}

	return (
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		filePath: string | ((data: any) => string),
		data: any, // eslint-disable-line @typescript-eslint/no-explicit-any
	) => {
		/**
		 * Only for WP4. In WP5, the function is already called.
		 * WP4: https://github.com/webpack/webpack/blob/758269e/lib/TemplatedPathPlugin.js#L84
		 */
		if (typeof filePath === 'function') {
			filePath = filePath(data);
		}

		filePath = replaceAll(filePath, '[locale]', replaceWith);

		return filePath;
	};
};
