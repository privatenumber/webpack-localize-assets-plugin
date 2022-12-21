import WebpackError from 'webpack/lib/WebpackError.js';
import hasOwnProp from 'has-own-prop';
import type { NormalModule } from 'webpack5';
import type { Expression } from 'estree';
import { LocalizedStringKey } from '../types-internal.js';
import { name } from '../../package.json';
import { reportModuleWarning } from './webpack.js';
import type { LocaleData } from './load-locale-data.js';

export function localizedStringKeyValidator(
	locales: LocaleData,
	throwOnMissing?: boolean,
) {
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
			localeName => !hasOwnProp(locales.data[localeName], stringKey),
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
	};
}
