import type WP4 from 'webpack';
import type WP5 from 'webpack5';
import * as z from 'zod';
import hasOwnProp from 'has-own-prop';

export type LocaleName = string;
export type LocaleFilePath = string;
export type LocalizedStringKey = string;
export type LocalizedStringValue = string;
export type LocaleStrings = Record<LocalizedStringKey, LocalizedStringValue>;
export type LocalesMap = Record<LocaleName, LocaleStrings>;
export type UnprocessedLocalesMap = Record<LocaleName, LocaleFilePath | LocaleStrings>;

const LocaleSchema = z.record(z.string());
const LocalesSchema = z.record(z.union([LocaleSchema, z.string()])).refine(
	object => Object.keys(object).length > 0,
	{
		message: 'locales must contain at least one locale',
	},
);

export const OptionsSchema = z.object({
	locales: LocalesSchema,
	functionName: z.string().optional(),
	functionNames: z.array(z.string()).nonempty().optional(),
	throwOnMissing: z.boolean().optional(),
	sourceMapForLocales: z.string().array().optional(),
	warnOnUnusedString: z.boolean().optional(),
}).refine(options => (
	!options.sourceMapForLocales
	|| options.sourceMapForLocales.every(locale => hasOwnProp(options.locales, locale))
), {
	message: 'sourceMapForLocales must contain valid locales',
}).refine(
	options => !(options.functionName && options.functionNames),
	{ message: 'Can\'t specify both functionName and functionNames' },
);

export type Options = z.infer<typeof OptionsSchema>;

export { WP4, WP5 };
export type Webpack = typeof WP4 | typeof WP5;
export type Compiler = WP4.Compiler | WP5.Compiler;
export type Compilation = WP5.Compilation | WP4.compilation.Compilation;
export type NormalModuleFactory = Parameters<WP5.Compiler['newCompilation']>[0]['normalModuleFactory'];
export type Module = WP4.compilation.Module | WP5.Module;
