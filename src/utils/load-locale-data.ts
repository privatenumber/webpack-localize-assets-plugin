import path from 'path';
import type { readFileSync } from 'fs';
import hasOwnProp from 'has-own-prop';
import type {
	Compiler,
	UnprocessedLocalesMap,
	LocaleName,
	LocalesMap,
	LocaleFilePath,
} from '../types-internal.js';

type FSLike = {
	readFileSync: typeof readFileSync;
};

const readJsonFile = (
	fs: FSLike,
	jsonPath: string,
) => {
	const stringContent = fs.readFileSync(jsonPath).toString();
	return JSON.parse(stringContent);
};

export type LocaleData = {
	names: LocaleName[];
	data: LocalesMap;
	paths: Set<LocaleFilePath>;
};

export const loadLocaleData = (
	{ inputFileSystem }: Compiler,
	unprocessedLocales: UnprocessedLocalesMap,
): LocaleData => {
	const data: LocalesMap = {};
	const paths = new Set<LocaleFilePath>();

	for (const localeName in unprocessedLocales) {
		if (!hasOwnProp(unprocessedLocales, localeName)) {
			continue;
		}

		const localeValue = unprocessedLocales[localeName];
		if (typeof localeValue === 'string') {
			const resolvedPath = path.resolve(localeValue);
			data[localeName] = readJsonFile(inputFileSystem as unknown as FSLike, resolvedPath);
			paths.add(resolvedPath);
		} else {
			data[localeName] = localeValue;
		}
	}

	return {
		names: Object.keys(data),
		data,
		paths,
	};
};
