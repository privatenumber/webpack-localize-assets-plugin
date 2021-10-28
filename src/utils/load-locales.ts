import path from 'path';
import { readFileSync } from 'fs';
import hasOwnProp from 'has-own-prop';
import type {
	UnprocessedLocalesMap,
	LocalesMap,
	LocaleFilePath,
} from '../types';

const loadJson = <T extends {
	readFileSync: typeof readFileSync;
}>(fs: T, jsonPath: string): any | null => {
	const stringContent = fs.readFileSync(jsonPath).toString();
	return JSON.parse(stringContent);
};

export function loadLocales<LocalizedData>(
	fs: any,
	unprocessedLocales: UnprocessedLocalesMap<LocalizedData>,
) {
	const locales: LocalesMap<LocalizedData> = {};
	const fileDependencies = new Set<LocaleFilePath>();

	for (const localeName in unprocessedLocales) {
		if (!hasOwnProp(unprocessedLocales, localeName)) {
			continue;
		}

		const localeValue = unprocessedLocales[localeName];
		if (typeof localeValue === 'string') {
			const resolvedPath = path.resolve(localeValue);
			locales[localeName] = loadJson(fs, resolvedPath);
			fileDependencies.add(resolvedPath);
		} else {
			locales[localeName] = localeValue;
		}
	}

	return {
		locales,
		fileDependencies,
	};
}
