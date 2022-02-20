import { Options, Compiler, LocalizeCompiler } from './types';
declare class LocalizeAssetsPlugin<LocalizedData = string> {
    private readonly options;
    private readonly localeNames;
    private readonly singleLocale?;
    private readonly localizeCompiler;
    private readonly functionNames;
    private locales;
    private fileDependencies;
    private trackStringKeys?;
    constructor(options: Options<LocalizedData>);
    apply(compiler: Compiler): void;
    private interceptTranslationFunctionCalls;
    /**
     * For Single locale
     *
     * Insert the localized string during Webpack JS parsing.
     * No need to use placeholder for string replacement on asset.
     */
    private getLocalizedString;
    /**
     * For Multiple locales
     *
     * 1. Replace the `__(...)` call with a placeholder -> `asdf(__(...)) + asdf`
     * 2. After the asset is generated & minified, search and replace the
     * placeholder with calls to localizeCompiler
     * 3. Repeat for each locale
     */
    private getMarkedFunctionPlaceholder;
    static defaultLocalizeCompiler: LocalizeCompiler;
}
export = LocalizeAssetsPlugin;
