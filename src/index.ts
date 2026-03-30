import {
	type Options,
	validateOptions,
	type LocalizeCompiler,
	type WP5,
	type LocalizeCompilerContext,
} from './types-internal.ts';
import { loadLocaleData } from './utils/load-locale-data.ts';
import { stringifyAstNode } from './utils/stringify-ast-node.ts';
import { handleSingleLocaleLocalization } from './single-locale.ts';
import { handleMultiLocaleLocalization } from './multi-locale/index.ts';
import { warnOnUnusedKeys } from './utils/warn-on-unused-keys.ts';

const name = 'webpack-localize-assets-plugin';

const defaultLocalizerName = '__';

function defaultLocalizeCompilerFunction(
	this: LocalizeCompilerContext,
	localizerArguments: string[],
) {
	const [key] = localizerArguments;

	if (localizerArguments.length > 1) {
		let code = stringifyAstNode(this.callNode);

		if (code.length > 80) {
			code = `${code.slice(0, 80)}…`;
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
