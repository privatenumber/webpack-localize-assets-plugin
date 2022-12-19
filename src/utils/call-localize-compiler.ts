import type { Identifier } from 'estree';
import { LocalizeCompiler, LocalizeCompilerContext } from '../types-internal.js';
import { stringifyAst } from './stringify-ast.js';

export function callLocalizeCompiler<LocalizedData>(
	localizeCompiler: LocalizeCompiler<LocalizedData>,
	context: LocalizeCompilerContext<LocalizedData>,
	localeName: string,
) {
	const callNodeArguments = context.callNode.arguments.map(stringifyAst);
	const functionName = (context.callNode.callee as Identifier).name;
	return localizeCompiler[functionName].call(context, callNodeArguments, localeName);
}
