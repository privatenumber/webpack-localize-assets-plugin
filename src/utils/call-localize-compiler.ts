import type { Identifier } from 'estree';
import type { LocalizeCompiler, LocalizeCompilerContext } from '../types-internal.ts';
import { stringifyAstNode } from './stringify-ast-node.ts';

export const callLocalizeCompiler = <LocalizedData>(
	localizeCompiler: LocalizeCompiler<LocalizedData>,
	context: LocalizeCompilerContext<LocalizedData>,
	localeName: string,
) => {
	const callNodeArguments = context.callNode.arguments.map(stringifyAstNode);
	const functionName = (context.callNode.callee as Identifier).name;
	return localizeCompiler[functionName].call(context, callNodeArguments, localeName);
};
