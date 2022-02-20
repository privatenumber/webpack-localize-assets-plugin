import type { UnprocessedLocalesMap, LocalesMap } from '../types';
export declare function loadLocales<LocalizedData>(fs: any, unprocessedLocales: UnprocessedLocalesMap<LocalizedData>): {
    locales: LocalesMap<LocalizedData>;
    fileDependencies: Set<string>;
};
