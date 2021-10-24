import type WP4 from 'webpack';
import type WP5 from 'webpack5';
// estree is a types-only package
// eslint-disable-next-line import/no-unresolved
import type * as estree from 'estree';
import hasOwnProp from 'has-own-prop';

export interface Locale<LocalizedData = string> {
	[stringKey: string]: LocalizedData;
}
export interface Locales<LocalizedData = string> {
	[locale: string]: string | Locale<LocalizedData>;
}
export interface LocalizeCompilerContext<LocalizedData = string> {
	localizedData: LocalizedData;
	key: string;
	locale: Locale<LocalizedData>;
	localeName: string;
	locales: Locales<LocalizedData>;
	callExpr: estree.CallExpression;
}
export type Options<LocalizedData = string> = {
	locales: Locales<LocalizedData>;
	functionName?: string;
	throwOnMissing?: boolean;
	sourceMapForLocales?: string[];
	warnOnUnusedString?: boolean;
} & LocalizeCompilerOption<LocalizedData>;

type LocalizeCompiler<LocalizedData>
	= (context: LocalizeCompilerContext<LocalizedData>) => string | estree.Expression;

type LocalizeCompilerOption<LocalizedData>
	= LocalizedData extends string // optional if the localized data is a string
		? { localizeCompiler?: LocalizeCompiler<LocalizedData> }
		: { localizeCompiler: LocalizeCompiler<LocalizedData> };

export type PlaceholderLocation = {
	index: number;
	endIndex: number;
} & ({ expr: estree.CallExpression } | { key: string });

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
}

export { WP4, WP5 };
export type Webpack = typeof WP4 | typeof WP5;
export type Plugin = WP4.Plugin;
export type Compiler = WP4.Compiler | WP5.Compiler;
export type Compilation = WP5.Compilation | WP4.compilation.Compilation;
export type NormalModuleFactory = Parameters<WP5.Compiler['newCompilation']>[0]['normalModuleFactory'];
