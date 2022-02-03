import type WP4 from 'webpack';
import type WP5 from 'webpack5';
import type { SimpleCallExpression } from 'estree';
import hasOwnProp from 'has-own-prop';

export type LocaleName = string;
export type LocaleFilePath = string;
export type LocalizedStringKey = string;
export type LocaleStrings<LocalizedData> = Record<LocalizedStringKey, LocalizedData>;
export type LocalesMap<LocalizedData> = Record<LocaleName, LocaleStrings<LocalizedData>>;
export type UnprocessedLocalesMap<LocalizedData> = Record<
	LocaleName,
	LocaleFilePath | LocaleStrings<LocalizedData>
>;

export type Options<LocalizedData = string> = {
	locales: UnprocessedLocalesMap<LocalizedData>;
	functionName?: string;
	throwOnMissing?: boolean;
	sourceMapForLocales?: string[];
	warnOnUnusedString?: boolean;
	throwOnMissingLocaleInFileName?: boolean;
} & LocalizeCompilerOption<LocalizedData>;

type LocalizeCompilerOption<LocalizedData>
	= LocalizedData extends string // optional if the localized data is a string
		? { localizeCompiler?: LocalizeCompiler<LocalizedData> }
		: { localizeCompiler: LocalizeCompiler<LocalizedData> };

export interface LocalizeCompilerContext<LocalizedData = string> {
	readonly callNode: SimpleCallExpression;
	resolveKey(stringKey?: string): LocalizedData;
	emitWarning(message: string): void;
	emitError(message: string): void;
}

export interface LocalizeCompiler<LocalizedData = string> {
	[functionName: string]: (
		this: LocalizeCompilerContext<LocalizedData>,
		functionArgments: string[],
		localeName: string,
	) => string;
}

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
