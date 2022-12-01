import { LocaleStrings } from '../types';

/**
 * { error: { notFound: 'Message not found!' } }
 * 		= __('error.notFound')
 *
 * { error: { 'not.found': 'Message not found!' } }
 * 		= __('error.not.found')
 *
 * { error: { 'string.validate': { 'not.found': 'Message not found!' } } }
 * 		= __('error.string.validate.not.found')
 */

export function getNestedKey<LocalizedData>(
	key: string,
	localeData: LocaleStrings<LocalizedData>,
) {
	const jsonPath = key.split('.');
	let currentPath = [];
	let jsonObject = localeData;
	for (const path of jsonPath) {
		if (jsonObject && jsonObject[path]) {
			jsonObject = jsonObject[path] as LocaleStrings<LocalizedData>;
			currentPath = [];
		} else {
			/*
			 * Checks if the joined path equals a key. f.ex. `not.found`
			 */
			currentPath.push(path);
			const currentPathString = currentPath.join('.');
			if (jsonObject && jsonObject[currentPathString]) {
				jsonObject = jsonObject[currentPathString] as LocaleStrings<LocalizedData>;
				currentPath = [];
			}
		}
	}

	if (typeof jsonObject !== 'string') {
		return undefined as LocalizedData;
	}
	return jsonObject as LocalizedData;
}
