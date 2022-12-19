import assert from 'assert';
import {
	LocaleName,
	Compilation,
} from '../types-internal.js';

export const interpolateLocaleToFileName = (
	compilation: Compilation,
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

	return (
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
};
