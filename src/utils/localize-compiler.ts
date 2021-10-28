import { LocalizeCompiler, LocalizeCompilerContext } from '../types';
import { printAST } from './print-ast';

export function callLocalizeCompiler<LocalizedData>(
	localizeCompiler: LocalizeCompiler<LocalizedData>,
	context: LocalizeCompilerContext<LocalizedData>,
) {
	const result = localizeCompiler(context);

	return typeof result === 'string'
		? result
		: printAST(result);
}
