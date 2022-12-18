export const localesEmpty = Object.freeze({});

export const localesSingle = Object.freeze({
	en: {
		'hello-key': 'Hello',
	},
});

const stringWithDoubleQuotes = '"double " quotes"';
const stringWithSingleQuotes = "'single ' quotes'";

export const localesMulti = Object.freeze({
	en: {
		'hello-key': 'Hello',
		stringWithDoubleQuotes,
		stringWithSingleQuotes,
	},
	es: {
		'hello-key': 'Hola',
		stringWithDoubleQuotes,
		stringWithSingleQuotes,
	},
	ja: {
		'hello-key': 'こんにちは',
		stringWithDoubleQuotes,
		stringWithSingleQuotes,
	},
});
