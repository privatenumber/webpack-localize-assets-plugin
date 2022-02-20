import type { NormalModule } from 'webpack5';
import type { Expression } from 'estree';
import { LocalizedStringKey, LocalesMap } from '../types';
export declare function localizedStringKeyValidator<LocalizedData>(locales: LocalesMap<LocalizedData>, throwOnMissing?: boolean): {
    assertValidLocaleString(stringKey: LocalizedStringKey, module: NormalModule, node: Expression): void;
};
