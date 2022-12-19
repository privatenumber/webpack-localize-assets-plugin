import WebpackError from 'webpack/lib/WebpackError.js';
import {
	reportModuleWarning,
	reportModuleError,
} from './utils/webpack.js';
import { callLocalizeCompiler } from './utils/call-localize-compiler.js';
import type { LocaleData } from './utils/load-locale-data.js';
import {
	onLocalizerCall,
	onStringKey,
} from './utils/on-localizer-call.js';
import {
	Options,
	LocalizeCompiler,
	WP5,
	NormalModuleFactory,
} from './types-internal.js';
import { onAssetPath } from './utils/webpack.js';
import { interpolateLocaleToFileName } from './utils/localize-filename.js';

export const handleSingleLocaleLocalization = (
	compilation: WP5.Compilation,
	normalModuleFactory: NormalModuleFactory,
	options: Options,
	locales: LocaleData,
	localizeCompiler: LocalizeCompiler,
	functionNames: string[],
	trackUsedKeys?: Set<string>,
) => {
	const [localeName] = locales.names;

	onLocalizerCall(
		normalModuleFactory,
		functionNames,
		onStringKey(
			locales,
			options,
			({ key, callNode, module }) => {
				trackUsedKeys?.delete(key);

				return callLocalizeCompiler(
					localizeCompiler,
					{
						callNode,
						resolveKey: (stringKey = key) => locales.data[localeName][stringKey],
						emitWarning: message => reportModuleWarning(module, new WebpackError(message)),
						emitError: message => reportModuleError(module, new WebpackError(message)),
					},
					localeName,
				);
			},
		),
	);

	onAssetPath(
		compilation,
		interpolateLocaleToFileName(
			compilation,
			localeName,
		),
	);
};
