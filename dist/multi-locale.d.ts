import type { SimpleCallExpression } from 'estree';
import { Compilation, LocalesMap, LocaleName, LocalizeCompiler } from './types';
import type { StringKeysCollection } from './utils/track-unused-localized-strings';
declare type Range = {
    start: number;
    end?: number;
};
export declare type PlaceholderLocation = {
    range: Range;
    node: SimpleCallExpression;
};
export declare const fileNameTemplatePlaceholder: string;
export declare function markLocalizeFunction(callExpression: SimpleCallExpression): string;
export declare function generateLocalizedAssets<LocalizedData>(compilation: Compilation, localeNames: LocaleName[], locales: LocalesMap<LocalizedData>, sourceMapForLocales: LocaleName[], trackStringKeys: StringKeysCollection | undefined, localizeCompiler: LocalizeCompiler<LocalizedData>): void;
export {};
