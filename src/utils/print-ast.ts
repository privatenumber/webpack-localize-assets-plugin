import astring from 'astring';
import type { Node } from 'estree';

const astringOptions = Object.freeze({ indent: '', lineEnd: '' });

export function printAST(ast: Node) {
	return astring.generate(ast, astringOptions);
}
