import { SimpleCallExpression } from 'estree';

type LocaleName = string;
type LocaleFilePath = string;
type LocalizedStringKey = string;
type LocaleStrings<LocalizedData> = Record<LocalizedStringKey, LocalizedData>;
type UnprocessedLocalesMap<LocalizedData = string> = Record<
	LocaleName,
	LocaleFilePath | LocaleStrings<LocalizedData>
>;

type Options<LocalizedData = string> = {
	locales: UnprocessedLocalesMap<LocalizedData>;
	functionName?: string;
	throwOnMissing?: boolean;
	sourceMapForLocales?: string[];
	warnOnUnusedString?: boolean;
} & LocalizeCompilerOption<LocalizedData>;

type LocalizeCompilerOption<LocalizedData>
	= LocalizedData extends string // optional if the localized data is a string
		? { localizeCompiler?: LocalizeCompiler<LocalizedData> }
		: { localizeCompiler: LocalizeCompiler<LocalizedData> };

interface LocalizeCompilerContext<LocalizedData = string> {
	readonly callNode: SimpleCallExpression;
	resolveKey(stringKey?: string): LocalizedData;
	emitWarning(message: string): void;
	emitError(message: string): void;
}

interface LocalizeCompiler<LocalizedData = string> {
	[functionName: string]: (
		this: LocalizeCompilerContext<LocalizedData>,
		functionArgments: string[],
		localeName: string,
	) => string;
}

declare class LocalizeAssetsPlugin<LocalizedData = string> {
	constructor(options: Options<LocalizedData>);

	apply(compiler: any): void;
}

export { LocalizeAssetsPlugin as default };
