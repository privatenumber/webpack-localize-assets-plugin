import type WP4 from 'webpack';
import type WP5 from 'webpack5';
import type { SimpleCallExpression } from 'estree';
export declare type LocaleName = string;
export declare type LocaleFilePath = string;
export declare type LocalizedStringKey = string;
export declare type LocaleStrings<LocalizedData> = Record<LocalizedStringKey, LocalizedData>;
export declare type LocalesMap<LocalizedData> = Record<LocaleName, LocaleStrings<LocalizedData>>;
export declare type UnprocessedLocalesMap<LocalizedData> = Record<LocaleName, LocaleFilePath | LocaleStrings<LocalizedData>>;
export declare type Options<LocalizedData = string> = {
    locales: UnprocessedLocalesMap<LocalizedData>;
    functionName?: string;
    throwOnMissing?: boolean;
    sourceMapForLocales?: string[];
    warnOnUnusedString?: boolean;
} & LocalizeCompilerOption<LocalizedData>;
declare type LocalizeCompilerOption<LocalizedData> = LocalizedData extends string ? {
    localizeCompiler?: LocalizeCompiler<LocalizedData>;
} : {
    localizeCompiler: LocalizeCompiler<LocalizedData>;
};
export interface LocalizeCompilerContext<LocalizedData = string> {
    readonly callNode: SimpleCallExpression;
    resolveKey(stringKey?: string): LocalizedData;
    emitWarning(message: string): void;
    emitError(message: string): void;
}
export interface LocalizeCompiler<LocalizedData = string> {
    [functionName: string]: (this: LocalizeCompilerContext<LocalizedData>, functionArgments: string[], localeName: string) => string;
}
export declare function validateOptions<LocalizedData>(options: Options<LocalizedData>): void;
export { WP4, WP5 };
export declare type Webpack = typeof WP4 | typeof WP5;
export declare type Compiler = WP4.Compiler | WP5.Compiler;
export declare type Compilation = WP5.Compilation | WP4.compilation.Compilation;
export declare type NormalModuleFactory = Parameters<WP5.Compiler['newCompilation']>[0]['normalModuleFactory'];
export declare type Module = WP4.compilation.Module | WP5.Module;
