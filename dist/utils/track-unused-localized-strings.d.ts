import { Compilation, LocalesMap, LocalizedStringKey } from '../types';
export declare type StringKeysCollection = Set<LocalizedStringKey>;
export declare function getAllLocalizedStringKeys<LocalizedData>(locales: LocalesMap<LocalizedData>): StringKeysCollection;
export declare const warnOnUnusedLocalizedStringKeys: (unusedStringKeys: StringKeysCollection, compilation: Compilation) => void;
