import { LocaleStrings } from '../types';

export function getNestedKey<LocalizedData>(
	key: string,
	localeData: LocaleStrings<LocalizedData>,
) {
	const jsonPath = key.split('.');
	let jsonObject = localeData;
	for (const path of jsonPath) {
		jsonObject = jsonObject && jsonObject[path] as LocaleStrings<LocalizedData>;
	}
	return jsonObject as LocalizedData;
}
