import { generate } from 'astring';

export const stringifyAstNode = (
	node: Parameters<typeof generate>[0],
) => generate(node, {
	indent: '',
	lineEnd: '',
});
