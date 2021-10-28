import WebpackError from 'webpack/lib/WebpackError.js';
import hasOwnProp from 'has-own-prop';
import type { NormalModule } from 'webpack5';
import type { Expression } from 'estree';
import {
	LocalizedStringKey,
	LocalesMap,
} from '../types';
import {
	reportModuleWarning,
} from './webpack';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../../package.json');

export function localizedStringKeyValidator(
	locales: LocalesMap,
	throwOnMissing?: boolean,
) {
	const validatedLocales = new Set<LocalizedStringKey>();

	return {
		assertValidLocaleString(
			stringKey: LocalizedStringKey,
			module: NormalModule,
			node: Expression,
		) {
			if (validatedLocales.has(stringKey)) {
				return;
			}

			validatedLocales.add(stringKey);

			const keyMissingFromLocales = Object.keys(locales).filter(
				locale => !hasOwnProp(locales[locale], stringKey),
			);
			const isMissingFromLocales = keyMissingFromLocales.length > 0;

			if (!isMissingFromLocales) {
				return;
			}

			const location = node.loc!.start;
			const error = new WebpackError(`[${name}] Missing localization for key "${stringKey}" used in ${module.resource}:${location.line}:${location.column} from locales: ${keyMissingFromLocales.join(', ')}`);

			if (error) {
				if (throwOnMissing) {
					throw error;
				} else {
					reportModuleWarning(
						module,
						error,
					);
				}
			}
		},
	};
}
