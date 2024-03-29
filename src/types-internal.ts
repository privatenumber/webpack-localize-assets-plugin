import type WP4 from 'webpack';
import type WP5 from 'webpack5';
import hasOwnProp from 'has-own-prop';
import type {
	LocaleName,
	LocaleStrings,
	Options,
} from './types-external.js';

export * from './types-external.js';

export function validateOptions<LocalizedData>(options: Options<LocalizedData>): void {
	if (!options) {
		throw new Error('Options are required');
	}
	if (!options.locales) {
		throw new Error('Locales are required');
	}
	if (Object.keys(options.locales).length === 0) {
		throw new Error('locales must contain at least one locale');
	}
	if (options.sourceMapForLocales
		&& options.sourceMapForLocales.some(locale => !hasOwnProp(options.locales, locale))) {
		throw new Error('sourceMapForLocales must contain valid locales');
	}
	if (options.localizeCompiler) {
		if (Object.keys(options.localizeCompiler).length === 0) {
			throw new Error('localizeCompiler can\'t be an empty object');
		}
		if (options.functionName) {
			throw new Error('Can\'t use localizeCompiler and also specify functionName');
		}
	}
}

export { WP4, WP5 };
export type Webpack = typeof WP4 | typeof WP5;
export type Compiler = WP4.Compiler | WP5.Compiler;
export type Compilation = WP5.Compilation | WP4.compilation.Compilation;
export type NormalModuleFactory = Parameters<WP5.Compiler['newCompilation']>[0]['normalModuleFactory'];
export type Module = WP4.compilation.Module | WP5.Module;

export type LocalesMap<LocalizedData = string> = Record<LocaleName, LocaleStrings<LocalizedData>>;

export type Location = {
	start: number;
	end: number;
};
