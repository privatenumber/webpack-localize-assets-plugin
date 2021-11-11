import { LocalizeCompiler, LocalizeCompilerContext } from '../types';
import { printAST } from './print-ast';

export function callLocalizeCompiler<LocalizedData>(
	localizeCompiler: LocalizeCompiler<LocalizedData>,
	context: LocalizeCompilerContext<LocalizedData>,
	localeName: string,
) {
	const callNodeArguments = context.callNode.arguments.map(x => printAST(x));
	return localizeCompiler.call(context, callNodeArguments, localeName);
}
