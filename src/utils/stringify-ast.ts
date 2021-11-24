import { generate } from 'astring';
import type { Node } from 'estree';

const astringOptions = Object.freeze({ indent: '', lineEnd: '' });

export const stringifyAst = (ast: Node) => generate(ast, astringOptions);
