export const localesEmpty = Object.freeze({});

const stringWithDoubleQuotes = '"double " quotes"';
const stringWithSingleQuotes = "'single ' quotes'";

export const specialKey = '"\' \\ \\\\"';

export const localesSingle = Object.freeze({
	en: {
		'hello-key': 'Hello',
		stringWithDoubleQuotes,
		stringWithSingleQuotes,
		[specialKey]: 'key with special characters',
	},
});

export const localesMulti = Object.freeze({
	en: {
		'hello-key': 'Hello',
		stringWithDoubleQuotes,
		stringWithSingleQuotes,
		[specialKey]: 'key with special characters',
	},
	es: {
		'hello-key': 'Hola',
		stringWithDoubleQuotes,
		stringWithSingleQuotes,
		[specialKey]: 'key with special characters',
	},
	ja: {
		'hello-key': 'こんにちは',
		stringWithDoubleQuotes,
		stringWithSingleQuotes,
		[specialKey]: 'key with special characters',
	},
});
