import WebpackError from 'webpack/lib/WebpackError.js';
import hasOwnProp from 'has-own-prop';
import type {
	Compilation,
	LocalesMap,
	LocalizedStringKey,
} from '../types.js';
import { name } from '../../package.json';

export type StringKeysCollection = Set<LocalizedStringKey>;

function getAllKeys(
	locales: LocalesMap,
) {
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

export const warnOnUnsuedKeys = (
	compilation: Compilation,
	locales: LocalesMap,
) => {
	const unusedKeys = getAllKeys(locales);

	/**
	 * Using something like compiler.done happens
	 * too late after the stats are reported in watch mode
	 */
	compilation.hooks.afterSeal.tap(
		name,
		() => {
			if (unusedKeys.size === 0) {
				return;
			}

			for (const unusedStringKey of unusedKeys) {
				const error = new WebpackError(`[${name}] Unused string key "${unusedStringKey}"`);
				compilation.warnings.push(error);
			}
		},
	);

	return unusedKeys;
};
