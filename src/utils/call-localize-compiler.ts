import { LocalizeCompiler, LocalizeCompilerContext } from '../types';
import { stringifyAst } from './stringify-ast';

export function callLocalizeCompiler<LocalizedData>(
	localizeCompiler: LocalizeCompiler<LocalizedData>,
	context: LocalizeCompilerContext<LocalizedData>,
	localeName: string,
) {
	const callNodeArguments = context.callNode.arguments.map(stringifyAst);
	return localizeCompiler.call(context, callNodeArguments, localeName);
}
