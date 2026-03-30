import WebpackError from 'webpack/lib/WebpackError.js';
import type {
	Compilation,
	LocalesMap,
	LocalizedStringKey,
} from '../types-internal.ts';
import { name } from '../plugin-name.ts';
import { hasOwn } from './has-own.ts';

export type StringKeysCollection = Set<LocalizedStringKey>;

const getAllKeys = (
	locales: LocalesMap,
) => {
	const allStringKeys: StringKeysCollection = new Set();

	for (const localeName in locales) {
		if (hasOwn(locales, localeName)) {
			for (const stringKey in locales[localeName]) {
				if (hasOwn(locales[localeName], stringKey)) {
					allStringKeys.add(stringKey);
				}
			}
		}
	}

	return allStringKeys;
};

export const warnOnUnusedKeys = (
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
