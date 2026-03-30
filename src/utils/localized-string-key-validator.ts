import WebpackError from 'webpack/lib/WebpackError.js';
import type { NormalModule } from 'webpack5';
import type { Expression } from 'estree';
import type { LocalizedStringKey } from '../types-internal.ts';
import { name } from '../plugin-name.ts';
import { reportModuleWarning } from './webpack.ts';
import type { LocaleData } from './load-locale-data.ts';
import { hasOwn } from './has-own.ts';

export const localizedStringKeyValidator = (
	locales: LocaleData,
	throwOnMissing?: boolean,
) => {
	const validatedKeys = new Set<LocalizedStringKey>();

	return (
		stringKey: LocalizedStringKey,
		module: NormalModule,
		node: Expression,
	) => {
		if (validatedKeys.has(stringKey)) {
			return;
		}

		validatedKeys.add(stringKey);

		const keyMissingFromLocales = locales.names.filter(
			localeName => !hasOwn(locales.data[localeName], stringKey),
		);
		const isMissingFromLocales = keyMissingFromLocales.length > 0;

		if (!isMissingFromLocales) {
			return;
		}

		const location = node.loc!.start;
		const error = new WebpackError(`[${name}] Missing localization for key "${stringKey}" used in ${module.resource}:${location.line}:${location.column} from locales: ${keyMissingFromLocales.join(', ')}`);

		if (throwOnMissing) {
			throw error;
		}

		reportModuleWarning(module, error);
	};
};
