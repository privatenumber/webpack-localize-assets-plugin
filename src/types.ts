import type WP4 from 'webpack';
import type WP5 from 'webpack5';
import hasOwnProp from 'has-own-prop';

export type LocaleName = string;
export type LocaleFilePath = string;
export type LocalizedStringKey = string;
export type LocaleStrings = Record<LocalizedStringKey, unknown>;
export type LocalesMap = Record<LocaleName, LocaleStrings>;
export type UnprocessedLocalesMap = Record<LocaleName, LocaleFilePath | LocaleStrings>;

export interface Options {
	locales: UnprocessedLocalesMap;
	functionName?: string;
	throwOnMissing?: boolean;
	sourceMapForLocales?: string[];
	warnOnUnusedString?: boolean;
}

export type PlaceholderLocations = {
	stringKey: string;
	index: number;
	endIndex: number;
}[];

export function validateOptions(options: Options): void {
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
}

export { WP4, WP5 };
export type Webpack = typeof WP4 | typeof WP5;
export type Compiler = WP4.Compiler | WP5.Compiler;
export type Compilation = WP5.Compilation | WP4.compilation.Compilation;
export type NormalModuleFactory = Parameters<WP5.Compiler['newCompilation']>[0]['normalModuleFactory'];
export type Module = WP4.compilation.Module | WP5.Module;
