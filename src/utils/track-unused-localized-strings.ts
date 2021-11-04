import WebpackError from 'webpack/lib/WebpackError.js';
import hasOwnProp from 'has-own-prop';
import {
	Compilation,
	LocalesMap,
	LocalizedStringKey,
} from '../types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../../package.json');

export type StringKeysCollection = Set<LocalizedStringKey>;

export function getAllLocalizedStringKeys(locales: LocalesMap) {
	const allStringKeys: StringKeysCollection = new Set();

	for (const localeName in locales) {
		if (hasOwnProp(locales, localeName)) {
			for (const stringKey in locales[localeName]) {
				if (hasOwnProp(locales[localeName], stringKey)) {
					allStringKeys.add(stringKey);
				}
			}
		}
	}

	return allStringKeys;
}

export const warnOnUnusedLocalizedStringKeys = (
	unusedStringKeys: StringKeysCollection,
	compilation: Compilation,
) => {
	if (unusedStringKeys.size > 0) {
		for (const unusedStringKey of unusedStringKeys) {
			const error = new WebpackError(`[${name}] Unused string key "${unusedStringKey}"`);
			compilation.warnings.push(error);
		}
	}
};
