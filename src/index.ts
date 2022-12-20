import { name } from '../package.json';
import {
	Options,
	validateOptions,
	LocalizeCompiler,
	WP5,
	LocalizeCompilerContext,
} from './types-internal.js';
import { loadLocaleData } from './utils/load-locale-data.js';
import { stringifyAstNode } from './utils/stringify-ast-node';
import { handleSingleLocaleLocalization } from './single-locale.js';
import { handleMultiLocaleLocalization } from './multi-locale/index.js';
import { warnOnUnusedKeys } from './utils/warn-on-unused-keys.js';

const defaultLocalizerName = '__';

function defaultLocalizeCompilerFunction(
	this: LocalizeCompilerContext,
	localizerArguments: string[],
) {
	const [key] = localizerArguments;

	if (localizerArguments.length > 1) {
		let code = stringifyAstNode(this.callNode);

		if (code.length > 80) {
			code = code.slice(0, 80) + '…';
		}
		this.emitWarning(`[${name}] Ignoring confusing usage of localization function: ${code})`);
		return key;
	}

	const keyResolved = this.resolveKey();
	return keyResolved ? JSON.stringify(keyResolved) : key;
}

class LocalizeAssetsPlugin {
	private readonly options: Options;

	private readonly localizeCompiler: LocalizeCompiler;

	constructor(options: Options) {
		validateOptions(options);
		this.options = options;
		this.localizeCompiler = options.localizeCompiler ?? {
			[options.functionName ?? defaultLocalizerName]: defaultLocalizeCompilerFunction,
		};
	}

	apply(compiler: WP5.Compiler) {
		const { options, localizeCompiler } = this;

		compiler.hooks.thisCompilation.tap(
			name,
			(compilation, { normalModuleFactory }) => {
				const locales = loadLocaleData(compiler, options.locales);
				const functionNames = Object.keys(localizeCompiler);
				const trackUsedKeys = (
					options.warnOnUnusedString
						? warnOnUnusedKeys(compilation, locales.data)
						: undefined
				);

				const localizationMode = (
					locales.names.length === 1
						? handleSingleLocaleLocalization
						: handleMultiLocaleLocalization
				);

				localizationMode(
					compilation,
					normalModuleFactory,
					options,
					locales,
					localizeCompiler,
					functionNames,
					trackUsedKeys,
				);
			},
		);
	}

	static defaultLocalizeCompiler: LocalizeCompiler = {
		[defaultLocalizerName]: defaultLocalizeCompilerFunction,
	};
}

export default LocalizeAssetsPlugin;
