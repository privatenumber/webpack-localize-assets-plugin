import path from 'path';
import type { readFileSync } from 'fs';
import type {
	Compiler,
	UnprocessedLocalesMap,
	LocaleName,
	LocalesMap,
	LocaleFilePath,
} from '../types-internal.ts';
import { hasOwn } from './has-own.ts';

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
		if (!hasOwn(unprocessedLocales, localeName)) {
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
