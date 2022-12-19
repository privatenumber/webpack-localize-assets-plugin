import WebpackError from 'webpack/lib/WebpackError.js';
import type { SimpleCallExpression } from 'estree';
import { name } from '../../package.json';
import {
	WP5,
	NormalModuleFactory,
	Options,
} from '../types-internal.js';
import {
	toConstantDependency,
	reportModuleWarning,
	onFunctionCall,
} from './webpack.js';
import type { LocaleData } from './load-locale-data.js';
import { localizedStringKeyValidator } from './localized-string-key-validator.js';

export type StringKeyHit = {
	key: string;
	callExpressionNode: SimpleCallExpression;
	module: WP5.NormalModule;
};

type onLocalizerCallCallback = (stringKeyHit: StringKeyHit) => string | undefined;

export const onLocalizerCall = (
	normalModuleFactory: NormalModuleFactory,
	functionNames: string[],
	callback: onLocalizerCallCallback,
) => {
	onFunctionCall(
		normalModuleFactory,
		functionNames,
		(functionName, parser, callExpressionNode) => {
			const { module } = parser.state;
			const firstArgument = callExpressionNode.arguments[0];

			// Enforce minimum requirement that first argument is a string
			if (
				!(
					callExpressionNode.arguments.length > 0
					&& firstArgument.type === 'Literal'
					&& typeof firstArgument.value === 'string'
				)
			) {
				const location = callExpressionNode.loc!.start;
				reportModuleWarning(
					module,
					new WebpackError(`[${name}] Ignoring confusing usage of localization function "${functionName}" in ${module.resource}:${location.line}:${location.column}`),
				);
				return;
			}

			const replacement = callback({
				key: firstArgument.value,
				callExpressionNode,
				module,
			});

			if (replacement) {
				toConstantDependency(parser, replacement)(callExpressionNode);
				return true;
			}
		},
	);
};

export const onStringKey = (
	locales: LocaleData,
	options: Options,
	callback: onLocalizerCallCallback,
): onLocalizerCallCallback => {
	const assertKeyExists = localizedStringKeyValidator(locales, options.throwOnMissing);

	return (stringKeyHit) => {
		assertKeyExists(
			stringKeyHit.key,
			stringKeyHit.module,
			stringKeyHit.callExpressionNode,
		);

		for (const fileDependency of locales.paths) {
			stringKeyHit.module.buildInfo.fileDependencies.add(fileDependency);
		}

		return callback(stringKeyHit);
	};
};
