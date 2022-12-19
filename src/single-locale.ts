import WebpackError from 'webpack/lib/WebpackError.js';
import { LocalizeCompiler } from './types.js';
import { StringKeysCollection } from './utils/warn-on-unused-keys.js';
import {
	reportModuleWarning,
	reportModuleError,
} from './utils/webpack.js';
import { callLocalizeCompiler } from './utils/call-localize-compiler.js';
import type { StringKeyHit } from './utils/on-localizer-call.js';
import type { LocaleData } from './utils/load-locale-data.js';

/**
 * For Single locale
 *
 * Insert the localized string during Webpack JS parsing.
 * No need to use placeholder for string replacement on asset.
 */
export const getLocalizedString = (
	trackStringKeys: StringKeysCollection | undefined,
	localizeCompiler: LocalizeCompiler,
	{ data }: LocaleData,
	stringKeyHit: StringKeyHit,
	localeName: string,
): string => {
	trackStringKeys?.delete(stringKeyHit.key);

	return callLocalizeCompiler(
		localizeCompiler,
		{
			callNode: stringKeyHit.callExpressionNode,
			resolveKey: (stringKey = stringKeyHit.key) => data[localeName][stringKey],
			emitWarning: message => reportModuleWarning(stringKeyHit.module, new WebpackError(message)),
			emitError: message => reportModuleError(stringKeyHit.module, new WebpackError(message)),
		},
		localeName,
	);
};
